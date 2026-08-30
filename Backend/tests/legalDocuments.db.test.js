/**
 * 法律文件登記表（P1-09 Legal Foundation）的不變條件。
 *
 * 這個檔案要釘住六件事：
 *
 *   1. **版本唯一性** —— 同一型別不得有兩個同名版本。
 *   2. **Fail-closed publication** —— 缺 body / effective_date 一律不得 publish。
 *   3. **published-only** —— draft / approved 永遠不是 current。
 *   4. **同型別最多一筆 published** —— 由 partial UNIQUE index 保證。
 *   5. **原子接棒** —— publish v2 時 v1 轉 superseded，兩者同一 transaction。
 *   6. **已發布內容不可竄改** —— 由 DB trigger 保證，不靠 service 自律。
 *
 * 以及一條和整輪 scope 有關的斷言：
 *
 *   7. **registry 不得被 seed。** 沒有經核可的法律文件之前，
 *      正確的狀態是 0 筆 published —— 這條測試會抓到任何
 *      「順手放一份 placeholder Terms 進去」的改動。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const legal = require("../services/legalDocument.service");

/*
 * `OPS-03`：發布時除了 `requiresReconsent`，還必須提供標準化的**營運理由**。
 * 本檔測的是 registry 的其他不變條件，固定用一個合法代碼即可；
 * 理由本身的不變條件在 tests/legalDocumentPublishJustification.db.test.js。
 */
const PUBLISH_REASON = "administrative_correction";

/** 本檔建立的所有列，結束時清掉，避免污染共用測試 DB。 */
const created = [];

function uniqueVersion(label) {
  return `test-${label}-${process.pid}-${created.length}`;
}

async function makeDraft(overrides = {}) {
  const result = await legal.createDraft({
    documentType: "terms",
    version: uniqueVersion("v"),
    body: "測試條文內容\n\n第二段。",
    effectiveDate: "2026-01-01",
    // `SCHEMA-03`：欄位為 NOT NULL 且無 DEFAULT，因此每個呼叫端都必須顯式給值。
    // 本檔測的是 registry 的其他不變條件，固定 false 即可；
    // `requires_reconsent` 自己的不變條件在 tests/legalDocumentReconsent.db.test.js。
    requiresReconsent: false,
    ...overrides,
  });
  if (result.ok) created.push(result.document.id);
  return result;
}

/**
 * 清掉本檔的 fixture。
 *
 * 依相依順序刪除：**不能**先把 `superseded_by_id` 設成 NULL ——
 * `legal_documents_superseded_evidence_check` 要求 superseded 的列必須留著
 * 繼任者（那正是該約束的用意：不得抹掉「被誰取代」）。
 * `superseded_by_id` 指向較新的列且為 ON DELETE RESTRICT，
 * 因此先刪「有指向別人的」（舊版），再刪其餘。
 */
async function purgeFixtures() {
  // `http-%` 是 HTTP 生命週期驗證留下的版本前綴，與本檔共用同一個測試 DB。
  const like = `version LIKE 'test-%' OR version LIKE 'http-%'`;
  await db.query(`DELETE FROM legal_documents WHERE (${like}) AND superseded_by_id IS NOT NULL`);
  await db.query(`DELETE FROM legal_documents WHERE ${like}`);
}

/*
 * 開跑前先清。`legal_documents` 對每個 document_type 只允許一筆 published，
 * 因此上一次中斷的執行若留下 fixture，這一輪的 publish 會撞 UNIQUE index
 * 而失敗 —— 那是測試互相污染，不是真的回歸。
 */
test.before(purgeFixtures);

test.after(async () => {
  await purgeFixtures();
  if (created.length > 0) {
    /*
     * 依相依順序刪除。**不能**先把 `superseded_by_id` 設成 NULL ——
     * `legal_documents_superseded_evidence_check` 要求 superseded 的列
     * 必須留著繼任者（那正是這條約束的用意：不得抹掉「被誰取代」）。
     *
     * `superseded_by_id` 指向較新的列，且是 ON DELETE RESTRICT，
     * 因此先刪「有指向別人的」（舊版），再刪其餘。
     */
    await db.query(
      `DELETE FROM legal_documents WHERE id = ANY($1) AND superseded_by_id IS NOT NULL`,
      [created]
    );
    await db.query(`DELETE FROM legal_documents WHERE id = ANY($1)`, [created]);
  }
});

test("registry 預設是空的 —— 沒有任何 published 法律文件被 seed", async () => {
  const { rows } = await db.query(
    `SELECT document_type, version FROM legal_documents
      WHERE publication_status = 'published'
        AND version NOT LIKE 'test-%' AND version NOT LIKE 'http-%'`
  );
  assert.deepEqual(
    rows,
    [],
    "沒有經核可的條文之前，published 法律文件必須是 0 筆 —— " +
      "任何 placeholder / AI 產生的條文都不得進入 registry"
  );
});

