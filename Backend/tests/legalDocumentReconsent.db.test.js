/**
 * `SCHEMA-03` —— `legal_documents.requires_reconsent` 的不變條件。
 *
 * Owner decision `DEC-LEGAL-06`（2026-08-27）。這個檔案要釘住六件事：
 *
 *   1. **schema 形狀** —— BOOLEAN、NOT NULL、**且沒有 DB DEFAULT**。
 *      沒有 DEFAULT 是重點：`DEFAULT false` 會讓「沒人回答過」被靜默寫成
 *      一個看起來像答案的 `false`，事後稽核再也分不出兩者。
 *   2. **publish 必須顯式決定** —— 缺少／`null`／`"true"`／`"false"`／數字／
 *      物件一律 validation failure，且**即使草稿已經有值也一樣要再給一次**。
 *   3. **persistence** —— 給 `true` 就是 `true`，給 `false` 就是 `false`，
 *      沒有中途被轉換或吞掉。
 *   4. **immutability** —— published 之後 true↔false 皆不得改寫，
 *      由 DB trigger 保證（trigger 是**顯式欄位白名單**，本欄位必須在名單內）。
 *   5. **audit** —— 真實的 publish 路由必須留下可回答
 *      「誰／何時／哪份文件哪一版／requires_reconsent 是什麼」的紀錄。
 *   6. **語意邊界** —— 這是 enforcement metadata，不是法律認定：
 *      不得出現 material/non_material 之類的分類欄位，
 *      也不得從 `version` 推導 re-consent。
 *
 * 既有的 `legalDocuments.db.test.js` 仍負責 registry 本身的不變條件；
 * 本檔只加 `requires_reconsent` 這一維，不重複那邊已經證明的事。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const legal = require("../services/legalDocument.service");

/*
 * `OPS-03`：publish 另外要求標準化營運理由。本檔鎖的是 `requires_reconsent`，
 * 因此固定用一個合法代碼，讓兩者互不干擾 —— 這本身也證明了
 * **同一個 reasonCode 可以搭配 true 或 false**（見下方 persistence 測試）。
 */
const PUBLISH_REASON = "administrative_correction";

const created = [];
const createdUsers = [];
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;

/** 本檔的版本前綴，與其他檔案的 fixture 不相撞。 */
function version(label) {
  return `rc-${label}-${process.pid}-${(seq += 1)}`;
}

async function makeDraft(overrides = {}) {
  const result = await legal.createDraft({
    documentType: "terms",
    version: version("v"),
    body: "測試條文內容\n\n第二段。",
    effectiveDate: "2026-01-01",
    requiresReconsent: false,
    ...overrides,
  });
  if (result.ok) created.push(result.document.id);
  return result;
}

async function makeApproved(overrides = {}) {
  const draft = await makeDraft(overrides);
  assert.equal(draft.ok, true, `draft creation failed: ${draft.code || ""} ${draft.message || ""}`);
  const approved = await legal.approve({ id: draft.document.id });
  assert.equal(approved.ok, true);
  return approved.document;
}

async function makeAdmin() {
  const id = `usr_rc_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', 'admin')`, [
    id,
    `${id}@example.test`,
  ]);
  createdUsers.push(id);
  return id;
}

function mount(mountPath, router) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/**
 * 清 fixture。依相依順序：`superseded_by_id` 是 ON DELETE RESTRICT 且
 * `legal_documents_superseded_evidence_check` 不允許把它清成 NULL，
 * 因此先刪「指向別人的舊版」，再刪其餘。
 */
async function purge() {
  const like = `version LIKE 'rc-%'`;
  await db.query(`DELETE FROM activity_logs WHERE target_type = 'legal_document' AND target_id IN (
                    SELECT id FROM legal_documents WHERE ${like})`);
  await db.query(`DELETE FROM legal_documents WHERE (${like}) AND superseded_by_id IS NOT NULL`);
  await db.query(`DELETE FROM legal_documents WHERE ${like}`);
}

test.before(purge);

