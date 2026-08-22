/**
 * 付款憑證審核（搜尋 + decision context）的資料庫整合測試。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/adminPaymentProofs.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料，只允許跑在 `teaching_platform_security_test`。
 * fixture id 帶 `tp_apptest_` 前綴，測試前後各清一次。
 *
 * 要鎖住的東西：
 *   1. 清單可用**人類手上有的東西**查到：訂單編號、買家 email（Epic §3）
 *   2. 每一列帶得出判斷所需的訂單 context（金額、買家、建立時間、付款期限）
 *   3. 詳情包含同一張訂單的其他憑證 —— 重新上傳時 Admin 要看得到上次為什麼被退
 *   4. 退件原因 code 會落地，並經 /me/orders 的同一組子查詢回到買家
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const test = require("node:test");
const assert = require("node:assert/strict");

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  throw new Error(
    `ABORT: this test writes fixtures and must run against ${EXPECTED_DB}. ` +
      `PGDATABASE is currently ${JSON.stringify(process.env.PGDATABASE)}. ` +
      "Run it via `npm run test:db --prefix Backend`."
  );
}

const db = require("../config/db");
const service = require("../services/adminPaymentProofs.service");

const PREFIX = "tp_apptest_";
const id = (name) => `${PREFIX}${name}`;

async function cleanup() {
  await db.query(`DELETE FROM manual_payment_proofs WHERE order_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM orders WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function seed() {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES
       ($1, $2, 'x', 'buyer'),
       ($3, $4, 'x', 'admin'),
       ($5, $6, 'x', 'teacher')`,
    [
      id("buyer"), `${PREFIX}wang@example.test`,
      id("admin"), `${PREFIX}admin@example.test`,
      id("creator"), `${PREFIX}creator@example.test`,
    ]
  );
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES($1, $2, 450, $3, 'published', 'k')`,
    [id("mat"), `${PREFIX}示範教材`, id("creator")]
  );
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, created_at)
     VALUES($1, $2, 'pending_payment', 'manual_transfer', 450, 450, NOW() - INTERVAL '1 day')`,
    [id("order1"), id("buyer")]
  );
  await db.query(
    `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, seller_id, subtotal)
     VALUES($1, $2, $3, $4, 450, 1, $5, 450)`,
    [id("oi1"), id("order1"), id("mat"), `${PREFIX}示範教材`, id("creator")]
  );
  // 先前被退回的憑證（帶 reason code）+ 買家重新上傳的新憑證
  await db.query(
    `INSERT INTO manual_payment_proofs(
       id, order_id, proof_url, review_status, uploaded_at, created_at,
       reviewed_at, reviewed_by, rejection_reason, note)
     VALUES($1, $2, 'https://example.test/old.jpg', 'rejected',
            NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours',
            NOW() - INTERVAL '19 hours', $3, 'unreadable', '影像過暗')`,
    [id("proof_old"), id("order1"), id("admin")]
  );
  await db.query(
    `INSERT INTO manual_payment_proofs(
       id, order_id, proof_url, proof_mime_type, proof_size_bytes, original_filename,
       review_status, uploaded_at, created_at)
     VALUES($1, $2, 'https://example.test/new.jpg', 'image/jpeg', 12345, 'transfer.jpg',
            'pending', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')`,
    [id("proof_new"), id("order1")]
  );
}

test.before(async () => {
  const check = await db.query("SELECT current_database() AS db");
  assert.equal(check.rows[0].db, EXPECTED_DB);
  await cleanup();
  await seed();
});

test.after(async () => {
  await cleanup();
  await db.pool.end();
});

test("以訂單編號搜尋", async () => {
  const result = await service.listProofs({ q: id("order1"), limit: 100 });
  assert.equal(result.items.length, 2);
  for (const row of result.items) assert.equal(row.order_id, id("order1"));
});

test("以買家 email 搜尋", async () => {
  const result = await service.listProofs({ q: `${PREFIX}wang@`, limit: 100 });
  assert.equal(result.items.length, 2);
});

test("以憑證 id 搜尋仍然可用（從 URL 貼回來），但不是唯一入口", async () => {
  const result = await service.listProofs({ q: id("proof_new"), limit: 100 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, id("proof_new"));
});

test("搜尋 + status 可疊加", async () => {
  const pending = await service.listProofs({ q: id("order1"), status: "pending", limit: 100 });
  assert.equal(pending.items.length, 1);
  assert.equal(pending.items[0].review_status, "pending");
});

test("每一列帶得出判斷所需的訂單 context", async () => {
  const result = await service.listProofs({ q: id("proof_new"), limit: 10 });
  const row = result.items[0];
  assert.equal(row.buyer_email, `${PREFIX}wang@example.test`);
  assert.equal(row.order_total_amount, 450);
  assert.equal(row.order_status, "pending_payment");
  assert.equal(row.order_payment_mode, "manual_transfer");
  assert.ok(row.order_created_at, "缺少訂單建立時間就無法判斷是否逾期");
  assert.ok(row.order_payment_due_at, "付款期限為衍生值，必須由 Backend 算");
  assert.equal(row.order_proof_count, 2);
  assert.equal(row.proof_mime_type, "image/jpeg");
  assert.equal(row.original_filename, "transfer.jpg");
});

test("付款期限 = 訂單建立時間 + PAYMENT_DUE_DAYS", async () => {
  const result = await service.listProofs({ q: id("proof_new"), limit: 10 });
  const row = result.items[0];
  const days =
    (new Date(row.order_payment_due_at) - new Date(row.order_created_at)) / (24 * 60 * 60 * 1000);
  assert.equal(Math.round(days), service.PAYMENT_DUE_DAYS);
});

test("詳情含訂單明細與同訂單的其他憑證（含上次退件原因）", async () => {
  const detail = await service.getProofDetail(id("proof_new"));
  assert.ok(detail);
  assert.equal(detail.proof.id, id("proof_new"));

  assert.equal(detail.orderItems.length, 1);
  assert.equal(detail.orderItems[0].material_title, `${PREFIX}示範教材`);
  assert.equal(detail.orderItems[0].subtotal, 450);

  assert.equal(detail.otherProofs.length, 1);
  const previous = detail.otherProofs[0];
  assert.equal(previous.id, id("proof_old"));
  assert.equal(previous.review_status, "rejected");
  assert.equal(previous.rejection_reason, "unreadable");
  assert.equal(previous.note, "影像過暗");
});

test("不存在的憑證回 null（route 轉成 404）", async () => {
  assert.equal(await service.getProofDetail(id("nope")), null);
});

test("statusCounts 為全表計數，且各狀態加總 = total", async () => {
  const counts = await service.getStatusCounts();
  assert.equal(counts.total, counts.pending + counts.approved + counts.rejected);
  assert.ok(counts.pending >= 1);
  assert.ok(counts.rejected >= 1);
});

test("退件 reason code 會經 /me/orders 的子查詢回到買家", async () => {
  // 與 routes/me.js 的 payment_proof_rejected_reason 子查詢同一份邏輯。
  const result = await db.query(
    `SELECT
       (SELECT m.rejection_reason FROM manual_payment_proofs m
         WHERE m.order_id = o.id AND m.review_status = 'rejected'
         ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
         LIMIT 1) AS payment_proof_rejected_reason,
       (SELECT m.note FROM manual_payment_proofs m
         WHERE m.order_id = o.id AND m.review_status = 'rejected'
         ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
         LIMIT 1) AS payment_proof_rejected_note
     FROM orders o WHERE o.id = $1`,
    [id("order1")]
  );
  assert.equal(result.rows[0].payment_proof_rejected_reason, "unreadable");
  assert.equal(result.rows[0].payment_proof_rejected_note, "影像過暗");
});

test("review status parse：all / 空字串不篩選；未知值 400", () => {
  assert.deepEqual(service.parseReviewStatus("all"), { valid: true, status: null });
  assert.deepEqual(service.parseReviewStatus(undefined), { valid: true, status: null });
  assert.equal(service.parseReviewStatus("paid").valid, false);
});