test("四種 canonical 型別，不多不少", async () => {
  assert.deepEqual(legal.DOCUMENT_TYPES, ["terms", "privacy", "creator_agreement", "refund_policy"]);

  const invalid = await legal.createDraft({ documentType: "cookie_policy", version: "v1" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid_document_type");
});

test("建立草稿：content_hash 由 server 計算，client 無從指定", async () => {
  const body = "同意內容 A";
  const r = await makeDraft({ body });
  assert.equal(r.ok, true);
  assert.equal(r.document.publication_status, "draft");
  assert.equal(r.document.content_hash, legal.computeContentHash(body));

  // 即使呼叫端硬塞 contentHash，也不會被採用。
  const spoof = await makeDraft({ body, contentHash: "deadbeef" });
  assert.equal(spoof.document.content_hash, legal.computeContentHash(body));
});

test("版本不得重複，也不得空白", async () => {
  const version = uniqueVersion("dup");
  const first = await legal.createDraft({
    documentType: "privacy", version, body: "x", effectiveDate: "2026-01-01", requiresReconsent: false,
  });
  assert.equal(first.ok, true);
  created.push(first.document.id);

  const second = await legal.createDraft({
    documentType: "privacy", version, body: "y", effectiveDate: "2026-01-01", requiresReconsent: false,
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, "version_already_exists");

  const blank = await legal.createDraft({ documentType: "privacy", version: "   ", body: "y" });
  assert.equal(blank.ok, false);
  assert.equal(blank.code, "version_required");

  // 不同型別可以有同名版本。
  const otherType = await legal.createDraft({
    documentType: "refund_policy", version, body: "z", effectiveDate: "2026-01-01", requiresReconsent: false,
  });
  assert.equal(otherType.ok, true);
  created.push(otherType.document.id);
});

test("draft 與 approved 都不是 current —— public 讀不到", async () => {
  const type = "creator_agreement";
  const draft = await makeDraft({ documentType: type, version: uniqueVersion("gate") });
  assert.equal(await legal.getCurrentPublished(type), null, "draft 不得成為 current");

  const approved = await legal.approve({ id: draft.document.id });
  assert.equal(approved.ok, true);
  assert.equal(approved.document.publication_status, "approved");
  assert.equal(await legal.getCurrentPublished(type), null, "approved 仍不得成為 current");

  const published = await legal.publish({ id: draft.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });
  assert.equal(published.ok, true);
  const current = await legal.getCurrentPublished(type);
  assert.ok(current, "published 之後才是 current");
  assert.equal(current.id, draft.document.id);
});

test("fail-closed：缺 body 或 effective_date 不得 publish", async () => {
  const noBody = await makeDraft({ documentType: "refund_policy", version: uniqueVersion("nobody"), body: null });
  await legal.approve({ id: noBody.document.id });
  const r1 = await legal.publish({ id: noBody.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, "body_required");

  const blankBody = await makeDraft({ documentType: "refund_policy", version: uniqueVersion("blank"), body: "   " });
  await legal.approve({ id: blankBody.document.id });
  const r2 = await legal.publish({ id: blankBody.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });
  assert.equal(r2.ok, false, "只有空白的正文不算正文");

  const noDate = await makeDraft({
    documentType: "refund_policy", version: uniqueVersion("nodate"), effectiveDate: null,
  });
  await legal.approve({ id: noDate.document.id });
  const r3 = await legal.publish({ id: noDate.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });
  assert.equal(r3.ok, false);
  assert.equal(r3.code, "effective_date_required");
});

test("狀態流轉：不得跳過 approve 直接 publish，superseded 是終態", async () => {
  const d = await makeDraft({ version: uniqueVersion("skip") });
  const direct = await legal.publish({ id: d.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "invalid_transition");

  assert.deepEqual(legal.TRANSITIONS.published, []);
  assert.deepEqual(legal.TRANSITIONS.superseded, []);
});

test("DB 層擋住『兩份現行版本』——不依賴 service 自律", async () => {
  const type = "terms";
  const a = await makeDraft({ documentType: type, version: uniqueVersion("one") });
  await legal.approve({ id: a.document.id });
  await legal.publish({ id: a.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });

  const b = await makeDraft({ documentType: type, version: uniqueVersion("two") });
  await legal.approve({ id: b.document.id });

  // 繞過 service，直接對 DB 硬寫第二筆 published。
  await assert.rejects(
    () =>
      db.query(
        `UPDATE legal_documents
            SET publication_status = 'published', published_at = NOW()
          WHERE id = $1`,
        [b.document.id]
      ),
    /legal_documents_one_published_per_type/,
    "partial UNIQUE index 必須擋住同型別的第二筆 published"
  );
});

test("publish v2：v1 原子轉 superseded，current 只剩 v2", async () => {
  const type = "privacy";
  // 清掉前面測試可能留下的 current。
  await db.query(
    `UPDATE legal_documents SET publication_status = 'draft', published_at = NULL,
        approved_at = NULL, superseded_at = NULL, superseded_by_id = NULL
      WHERE document_type = $1 AND publication_status = 'published' AND version LIKE 'test-%'`,
    [type]
  ).catch(() => {});

  const v1 = await makeDraft({ documentType: type, version: uniqueVersion("v1"), body: "第一版正文" });
  await legal.approve({ id: v1.document.id });
  await legal.publish({ id: v1.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });

  const v2 = await makeDraft({ documentType: type, version: uniqueVersion("v2"), body: "第二版正文" });
  await legal.approve({ id: v2.document.id });
  const result = await legal.publish({ id: v2.document.id, requiresReconsent: false, reasonCode: PUBLISH_REASON });

  assert.equal(result.ok, true);
  assert.deepEqual(result.supersededIds, [v1.document.id], "publish v2 必須讓 v1 退位");

  const current = await legal.getCurrentPublished(type);
  assert.equal(current.id, v2.document.id);
  assert.equal(current.body, "第二版正文");

  const old = await legal.getById(v1.document.id);
  assert.equal(old.publication_status, "superseded");
  assert.ok(old.superseded_at, "superseded 必須留下時間");
  assert.equal(old.superseded_by_id, v2.document.id, "必須留下繼任者");

  // 歷史版本仍可供稽核讀取（consent 證據會指向它）。
  assert.equal(old.body, "第一版正文", "superseded 的正文必須仍可讀");
  assert.equal(old.content_hash, legal.computeContentHash("第一版正文"));

  const countPublished = await db.query(
    `SELECT COUNT(*)::int AS n FROM legal_documents
      WHERE document_type = $1 AND publication_status = 'published'`,
    [type]
  );
  assert.equal(countPublished.rows[0].n, 1, "同型別永遠只有一筆 published");
});

test("已發布內容不可竄改 —— 正文／版本／雜湊／生效日全部鎖死", async () => {
  const type = "terms";
  const current = await legal.getCurrentPublished(type);
  assert.ok(current, "前面的測試應已留下一筆 published terms");

  for (const [column, value] of [
    ["body", "'被竄改的條文'"],
    ["version", "'v-tampered'"],
    ["content_hash", "'0000'"],
    ["effective_date", "DATE '2030-01-01'"],
    ["published_at", "NOW()"],
  ]) {
    await assert.rejects(
      () => db.query(`UPDATE legal_documents SET ${column} = ${value} WHERE id = $1`, [current.id]),
      /immutable once published/,
      `published 之後 ${column} 不得被改寫`
    );
  }

  // service 層也不給改。
  const viaService = await legal.updateDraft({ id: current.id, body: "另一種竄改" });
  assert.equal(viaService.ok, false);
  assert.equal(viaService.code, "not_draft");
});

test("生效日不得因時區位移 —— API 邊界回傳 YYYY-MM-DD", async () => {
  // node-postgres 把 DATE 解析成本地午夜的 Date，JSON.stringify 走 toISOString()
  // 會轉成 UTC；在 UTC+8 下 `2026-10-01` 會變成 `2026-09-30T16:00:00.000Z`。
  // 生效日決定條款何時開始拘束使用者，差一天不是顯示瑕疵。
  const d = await makeDraft({
    documentType: "refund_policy",
    version: uniqueVersion("tz"),
    body: "時區測試",
    effectiveDate: "2026-10-01",
  });
  const view = legal.toAdminView(d.document);
  assert.equal(view.effectiveDate, "2026-10-01");

  // 序列化之後仍必須是同一天（模擬 API 回應）。
  const roundTripped = JSON.parse(JSON.stringify(view));
  assert.equal(roundTripped.effectiveDate, "2026-10-01", "序列化不得讓生效日少一天");
});

test("consent_records 相容性：欄位型別可對接 legal registry", async () => {
  const cols = await db.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE (table_name = 'consent_records'
             AND column_name IN ('document_type', 'document_version', 'document_content_hash', 'document_effective_date'))
         OR (table_name = 'legal_documents'
             AND column_name IN ('document_type', 'version', 'content_hash', 'effective_date'))
      ORDER BY table_name, column_name`
  );
  const byKey = Object.fromEntries(cols.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.data_type]));

  assert.equal(byKey["legal_documents.document_type"], byKey["consent_records.document_type"]);
  assert.equal(byKey["legal_documents.version"], byKey["consent_records.document_version"]);
  assert.equal(byKey["legal_documents.content_hash"], byKey["consent_records.document_content_hash"]);
  assert.equal(byKey["legal_documents.effective_date"], byKey["consent_records.document_effective_date"]);
});

test("production consent 仍未接線 —— 本輪只建文件端", async () => {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM consent_records`);
  assert.equal(rows[0].n, 0, "本輪不得寫入任何 consent 記錄");
});
