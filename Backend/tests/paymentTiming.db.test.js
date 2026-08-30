/**
 * 付款／核帳時間模型分離的資料庫測試（P1-09 Wave 1 #2 foundation）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是五條不變條件：
 *
 *   1. 四個時間概念在 schema 上真的可以分開表達。
 *   2. **`orders.paid_at` 的語意沒有被改動** —— 它仍是核准時間，
 *      且營收查詢（`paid_at IS NOT NULL AND paid_at BETWEEN ...`）結果不變。
 *   3. **歷史列的 `payment_received_at` 保持 NULL** ——
 *      migration 不得以 `paid_at` 回填，那是假造歷史證據。
 *   4. `payment_received_at` 不接受未來時間。
 *   5. 買家提交付款辨識資訊時會寫入 `payment_info_submitted_at`
 *      （review SLA 的起算點），且**不動 `orders.status` 與 `paid_at`**。
 *
 * 為什麼第 2、3 條要專門測：
 * `paid_at` 是唯一一個「名字說 A、語意是 B」的欄位，
 * 而它同時是三個報表的營收認列依據。任何靠近它的改動都必須證明沒有靜默改義。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");

/** 這些測試會寫入資料；跑錯資料庫是不可接受的。 */
test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], orders: [] };

async function makeUser(role = "buyer") {
  const id = `usr_pt_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

/** 建立一筆已核准的訂單，`paid_at` 為指定時間（模擬既有歷史資料）。 */
async function makeApprovedOrder(userId, paidAtSql, amount = 100) {
  const id = `ord_pt_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount, paid_at)
     VALUES ($1, $2, 'approved', 'manual_transfer', $3, $3, 0, ${paidAtSql})`,
    [id, userId, amount]
  );
  created.orders.push(id);
  return id;
}

test.after(async () => {
  try {
    if (created.orders.length) {
      await db.query(`DELETE FROM manual_payment_proofs WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("schema: 四個付款時間概念彼此獨立，且 paid_at 仍然存在", async () => {
  const { rows } = await db.query(
    `SELECT column_name, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'orders'
        AND column_name IN ('paid_at', 'payment_due_at', 'payment_info_submitted_at',
                            'review_due_at', 'payment_received_at')
      ORDER BY column_name`
  );
  const names = rows.map((r) => r.column_name);
  assert.deepEqual(names, [
    "paid_at",
    "payment_due_at",
    "payment_info_submitted_at",
    "payment_received_at",
    "review_due_at",
  ]);
  // 全部可為 NULL —— 期限數值尚未拍板，歷史入帳時間也是未知的。
  assert.equal(
    rows.every((r) => r.is_nullable === "YES"),
    true,
    "四個時間欄位都必須可為 NULL（未知就是未知）"
  );
});

test("non-regression: 既有已核准訂單的 payment_received_at 一律為 NULL —— 不得以 paid_at 回填", async () => {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS n
       FROM orders
      WHERE status = 'approved'
        AND paid_at IS NOT NULL
        AND payment_received_at IS NOT NULL`
  );
  assert.equal(
    Number(rows[0].n),
    0,
    "migration 不得為歷史列假造 payment_received_at —— 銀行何時入帳從未被記錄過"
  );
});

test("non-regression: paid_at 仍是核准時間，營收查詢的結果不因新欄位而改變", async () => {
  const buyer = await makeUser();
  // 台北 2026-07-15 10:00 → UTC 02:00
  const orderId = await makeApprovedOrder(buyer, `TIMESTAMP '2026-07-15 02:00:00'`, 777);

  // 這是 adminDashboard.service.js 使用的同一種條件。
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS amount
       FROM orders
      WHERE id = $1
        AND status = 'approved'
        AND paid_at IS NOT NULL
        AND paid_at >= TIMESTAMP '2026-07-01 00:00:00'
        AND paid_at <  TIMESTAMP '2026-08-01 00:00:00'`,
    [orderId]
  );
  assert.equal(Number(rows[0].amount), 777, "paid_at 的營收認列行為必須完全不變");

  // 新欄位存在但為 NULL —— 不影響上面的查詢。
  const { rows: cols } = await db.query(
    `SELECT payment_received_at, payment_due_at, review_due_at, payment_info_submitted_at
       FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(cols[0].payment_received_at, null);
  assert.equal(cols[0].payment_due_at, null, "付款期限數值尚未由產品拍板");
  assert.equal(cols[0].review_due_at, null, "審核 SLA 數值尚未由產品拍板");
  assert.equal(cols[0].payment_info_submitted_at, null);
});

test("payment_received_at: 可與 paid_at 表達不同時間（銀行入帳早於核准）", async () => {
  const buyer = await makeUser();
  const orderId = await makeApprovedOrder(buyer, `TIMESTAMP '2026-07-20 06:00:00'`);

  await db.query(
    `UPDATE orders SET payment_received_at = TIMESTAMP '2026-07-18 01:23:00' WHERE id = $1`,
    [orderId]
  );

  const { rows } = await db.query(
    `SELECT paid_at, payment_received_at,
            (payment_received_at < paid_at) AS received_before_approved
       FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(rows[0].received_before_approved, true, "銀行入帳可以早於 Admin 核准 —— 這正是要分開記的原因");
});

