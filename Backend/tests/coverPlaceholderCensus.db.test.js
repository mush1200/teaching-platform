/**
 * `SEC-04` —— 對 **security / integration 資料庫**真的跑一次 census（`npm run test:db --prefix Backend`）。
 *
 * 驗證：(1) 四個計數與依 status 分類正確（以前後差值比對，不受資料庫既有資料影響）；
 * (2) `withReadOnlyTransaction` 內的寫入會被資料庫拒絕 —— 唯讀不是靠「程式碼裡沒寫」，而是資料庫層級。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { withReadOnlyTransaction, runCensus, BOOTSTRAP_URL_SQL } = require("../scripts/cover-placeholder-census");

const suffix = crypto.randomBytes(4).toString("hex");
const TEACHER_ID = `sec04c_teacher_${suffix}`;
const IDS = {
  exactPending: `sec04c_exact_pending_${suffix}`,
  exactPublished: `sec04c_exact_published_${suffix}`,
  manualPicsum: `sec04c_manual_${suffix}`,
  missing: `sec04c_missing_${suffix}`,
  own: `sec04c_own_${suffix}`,
  copied: `sec04c_copied_${suffix}`,
};

const census = () => withReadOnlyTransaction(db.pool, (client) => runCensus(client));
const byStatus = (report, status) => report.exactByStatus.find((r) => r.status === status)?.count ?? 0;

let before;

test.before(async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB, "只允許在 security test 資料庫執行");
  before = await census();
  await db.query("INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'x', 'teacher')", [
    TEACHER_ID,
    `${TEACHER_ID}@example.test`,
  ]);
  const insert = `INSERT INTO materials (id, title, price, teacher_id, status, cover_image_url)
                  VALUES ($1, 'SEC-04 census', 100, $2, $3, $4)`;
  await db.query(insert, [IDS.exactPending, TEACHER_ID, "pending_review", null]);
  await db.query(insert, [IDS.exactPublished, TEACHER_ID, "published", null]);
  await db.query(insert, [IDS.manualPicsum, TEACHER_ID, "pending_review", "https://picsum.photos/200/300"]);
  await db.query(insert, [IDS.missing, TEACHER_ID, "pending_review", " "]);
  await db.query(insert, [IDS.own, TEACHER_ID, "pending_review", "https://example.org/own.png"]);
  await db.query(insert, [IDS.copied, TEACHER_ID, "pending_review", null]);
  // 重現舊啟動寫入的「確切網址」（僅限本測試建立的兩列）
  await db.query(`UPDATE materials SET cover_image_url = ${BOOTSTRAP_URL_SQL} WHERE id = ANY($1)`, [
    [IDS.exactPending, IDS.exactPublished],
  ]);
  // 啟動網址被「複製」到另一列：形狀相同，但 md5 是別的教材的 id
  await db.query(
    "UPDATE materials SET cover_image_url = (SELECT cover_image_url FROM materials WHERE id = $1) WHERE id = $2",
    [IDS.exactPending, IDS.copied]
  );
});

test.after(async () => {
  await db.query("DELETE FROM materials WHERE id = ANY($1)", [Object.values(IDS)]);
  await db.query("DELETE FROM users WHERE id = $1", [TEACHER_ID]);
  await db.pool.end();
});

test("census counts the startup pattern exactly and separates manual picsum", async () => {
  const after = await census();
  assert.equal(after.database, EXPECTED_DB);
  assert.equal(after.counts.materials_total - before.counts.materials_total, 6);
  assert.equal(after.counts.bootstrap_written_exact - before.counts.bootstrap_written_exact, 2);
  assert.equal(after.counts.bootstrap_shape_other_id - before.counts.bootstrap_shape_other_id, 1);
  assert.equal(after.counts.picsum_any - before.counts.picsum_any, 4);
  assert.equal(after.counts.cover_missing - before.counts.cover_missing, 1);
  assert.equal(byStatus(after, "pending_review") - byStatus(before, "pending_review"), 1);
  assert.equal(byStatus(after, "published") - byStatus(before, "published"), 1);
  assert.equal(after.reconciles, true);
  assert.equal(after.verdict, "REMEDIATION_OPEN");
});

test("writes inside the census transaction are rejected by the database", async () => {
  await assert.rejects(
    withReadOnlyTransaction(db.pool, (client) =>
      client.query("UPDATE materials SET cover_image_url = NULL WHERE id = $1", [IDS.own])
    ),
    /read-only transaction/
  );
  const { rows } = await db.query("SELECT cover_image_url FROM materials WHERE id = $1", [IDS.own]);
  assert.equal(rows[0].cover_image_url, "https://example.org/own.png");
});
