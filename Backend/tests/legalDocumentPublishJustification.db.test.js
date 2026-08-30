/**
 * `OPS-03` —— 法律文件發布時的 **standardized internal justification**。
 *
 * Owner decision `DEC-LEGAL-11`（2026-08-28）。只針對 **security / integration
 * 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 這一支鎖的是什麼
 *
 * `SCHEMA-03` 已讓發布必須顯式決定 `requires_reconsent`，但稽核答不出
 * **「依據什麼」**。本檔鎖住那一格，並且鎖住它**不會變成法律判定**：
 *
 *   1. `reasonCode` 必填、必須來自 allowlist、`other` 必須附說明。
 *   2. **reason 與 boolean 完全獨立** —— 同一個 reasonCode 可搭配 true 或 false，
 *      任何一方都不得推導另一方。這是本輪最重要的不變條件。
 *   3. taxonomy **不得**含法律分類用語（`material_change` / `legally_required` /
 *      「重大變更」）—— `DEC-LEGAL-01` 的判準尚未取得。
 *   4. 稽核可回答 who／when／document／version／boolean／reasonCode／note。
 *   5. **沒有 schema churn** —— 理由存在 `activity_logs.meta`，
 *      `legal_documents` 不得長出理由欄位。
 *
 * 掛**真正的 router**：taxonomy 若只存在於前端，直打 API 就能繞過。
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
const {
  PUBLISH_REASONS,
  PUBLISH_REASON_LABEL,
  PUBLISH_NOTE_MAX_LENGTH,
  validatePublishJustification,
} = require("../utils/legalDocumentPublishPolicy");

const created = [];
const createdUsers = [];
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;

/** 本檔專用版本前綴，與其他檔案的 fixture 不相撞。 */
const version = (label) => `pj-${label}-${process.pid}-${(seq += 1)}`;

async function makeApproved(overrides = {}) {
  const draft = await legal.createDraft({
    documentType: "terms",
    version: version("v"),
    body: "測試條文內容",
    effectiveDate: "2026-01-01",
    requiresReconsent: false,
    ...overrides,
  });
  assert.equal(draft.ok, true, `draft failed: ${draft.code || ""}`);
  created.push(draft.document.id);
  const approved = await legal.approve({ id: draft.document.id });
  assert.equal(approved.ok, true);
  return approved.document;
}

async function makeAdmin() {
  const id = `usr_pj_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', 'admin')`, [
    id,
    `${id}@example.test`,
  ]);
  createdUsers.push(id);
  return id;
}

