#!/usr/bin/env node
/**
 * `OPS-05` —— 法律文件發布的 **dry-run 前置檢查工具**。
 *
 *   node Backend/scripts/legal-publication-preflight.js --help
 *
 * ## 這支腳本**沒有寫入路徑**
 *
 * 它不 import `publish()`、不發 POST、也不開任何可寫的 DB 連線。
 * 對資料庫只有一次唯讀查詢（讀目前的 current version）。
 * **因此無論參數怎麼下，它都不可能發布任何法律文件。**
 *
 * 這是刻意的設計取捨。加一個 `--publish` 旗標會讓「不小心發布」重新變成可能，
 * 而發布本身是**一次性、無自動 rollback**的動作（見 runbook）。
 * 真正的發布仍然是一個需要 admin token 的、明確的 API 呼叫 ——
 * 這支腳本的工作是在那之前把所有能機器檢查的東西檢查完，並印出**確切**要送的請求。
 *
 * ## 輸出的兩條判定線
 *
 * ```text
 * TECHNICAL VALIDATION   —— 這裡能判斷
 * EXTERNAL APPROVAL      —— 這裡不能判斷，只記錄 operator 提供的證據
 * ```
 *
 * 兩者是分開的，且**不會合併成一個「可以發布了」的綠燈**。
 * 目前 `docs/legal-drafts/*.draft.md` 四份草稿都還帶著
 * `DRAFT — NOT LAWYER APPROVED` 標記，因此一定會被判為 blocked ——
 * 那是正確行為，不是工具壞了。
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { DOCUMENT_TYPES } = require("../services/legalDocument.service");
const { PUBLISH_REASONS } = require("../utils/legalDocumentPublishPolicy");
const { preflight } = require("../utils/legalPublicationPreflight");

const FLAGS = [
  ["--type", "documentType", `document type (${DOCUMENT_TYPES.join(" | ")})`],
  ["--version", "version", "version identifier, e.g. 1 (integer sequence per DEC-LEGAL-05)"],
  ["--source", "source", "path to the approved document source file"],
  ["--effective-date", "effectiveDate", "YYYY-MM-DD"],
  ["--requires-reconsent", "requiresReconsent", "true | false — explicit, never derived"],
  ["--reason-code", "reasonCode", `operational reason (${PUBLISH_REASONS.join(" | ")})`],
  ["--note", "note", "required when --reason-code is 'other'"],
  ["--lawyer-approval-ref", "lawyerApprovalRef", "auditable reference to the lawyer approval"],
  ["--accountant-approval-ref", "accountantApprovalRef", "auditable reference, when applicable"],
];

const BOOLEAN_FLAGS = [
  ["--accountant-review-required", "accountantReviewRequired"],
  ["--acknowledge-external-review", "acknowledgeExternalReview"],
];

function usage() {
  const lines = [
    "",
    "  legal-publication-preflight — DRY RUN ONLY. Cannot publish anything.",
    "",
    "  Usage:",
    "    node Backend/scripts/legal-publication-preflight.js [options]",
    "",
    "  Options:",
  ];
  for (const [flag, , desc] of FLAGS) lines.push(`    ${flag.padEnd(30)} ${desc}`);
  for (const [flag] of BOOLEAN_FLAGS) lines.push(`    ${flag.padEnd(30)} (boolean)`);
  lines.push(
    "",
    "  This tool validates prerequisites and prints the request that WOULD be sent.",
    "  Publication itself is a separate, deliberate admin API call — see",
    "  docs/local-development-and-operations.md (legal document publication runbook).",
    ""
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const boolMatch = BOOLEAN_FLAGS.find(([f]) => f === arg);
    if (boolMatch) {
      out[boolMatch[1]] = true;
      continue;
    }
    const match = FLAGS.find(([f]) => f === arg);
    if (match) {
      out[match[1]] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

/** `--requires-reconsent` 由 CLI 進來一定是字串；只接受 "true"/"false"，其餘保持原值讓驗證擋下。 */
function parseTriState(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw; // undefined 或任何其他字串 → 交給 checkRequiresReconsent 拒絕
}

function section(title) {
  return `\n  ${title}\n  ${"-".repeat(title.length)}`;
}