test("payment_received_at: 不接受未來時間", async () => {
  const buyer = await makeUser();
  const orderId = await makeApprovedOrder(buyer, `NOW()`);

  await assert.rejects(
    () =>
      db.query(`UPDATE orders SET payment_received_at = NOW() + INTERVAL '30 days' WHERE id = $1`, [
        orderId,
      ]),
    /orders_payment_received_not_future_check/,
    "「已經發生的事」不可能在未來"
  );
});

test("reported_*: 買家申報欄位的格式約束", async () => {
  const buyer = await makeUser();
  const orderId = await makeApprovedOrder(buyer, `NOW()`);
  const proofId = `mpp_pt_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO manual_payment_proofs(id, order_id, review_status, storage_status, uploaded_at)
     VALUES ($1, $2, 'pending', 'legacy_public', NOW())`,
    [proofId, orderId]
  );

  // 合法值可以寫入。
  await db.query(
    `UPDATE manual_payment_proofs
        SET reported_bank_name = '測試銀行', reported_account_last4 = '0417',
            reported_amount = 100, reported_transfer_at = NOW()
      WHERE id = $1`,
    [proofId]
  );
  const { rows } = await db.query(
    `SELECT reported_account_last4, reported_amount FROM manual_payment_proofs WHERE id = $1`,
    [proofId]
  );
  assert.equal(rows[0].reported_account_last4, "0417");
  assert.equal(Number(rows[0].reported_amount), 100);

  await assert.rejects(
    () => db.query(`UPDATE manual_payment_proofs SET reported_account_last4 = '12' WHERE id = $1`, [proofId]),
    /mpp_reported_last4_check/,
    "後四碼必須剛好四位數字"
  );
  await assert.rejects(
    () => db.query(`UPDATE manual_payment_proofs SET reported_amount = 0 WHERE id = $1`, [proofId]),
    /mpp_reported_amount_check/
  );
});

test("SLA: review_due_at 以 payment_info_submitted_at 起算，不以 payment_received_at 起算", async () => {
  const buyer = await makeUser();
  const orderId = await makeApprovedOrder(buyer, `NOW()`);

  // 情境：銀行 7/18 就入帳，但買家 7/22 才來告訴平台。
  await db.query(
    `UPDATE orders
        SET payment_received_at = TIMESTAMP '2026-07-18 01:00:00',
            payment_info_submitted_at = TIMESTAMP '2026-07-22 09:00:00'
      WHERE id = $1`,
    [orderId]
  );

  // 以 payment_info_submitted_at 起算（正確）：期限落在 7/22 之後。
  // 以 payment_received_at 起算（錯誤）：期限落在 7/19 —— 平台一得知就已經逾時。
  const { rows } = await db.query(
    `SELECT payment_info_submitted_at + INTERVAL '1 day' AS correct_due,
            payment_received_at        + INTERVAL '1 day' AS wrong_due,
            (payment_received_at + INTERVAL '1 day') < payment_info_submitted_at AS wrong_is_already_overdue
       FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(
    rows[0].wrong_is_already_overdue,
    true,
    "以銀行入帳時間起算會讓平台在得知的當下就已逾時 —— 這正是不得用它起算的原因"
  );
  assert.ok(rows[0].correct_due > rows[0].wrong_due);
});