test.after(async () => {
  try {
    await purge();
    if (createdUsers.length) {
      await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [createdUsers]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUsers]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

// ---------------------------------------------------------------------------
// 1. Schema shape
// ---------------------------------------------------------------------------

test("schema: requires_reconsent 是 BOOLEAN、NOT NULL、且沒有 DB DEFAULT", async () => {
  const { rows } = await db.query(
    `SELECT data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'legal_documents' AND column_name = 'requires_reconsent'`
  );
  assert.equal(rows.length, 1, "requires_reconsent 欄位不存在 —— 請執行 SCHEMA-03 migration");
  assert.equal(rows[0].data_type, "boolean");
  assert.equal(rows[0].is_nullable, "NO");
  assert.equal(
    rows[0].column_default,
    null,
    "requires_reconsent 不得有 DB DEFAULT —— DEFAULT 會讓『沒人回答過』被靜默寫成一個看似答案的值"
  );
});

test("schema: 沒有引入任何法律分類欄位（material / non_material 之類）", async () => {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'legal_documents'`
  );
  const names = rows.map((r) => r.column_name);
  for (const forbidden of ["change_classification", "materiality", "change_significance", "change_level"]) {
    assert.equal(
      names.includes(forbidden),
      false,
      `${forbidden} 不得存在 —— re-consent 是 enforcement metadata，法律重大性判準仍屬 DEC-LEGAL-01（未決）`
    );
  }
});

test("schema: bootstrap 與 canonical schema 都宣告了這個欄位（parity）", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const bootstrap = fs.readFileSync(path.join(__dirname, "..", "models", "bootstrapModel.js"), "utf8");
  const canonical = fs.readFileSync(path.join(__dirname, "..", "..", "db", "db_schema.sql"), "utf8");
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "migrations", "20260827b_legal_document_requires_reconsent.sql"),
    "utf8"
  );

  // 欄位宣告：三份都要有，且都不得帶 DEFAULT。
  for (const [label, src] of [
    ["bootstrapModel.js", bootstrap],
    ["db/db_schema.sql", canonical],
    ["SCHEMA-03 migration", migration],
  ]) {
    assert.match(src, /requires_reconsent BOOLEAN NOT NULL/, `${label} 缺少 requires_reconsent BOOLEAN NOT NULL`);
    assert.equal(
      /requires_reconsent BOOLEAN NOT NULL DEFAULT/.test(src),
      false,
      `${label} 不得替 requires_reconsent 加上 DEFAULT`
    );
  }

  /*
   * immutability trigger 是**顯式欄位白名單**，新欄位不會自動受保護。
   * trigger 的實際定義只存在於 bootstrapModel.js 與 migration ——
   * `db/db_schema.sql` 是 DDL snapshot，對 trigger 採「以引用記載」，
   * 因此那份只驗它有指到 SCHEMA-03 migration。
   */
  for (const [label, src] of [["bootstrapModel.js", bootstrap], ["SCHEMA-03 migration", migration]]) {
    assert.match(
      src,
      /NEW\.requires_reconsent IS DISTINCT FROM OLD\.requires_reconsent/,
      `${label} 的 immutability trigger 未涵蓋 requires_reconsent`
    );
  }
  assert.match(
    canonical,
    /20260827b_legal_document_requires_reconsent\.sql/,
    "db/db_schema.sql 應指向 SCHEMA-03 migration（trigger 定義所在）"
  );
});

// ---------------------------------------------------------------------------
// 2. Validation —— 沒有 implicit default
// ---------------------------------------------------------------------------

const NON_BOOLEAN_CASES = [
  ["string 'true'", "true"],
  ["string 'false'", "false"],
  ["number 1", 1],
  ["number 0", 0],
  ["object", {}],
  ["array", []],
];

test("createDraft: 缺少 requiresReconsent → 拒絕（沒有 default 可以退回）", async () => {
  const result = await legal.createDraft({
    documentType: "terms",
    version: version("nodefault"),
    body: "x",
    effectiveDate: "2026-01-01",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "requires_reconsent_required");
});

test("createDraft: null → 拒絕", async () => {
  const result = await legal.createDraft({
    documentType: "terms",
    version: version("null"),
    body: "x",
    effectiveDate: "2026-01-01",
    requiresReconsent: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "requires_reconsent_required");
});

for (const [label, value] of NON_BOOLEAN_CASES) {
  test(`createDraft: ${label} → 拒絕（只接受真正的 boolean）`, async () => {
    const result = await legal.createDraft({
      documentType: "terms",
      version: version("bad"),
      body: "x",
      effectiveDate: "2026-01-01",
      requiresReconsent: value,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "requires_reconsent_invalid");
  });
}

test("publish: 缺少 requiresReconsent → 拒絕，即使草稿已經有值", async () => {
  // 草稿刻意帶 true —— 若 publish 會沿用草稿值，這個 case 就會通過，那正是要防的事。
  const doc = await makeApproved({ requiresReconsent: true });
  const result = await legal.publish({ id: doc.id });
  assert.equal(result.ok, false);
  assert.equal(result.code, "requires_reconsent_required");

  // 而且不得有 partial write：文件仍停在 approved。
  const { rows } = await db.query(`SELECT publication_status FROM legal_documents WHERE id = $1`, [doc.id]);
  assert.equal(rows[0].publication_status, "approved");
});

test("publish: null → 拒絕", async () => {
  const doc = await makeApproved();
  const result = await legal.publish({ id: doc.id, requiresReconsent: null, reasonCode: PUBLISH_REASON });
  assert.equal(result.ok, false);
  assert.equal(result.code, "requires_reconsent_required");
});

for (const [label, value] of NON_BOOLEAN_CASES) {
  test(`publish: ${label} → 拒絕`, async () => {
    const doc = await makeApproved();
    const result = await legal.publish({ id: doc.id, requiresReconsent: value, reasonCode: PUBLISH_REASON });
    assert.equal(result.ok, false);
    assert.equal(result.code, "requires_reconsent_invalid");
  });
}

test("updateDraft: 提供非 boolean → 拒絕；不提供 → 完全不動", async () => {
  const draft = await makeDraft({ requiresReconsent: true });
  assert.equal(draft.ok, true);

  const bad = await legal.updateDraft({ id: draft.document.id, requiresReconsent: "true" });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "requires_reconsent_invalid");

  const untouched = await legal.updateDraft({ id: draft.document.id, body: "改過的正文" });
  assert.equal(untouched.ok, true);
  assert.equal(untouched.document.requires_reconsent, true, "未提供時不得被改動");

  const flipped = await legal.updateDraft({ id: draft.document.id, requiresReconsent: false });
  assert.equal(flipped.ok, true);
  assert.equal(flipped.document.requires_reconsent, false);
});

// ---------------------------------------------------------------------------
// 3. Persistence
// ---------------------------------------------------------------------------

for (const value of [true, false]) {
  test(`publish(${value}): DB 實際值為 ${value}`, async () => {
    // 草稿刻意帶相反值，證明寫進 DB 的是**發布時**提供的那個。
    const doc = await makeApproved({ requiresReconsent: !value });
    const result = await legal.publish({ id: doc.id, requiresReconsent: value, reasonCode: PUBLISH_REASON });
    assert.equal(result.ok, true, `${result.code || ""} ${result.message || ""}`);

    const { rows } = await db.query(`SELECT requires_reconsent FROM legal_documents WHERE id = $1`, [doc.id]);
    assert.equal(rows[0].requires_reconsent, value);
    assert.equal(result.document.requires_reconsent, value);

    // Admin 投影必須帶出這個欄位（沒有它就稽核不了）。
    assert.equal(legal.toAdminView(result.document).requiresReconsent, value);
    // public 投影**不**帶 —— 那是 enforcement metadata，不是條款正文。
    assert.equal("requiresReconsent" in legal.toPublicView(result.document), false);
  });
}

test("version 與 requires_reconsent 互不推導", async () => {
  // 同一份文件連續兩版，版本號遞增但 re-consent 決定相反 ——
  // 證明系統沒有從版本號推導任何東西（DEC-LEGAL-05 明文要求）。
  const first = await makeApproved({ documentType: "privacy", version: version("seq1") });
  const p1 = await legal.publish({ id: first.id, requiresReconsent: true, reasonCode: PUBLISH_REASON });
  assert.equal(p1.ok, true);

  const second = await makeApproved({ documentType: "privacy", version: version("seq2") });
  const p2 = await legal.publish({ id: second.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });
  assert.equal(p2.ok, true);

  assert.equal(p1.document.requires_reconsent, true);
  assert.equal(p2.document.requires_reconsent, false);
  assert.deepEqual(p2.supersededIds, [first.id], "新版應原子接棒舊版");
});

// ---------------------------------------------------------------------------
// 4. Immutability
// ---------------------------------------------------------------------------

for (const [from, to] of [[true, false], [false, true]]) {
  test(`immutability: published 之後 ${from} → ${to} 不得改寫`, async () => {
    const doc = await makeApproved({ documentType: "creator_agreement", version: version(`imm${from}`) });
    const published = await legal.publish({ id: doc.id, requiresReconsent: from, reasonCode: PUBLISH_REASON });
    assert.equal(published.ok, true);

    await assert.rejects(
      () => db.query(`UPDATE legal_documents SET requires_reconsent = $2 WHERE id = $1`, [doc.id, to]),
      /immutable once published/,
      "published 文件的 requires_reconsent 必須被 trigger 擋下"
    );

    const { rows } = await db.query(`SELECT requires_reconsent FROM legal_documents WHERE id = $1`, [doc.id]);
    assert.equal(rows[0].requires_reconsent, from, "值必須維持原狀");
  });
}

test("immutability regression: 既有的 body / version 保護未失效", async () => {
  const doc = await makeApproved({ documentType: "refund_policy", version: version("reg") });
  const published = await legal.publish({ id: doc.id, requiresReconsent: true, reasonCode: PUBLISH_REASON });
  assert.equal(published.ok, true);

  await assert.rejects(
    () => db.query(`UPDATE legal_documents SET body = '竄改' WHERE id = $1`, [doc.id]),
    /immutable once published/
  );
  await assert.rejects(
    () => db.query(`UPDATE legal_documents SET version = 'tampered' WHERE id = $1`, [doc.id]),
    /immutable once published/
  );
});

test("draft 階段仍可自由修改 requires_reconsent（trigger 只鎖 published）", async () => {
  const draft = await makeDraft({ requiresReconsent: false });
  assert.equal(draft.ok, true);
  await db.query(`UPDATE legal_documents SET requires_reconsent = true WHERE id = $1`, [draft.document.id]);
  const { rows } = await db.query(`SELECT requires_reconsent FROM legal_documents WHERE id = $1`, [
    draft.document.id,
  ]);
  assert.equal(rows[0].requires_reconsent, true);
});

// ---------------------------------------------------------------------------
// 5. Route contract + audit（掛載真正的 router）
// ---------------------------------------------------------------------------

test("真實 publish 路由：缺少 requiresReconsent → 400，且不寫任何 activity log", async () => {
  const admin = await makeAdmin();
  const doc = await makeApproved({ documentType: "terms", version: version("http400") });
  const { base, close } = await mount("/admin", require("../routes/adminLegalDocuments"));
  try {
    const res = await fetch(`${base}/admin/legal-documents/${doc.id}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt.sign({ userId: admin, role: "admin" }, process.env.JWT_SECRET, {
          expiresIn: "10m",
        })}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.error, "requires_reconsent_required");

    const logs = await db.query(
      `SELECT COUNT(*)::int n FROM activity_logs WHERE target_type = 'legal_document' AND target_id = $1`,
      [doc.id]
    );
    assert.equal(logs.rows[0].n, 0, "驗證失敗時不得留下發布稽核紀錄");
  } finally {
    await close();
  }
});