async function readCurrentPublished(documentType) {
  // 唯讀。失敗不致命 —— 這只是給 operator 的脈絡資訊。
  try {
    const db = require("../config/db");
    const { rows } = await db.query(
      `SELECT version, effective_date, published_at
         FROM legal_documents
        WHERE document_type = $1 AND publication_status = 'published'
        LIMIT 1`,
      [documentType]
    );
    return { ok: true, current: rows[0] || null, database: process.env.PGDATABASE || "(default)" };
  } catch (err) {
    return { ok: false, error: err.message, database: process.env.PGDATABASE || "(default)" };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const args = parseArgs(argv);

  let body = null;
  let sourceError = null;
  if (args.source) {
    try {
      body = fs.readFileSync(path.resolve(process.cwd(), args.source), "utf8");
    } catch (err) {
      sourceError = err.message;
    }
  }

  const request = {
    documentType: args.documentType,
    version: args.version,
    body,
    effectiveDate: args.effectiveDate,
    requiresReconsent: parseTriState(args.requiresReconsent),
    reasonCode: args.reasonCode,
    note: args.note,
    lawyerApprovalRef: args.lawyerApprovalRef,
    accountantApprovalRef: args.accountantApprovalRef,
    accountantReviewRequired: args.accountantReviewRequired === true,
    acknowledgeExternalReview: args.acknowledgeExternalReview === true,
  };

  const result = preflight(request);

  console.log(section("INPUT"));
  console.log(`    document type   : ${args.documentType ?? "(missing)"}`);
  console.log(`    version         : ${args.version ?? "(missing)"}`);
  console.log(`    source          : ${args.source ?? "(missing)"}`);
  if (sourceError) console.log(`    source read     : FAILED — ${sourceError}`);
  else if (body !== null) console.log(`    source read     : ok (${body.length} chars)`);
  console.log(`    effective date  : ${args.effectiveDate ?? "(missing)"}`);
  console.log(`    requiresReconsent: ${args.requiresReconsent ?? "(missing)"}`);
  console.log(`    reason code     : ${args.reasonCode ?? "(missing)"}`);

  const dbInfo = args.documentType ? await readCurrentPublished(args.documentType) : null;
  if (dbInfo) {
    console.log(section("TARGET STATE (read-only)"));
    console.log(`    database        : ${dbInfo.database}`);
    if (!dbInfo.ok) {
      console.log(`    current version : (could not read — ${dbInfo.error})`);
    } else if (dbInfo.current) {
      console.log(`    current version : ${dbInfo.current.version} (would become superseded)`);
    } else {
      console.log("    current version : none — this would be the first published version");
    }
  }

  console.log(section("TECHNICAL VALIDATION"));
  if (result.technical.ok) {
    console.log("    PASSED — the request is technically well-formed");
  } else {
    console.log("    FAILED");
    for (const f of result.technical.failures) console.log(`      - [${f.code}] ${f.message}`);
  }

  console.log(section("EXTERNAL APPROVAL"));
  console.log("    This tool cannot verify legal or accounting approval. It only records");
  console.log("    what the operator supplied, and refuses to proceed when evidence is absent.");
  if (result.externalApproval.ok) {
    console.log(`    lawyer approval ref     : ${args.lawyerApprovalRef}`);
    if (args.accountantApprovalRef) {
      console.log(`    accountant approval ref : ${args.accountantApprovalRef}`);
    }
    console.log("    operator acknowledgement: given");
  } else {
    console.log("    UNRESOLVED");
    for (const b of result.externalApproval.blockers) console.log(`      - [${b.code}] ${b.message}`);
  }

  console.log(section("RESULT"));
  if (result.readyToPublish) {
    console.log("    Technical prerequisites are satisfied AND the operator has attested to");
    console.log("    external approval. This is NOT a legal determination.");
    console.log("");
    console.log("    The publish request that WOULD be sent (run it deliberately):");
    console.log("");
    console.log(`      POST /admin/legal-documents/<approved-document-id>/publish`);
    console.log(
      `      ${JSON.stringify({
        requiresReconsent: request.requiresReconsent,
        reasonCode: request.reasonCode,
        ...(request.note ? { note: request.note } : {}),
      })}`
    );
  } else {
    console.log("    NOT READY — see the blockers above.");
  }

  console.log("\n  DRY RUN — NO LEGAL DOCUMENT WAS PUBLISHED\n");

  // 非零 exit 讓它能被 CI／runbook 當成 gate 使用。
  process.exit(result.readyToPublish ? 0 : 1);
}

main().catch((err) => {
  console.error("legal-publication-preflight failed:", err);
  console.error("\n  DRY RUN — NO LEGAL DOCUMENT WAS PUBLISHED\n");
  process.exit(2);
});