function mount() {
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/adminLegalDocuments"));
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

async function purge() {
  const like = `version LIKE 'pj-%'`;
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
// 1. Taxonomy —— 營運分類，不是法律分類
// ---------------------------------------------------------------------------

test("taxonomy: 有限 allowlist，且不含任何法律分類用語", () => {
  assert.deepEqual(PUBLISH_REASONS, [
    "editorial_update",
    "policy_scope_change",
    "user_rights_change",
    "platform_process_change",
    "compliance_review",
    "administrative_correction",
    "other",
  ]);

  // 代碼本身不得是法律分類。
  for (const forbidden of ["material_change", "non_material", "legally_required", "material"]) {
    assert.equal(PUBLISH_REASONS.includes(forbidden), false, `不得出現法律分類代碼：${forbidden}`);
  }

  // 標籤也不得把營運理由寫成法律結論。
  for (const code of PUBLISH_REASONS) {
    const label = PUBLISH_REASON_LABEL[code];
    assert.ok(label, `${code} 缺少中文標籤`);
    for (const forbidden of ["重大變更", "依法必須", "法律上必須", "違法"]) {
      assert.equal(label.includes(forbidden), false, `${code} 的標籤不得使用法律認定用語：${forbidden}`);
    }
  }
});

test("validatePublishJustification: 缺代碼／未知代碼／other 缺說明／過長 一律拒絕", () => {
  assert.equal(validatePublishJustification({}).code, "justification_required");
  assert.equal(validatePublishJustification({ reasonCode: "  " }).code, "justification_required");
  assert.equal(validatePublishJustification({ reasonCode: "made_up" }).code, "invalid_justification_code");
  assert.equal(validatePublishJustification({ reasonCode: "other" }).code, "justification_note_required");
  assert.equal(validatePublishJustification({ reasonCode: "other", note: "   " }).code, "justification_note_required");
  assert.equal(
    validatePublishJustification({ reasonCode: "editorial_update", note: "x".repeat(PUBLISH_NOTE_MAX_LENGTH + 1) }).code,
    "justification_note_too_long"
  );

  // 非 other 的 note 為選填。
  assert.equal(validatePublishJustification({ reasonCode: "editorial_update" }).valid, true);
  assert.equal(validatePublishJustification({ reasonCode: "other", note: "個案說明" }).valid, true);
});

test("validatePublishJustification 完全不碰 requiresReconsent（結構上就不可能推導）", () => {
  const result = validatePublishJustification({ reasonCode: "user_rights_change", note: "n" });
  assert.equal(result.valid, true);
  assert.equal("requiresReconsent" in result, false);
  assert.equal("requires_reconsent" in result, false);

  // 傳入 boolean 也不會被採納或回傳。
  const spoof = validatePublishJustification({ reasonCode: "user_rights_change", requiresReconsent: true });
  assert.equal(spoof.valid, true);
  assert.equal("requiresReconsent" in spoof, false);
});

// ---------------------------------------------------------------------------
// 2. Publish contract
// ---------------------------------------------------------------------------

test("publish: 缺 reasonCode → 拒絕，且不得有 partial write", async () => {
  const doc = await makeApproved();
  const result = await legal.publish({ id: doc.id, requiresReconsent: false });
  assert.equal(result.ok, false);
  assert.equal(result.code, "justification_required");

  const { rows } = await db.query(`SELECT publication_status FROM legal_documents WHERE id = $1`, [doc.id]);
  assert.equal(rows[0].publication_status, "approved", "驗證失敗不得改變狀態");
});

test("publish: 未知代碼、other 缺說明、note 過長 → 拒絕", async () => {
  for (const [payload, expected] of [
    [{ reasonCode: "totally_made_up" }, "invalid_justification_code"],
    [{ reasonCode: "other" }, "justification_note_required"],
    [{ reasonCode: "editorial_update", note: "x".repeat(PUBLISH_NOTE_MAX_LENGTH + 1) }, "justification_note_too_long"],
  ]) {
    const doc = await makeApproved();
    const result = await legal.publish({ id: doc.id, requiresReconsent: false, ...payload });
    assert.equal(result.ok, false, JSON.stringify(payload));
    assert.equal(result.code, expected, JSON.stringify(payload));
  }
});

test("publish: 合法代碼 ＋ true／false 皆被接受，boolean 仍為 authoritative", async () => {
  for (const value of [true, false]) {
    // 草稿刻意帶相反值 —— 證明寫入的是**發布時**提供的那個。
    const doc = await makeApproved({ requiresReconsent: !value, documentType: "privacy", version: version(`ok${value}`) });
    const result = await legal.publish({
      id: doc.id,
      requiresReconsent: value,
      reasonCode: "compliance_review",
    });
    assert.equal(result.ok, true, `${result.code || ""} ${result.message || ""}`);
    assert.equal(result.document.requires_reconsent, value);
    assert.equal(result.justification.reasonCode, "compliance_review");

    const { rows } = await db.query(`SELECT requires_reconsent FROM legal_documents WHERE id = $1`, [doc.id]);
    assert.equal(rows[0].requires_reconsent, value);
  }
});

// ---------------------------------------------------------------------------
// 3. Reason / value independence —— 本輪最重要的不變條件
// ---------------------------------------------------------------------------

test("同一個 reasonCode 可以搭配 true，也可以搭配 false —— 沒有 auto-toggle", async () => {
  const results = [];
  for (const value of [true, false]) {
    const doc = await makeApproved({
      documentType: "creator_agreement",
      version: version(`indep${value}`),
      // 草稿值刻意一律 false，證明結果只由 publish 參數決定。
      requiresReconsent: false,
    });
    const r = await legal.publish({
      id: doc.id,
      requiresReconsent: value,
      reasonCode: "policy_scope_change",
    });
    assert.equal(r.ok, true, `${r.code || ""}`);
    results.push({ value, stored: r.document.requires_reconsent, code: r.justification.reasonCode });
    // 每次都要把這一版退位，否則同型別第二次 publish 會撞 partial UNIQUE。
  }
  assert.deepEqual(
    results.map((r) => [r.code, r.value, r.stored]),
    [
      ["policy_scope_change", true, true],
      ["policy_scope_change", false, false],
    ],
    "同一個 reasonCode 必須能產生兩種 boolean —— 任何推導都會讓這條失敗"
  );
});

test("reasonCode 不影響 boolean：editorial_update 也可以要求重新同意", async () => {
  /*
   * 這一條刻意挑一個「聽起來最不像需要重新同意」的代碼配 `true`。
   * 若有人日後加了 `editorial_update => false` 的捷徑，這裡會立刻紅。
   */
  const doc = await makeApproved({ documentType: "refund_policy", version: version("edit-true") });
  const r = await legal.publish({ id: doc.id, requiresReconsent: true, reasonCode: "editorial_update" });
  assert.equal(r.ok, true, `${r.code || ""}`);
  assert.equal(r.document.requires_reconsent, true);
});

// ---------------------------------------------------------------------------
// 4. Audit evidence + no schema churn
// ---------------------------------------------------------------------------

test("真實 publish 路由：稽核可回答 who / when / document / version / boolean / reason / note", async () => {
  const admin = await makeAdmin();
  const doc = await makeApproved({ documentType: "terms", version: version("audit") });
  const { base, close } = await mount();
  try {
    const res = await fetch(`${base}/admin/legal-documents/${doc.id}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt.sign({ userId: admin, role: "admin" }, process.env.JWT_SECRET, {
          expiresIn: "10m",
        })}`,
      },
      body: JSON.stringify({
        requiresReconsent: true,
        reasonCode: "user_rights_change",
        note: "調整下載權利之範圍描述",
      }),
    });
    assert.equal(res.status, 200);

    const { rows } = await db.query(
      `SELECT actor_id, target_id, meta, created_at FROM activity_logs
        WHERE target_type = 'legal_document' AND target_id = $1 AND action = 'legal_document.published'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [doc.id]
    );
    assert.equal(rows.length, 1, "publish 必須留下稽核紀錄");
    const meta = typeof rows[0].meta === "string" ? JSON.parse(rows[0].meta) : rows[0].meta;

    assert.equal(rows[0].actor_id, admin, "who");
    assert.ok(rows[0].created_at instanceof Date, "when");
    assert.equal(rows[0].target_id, doc.id, "document");
    assert.equal(meta.documentType, "terms");
    assert.equal(meta.version, doc.version);
    assert.equal(meta.requiresReconsent, true, "boolean");
    assert.equal(meta.justificationCode, "user_rights_change", "standardized reason");
    assert.equal(meta.justificationNote, "調整下載權利之範圍描述", "note");

    // 稽核不得含法律判定欄位。
    for (const forbidden of ["materiality", "changeClassification", "legalFinding", "legallyRequired"]) {
      assert.equal(forbidden in meta, false, `meta 不得包含 ${forbidden}`);
    }
  } finally {
    await close();
  }
});

test("真實 publish 路由：缺理由 → 400，且不留稽核、不改狀態", async () => {
  const admin = await makeAdmin();
  const doc = await makeApproved({ documentType: "privacy", version: version("http400") });
  const { base, close } = await mount();
  try {
    const res = await fetch(`${base}/admin/legal-documents/${doc.id}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt.sign({ userId: admin, role: "admin" }, process.env.JWT_SECRET, {
          expiresIn: "10m",
        })}`,
      },
      body: JSON.stringify({ requiresReconsent: false }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "justification_required");

    const logs = await db.query(
      `SELECT COUNT(*)::int n FROM activity_logs WHERE target_type = 'legal_document' AND target_id = $1`,
      [doc.id]
    );
    assert.equal(logs.rows[0].n, 0);
    const { rows } = await db.query(`SELECT publication_status FROM legal_documents WHERE id = $1`, [doc.id]);
    assert.equal(rows[0].publication_status, "approved");
  } finally {
    await close();
  }
});

test("no schema churn: legal_documents 沒有長出任何理由欄位", async () => {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'legal_documents'`
  );
  const names = rows.map((r) => r.column_name);
  for (const forbidden of [
    "publish_reason",
    "publish_reason_code",
    "justification",
    "justification_code",
    "reason_code",
  ]) {
    assert.equal(names.includes(forbidden), false, `${forbidden} 不得存在 —— 理由屬事件事實，歸 activity_logs`);
  }
});

test("scope: 本檔未留下任何真實的 published 法律文件，consent 仍未接線", async () => {
  const published = await db.query(
    `SELECT COUNT(*)::int n FROM legal_documents
      WHERE publication_status = 'published'
        AND version NOT LIKE 'pj-%' AND version NOT LIKE 'rc-%'
        AND version NOT LIKE 'test-%' AND version NOT LIKE 'http-%'`
  );
  assert.equal(published.rows[0].n, 0, "不得發布任何真實法律文件");

  const consents = await db.query(`SELECT COUNT(*)::int n FROM consent_records`);
  assert.equal(consents.rows[0].n, 0, "Gate 5 仍未啟用");
});