test("真實 publish 路由：字串 \"true\" → 400（不得被寬鬆轉換）", async () => {
  const admin = await makeAdmin();
  const doc = await makeApproved({ documentType: "terms", version: version("httpstr") });
  const { base, close } = await mount("/admin", require("../routes/adminLegalDocuments"));
  try {
    const res = await fetch(`${base}/admin/legal-documents/${doc.id}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt.sign({ userId: admin, role: "admin" }, process.env.JWT_SECRET, {
          expiresIn: "10m",
        })}`,
      },
      body: JSON.stringify({ requiresReconsent: "true" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "requires_reconsent_invalid");
  } finally {
    await close();
  }
});

test("真實 publish 路由：成功時稽核可回答 who / when / document / version / requires_reconsent", async () => {
  const admin = await makeAdmin();
  const doc = await makeApproved({ documentType: "terms", version: version("httpok") });
  const { base, close } = await mount("/admin", require("../routes/adminLegalDocuments"));
  try {
    const res = await fetch(`${base}/admin/legal-documents/${doc.id}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt.sign({ userId: admin, role: "admin" }, process.env.JWT_SECRET, {
          expiresIn: "10m",
        })}`,
      },
      body: JSON.stringify({ requiresReconsent: true, reasonCode: PUBLISH_REASON }),
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.requiresReconsent, true, "Admin read API 必須帶出這個欄位才稽核得了");

    const { rows } = await db.query(
      `SELECT actor_id, action, target_id, meta, created_at
         FROM activity_logs
        WHERE target_type = 'legal_document' AND target_id = $1 AND action = 'legal_document.published'
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [doc.id]
    );
    assert.equal(rows.length, 1, "publish 必須留下稽核紀錄");
    const log = rows[0];
    const meta = typeof log.meta === "string" ? JSON.parse(log.meta) : log.meta;

    assert.equal(log.actor_id, admin, "who");
    assert.ok(log.created_at instanceof Date, "when");
    assert.equal(log.target_id, doc.id, "document id");
    assert.equal(meta.documentType, "terms", "document type");
    assert.equal(meta.version, doc.version, "version");
    assert.equal(meta.requiresReconsent, true, "requires_reconsent 必須可由稽核回答");
    assert.ok(meta.effectiveDate, "effective_date（既有 meta 慣例）");

    // 不得自行編造法律理由 —— Owner／律師尚未提供判準。
    for (const forbidden of ["reason", "materiality", "changeClassification", "legalBasis"]) {
      assert.equal(forbidden in meta, false, `meta 不得包含 ${forbidden}（無授權來源即為虛構）`);
    }
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// 6. Scope guard —— 本輪不得接線 consent
// ---------------------------------------------------------------------------

test("scope: 沒有任何 published 法律文件被留在 registry，consent 仍未接線", async () => {
  const published = await db.query(
    `SELECT COUNT(*)::int n FROM legal_documents WHERE publication_status = 'published' AND version NOT LIKE 'rc-%'`
  );
  assert.equal(published.rows[0].n, 0, "本輪不得發布任何真實法律文件");

  const consents = await db.query(`SELECT COUNT(*)::int n FROM consent_records`);
  assert.equal(consents.rows[0].n, 0, "本輪不得寫入任何 consent 證據（Gate 5 仍未啟用）");
});
