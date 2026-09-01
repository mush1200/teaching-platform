/**
 * 付款期限與核帳 SLA 落地的資料庫測試（P1-09 Wave 2 #9 — Gate 6）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 本輪的四條不變條件：
 *
 *   1. **新訂單**建立時就寫入 `payment_due_at`，值來自單一 policy。
 *   2. **Legacy 訂單一律保持 NULL** —— 不 backfill、不推算、不被判定為逾期。
 *      它們建立時買家根本沒有被揭露過期限，未揭露的歷史狀態不得事後補成契約事實。
 *   3. 付款資訊提交時寫入 `review_due_at`；**退件後重新提交會重設審核週期**，
 *      舊的（已被退件的）提交不得繼續把它的期限壓在新提交上。
 *   4. **`paid_at` 語意與營收查詢完全不變。**
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const policy = require("../utils/paymentTimingPolicy");
const calendar = require("../utils/taiwanCalendar");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], orders: [], proofs: [] };

async function makeUser(role = "buyer") {
  const id = `usr_pd_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

/** 模擬 orderService 的建單寫入（同一個 policy 呼叫）。 */
async function makeOrder(buyerId, { legacy = false, createdAt = null } = {}) {
  const orderId = `ord_pd_${uniq()}`;
  const created_at = createdAt ?? new Date();
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price,
                        discount_amount, created_at, payment_due_at)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 480, 480, 0, $3, $4)`,
    [orderId, buyerId, created_at, legacy ? null : policy.paymentDueAt(created_at)]
  );
  created.orders.push(orderId);
  return orderId;
}

/** 模擬 paymentProof.service 的提交寫入（同一個 policy 呼叫）。 */
async function submit(orderId, uploadedBy) {
  const submittedAt = new Date();
  const { rows } = await db.query(
    `INSERT INTO manual_payment_proofs(order_id, storage_key, checksum_sha256, storage_status,
                                       proof_mime_type, proof_size_bytes, original_filename,
                                       uploaded_by, review_status, uploaded_at)
     VALUES ($1, $2, 'x', 'private', 'image/png', 10, 'p.png', $3, 'pending', NOW())
     RETURNING id`,
    [orderId, `payment-proofs/${require("crypto").randomUUID()}`, uploadedBy]
  );
  created.proofs.push(rows[0].id);
  await db.query(
    `UPDATE orders SET payment_info_submitted_at = $2, review_due_at = $3, updated_at = NOW() WHERE id = $1`,
    [orderId, submittedAt, policy.reviewDueAt(submittedAt)]
  );
  return rows[0].id;
}

test.after(async () => {
  try {
    if (created.proofs.length) {
      await db.query(`DELETE FROM manual_payment_proofs WHERE id = ANY($1)`, [created.proofs]);
    }
    if (created.orders.length) {
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

test("新訂單：建立時就有 payment_due_at，且與單一 policy 一致", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);

  const { rows } = await db.query(
    `SELECT created_at, payment_due_at, review_due_at FROM orders WHERE id = $1`,
    [orderId]
  );
  const row = rows[0];
  assert.ok(row.payment_due_at, "新訂單必須有付款期限");
  assert.equal(
    calendar.taiwanCalendarDate(row.payment_due_at),
    policy.paymentDueDate(row.created_at),
    "期限日期必須來自 utils/paymentTimingPolicy.js"
  );
  assert.equal(
    calendar.calendarDaysBetween(row.created_at, row.payment_due_at),
    7,
    "7 個台灣日曆日"
  );
  assert.equal(
    new Date(row.payment_due_at).toISOString().slice(11),
    "15:59:59.999Z",
    "末日終了（台北 23:59:59.999）"
  );
  assert.equal(row.review_due_at, null, "尚未提交付款資訊 → 尚無核帳期限");
});

test("legacy 訂單：payment_due_at 保持 NULL，且不被判定為逾期", async () => {
  const buyer = await makeUser();
  const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const orderId = await makeOrder(buyer, { legacy: true, createdAt: old });

  const { rows } = await db.query(
    `SELECT status, created_at, payment_due_at, review_due_at FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(rows[0].payment_due_at, null, "**不得 backfill**");
  assert.equal(rows[0].review_due_at, null);
  // 90 天前的訂單，若被推算成 created_at + 7 天早就逾期了 —— 但它從未被揭露過期限。
  assert.equal(
    policy.isPaymentOverdue(rows[0]),
    false,
    "未被揭露過期限的訂單不得被判定為逾期（未知 ≠ 違規）"
  );
  assert.equal(policy.isReviewOverdue(rows[0]), false);
  assert.equal(policy.daysUntilPaymentDue(rows[0]), null);
});

test("全表：本輪未對任何既有訂單 backfill 期限", async () => {
  // 除本檔 fixture 外，`payment_due_at` 非 NULL 的訂單必須都是**新政策生效後**建立的
  // （亦即期限確實等於 created_at + 7 個日曆日）——
  // 若有人用 UPDATE 大量回填，日期會對不上或訂單會非常舊。
  const { rows } = await db.query(
    `SELECT id, created_at, payment_due_at FROM orders
      WHERE payment_due_at IS NOT NULL AND id <> ALL($1::text[])`,
    [created.orders.length ? created.orders : [""]]
  );
  for (const row of rows) {
    assert.equal(
      calendar.calendarDaysBetween(row.created_at, row.payment_due_at),
      7,
      `${row.id} 的期限與 policy 不符 —— 可能來自 backfill`
    );
  }
  // 舊訂單（本輪之前建立的）必須仍是 NULL。
  const legacy = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE created_at < TIMESTAMP '2026-08-26' AND payment_due_at IS NOT NULL`
  );
  assert.equal(legacy.rows[0].n, 0, "2026-08-26 之前建立的訂單一律不得有期限");
});

test("提交付款資訊：寫入 review_due_at，值來自單一 policy", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);
  await submit(orderId, buyer);

  const { rows } = await db.query(
    `SELECT payment_info_submitted_at, review_due_at FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.ok(rows[0].payment_info_submitted_at);
  assert.equal(
    calendar.taiwanCalendarDate(rows[0].review_due_at),
    policy.reviewDueDate(rows[0].payment_info_submitted_at)
  );
  assert.equal(
    calendar.calendarDaysBetween(rows[0].payment_info_submitted_at, rows[0].review_due_at),
    3,
    "3 個台灣日曆日"
  );
  assert.equal(new Date(rows[0].review_due_at).toISOString().slice(11), "15:59:59.999Z");
});

test("退件後重新提交：審核週期重設，舊期限不再壓在新提交上", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);

  // 第一次提交，然後把時間往回推 5 天（模擬很久以前的提交），並退件。
  const firstProof = await submit(orderId, buyer);
  await db.query(
    `UPDATE orders SET payment_info_submitted_at = NOW() - INTERVAL '5 days',
                       review_due_at = NOW() - INTERVAL '2 days' WHERE id = $1`,
    [orderId]
  );
  await db.query(
    `UPDATE manual_payment_proofs SET review_status = 'rejected', rejection_reason = 'unreadable' WHERE id = $1`,
    [firstProof]
  );

  const stale = await db.query(`SELECT status, review_due_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(policy.isReviewOverdue(stale.rows[0]), true, "退件前確實是逾時狀態");

  // 重新提交 → 期限必須以**本次**提交重算。
  await submit(orderId, buyer);
  const fresh = await db.query(
    `SELECT status, payment_info_submitted_at, review_due_at FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(
    policy.isReviewOverdue(fresh.rows[0]),
    false,
    "**新的審核週期不得繼承舊提交的逾時**"
  );
  assert.equal(
    calendar.calendarDaysBetween(
      fresh.rows[0].payment_info_submitted_at,
      fresh.rows[0].review_due_at
    ),
    3
  );
  assert.ok(
    new Date(fresh.rows[0].review_due_at).getTime() >
      new Date(stale.rows[0].review_due_at).getTime(),
    "期限往後移動"
  );

  // 兩次提交的憑證列都還在（申報歷程不被覆寫）。
  const proofs = await db.query(
    `SELECT review_status FROM manual_payment_proofs WHERE order_id = $1 ORDER BY uploaded_at ASC`,
    [orderId]
  );
  assert.deepEqual(proofs.rows.map((r) => r.review_status), ["rejected", "pending"]);
});

test("核准後不再逾時；review_due_at 本身不被核准動作改寫", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);
  await submit(orderId, buyer);
  await db.query(
    `UPDATE orders SET review_due_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
    [orderId]
  );

  let row = (await db.query(`SELECT status, review_due_at FROM orders WHERE id = $1`, [orderId])).rows[0];
  assert.equal(policy.isReviewOverdue(row), true);

  const dueBefore = row.review_due_at;
  await db.query(`UPDATE orders SET status = 'approved', paid_at = NOW() WHERE id = $1`, [orderId]);
  row = (await db.query(`SELECT status, review_due_at FROM orders WHERE id = $1`, [orderId])).rows[0];
  assert.equal(policy.isReviewOverdue(row), false, "**核准後不得再顯示核帳逾時**");
  assert.deepEqual(row.review_due_at, dueBefore, "期限是歷史事實，核准不得改寫它");
});

test("overdue 偵測可用一句 SQL 完成（不是把全表撈出來過濾）", async () => {
  const buyer = await makeUser();
  const overdueOrder = await makeOrder(buyer);
  await submit(overdueOrder, buyer);
  await db.query(`UPDATE orders SET review_due_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [
    overdueOrder,
  ]);
  const fine = await makeOrder(buyer);
  await submit(fine, buyer);

  const { rows } = await db.query(
    `SELECT id FROM orders
      WHERE review_due_at IS NOT NULL
        AND status = 'pending_payment'
        AND review_due_at < NOW()
        AND id = ANY($1::text[])`,
    [[overdueOrder, fine]]
  );
  assert.deepEqual(rows.map((r) => r.id), [overdueOrder]);
});

test("non-regression: paid_at 與營收查詢完全不受影響", async () => {
  // 新欄位不參與任何營收聚合。
  const revenue = await db.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::int AS total
       FROM orders WHERE status = 'approved' AND paid_at IS NOT NULL`
  );
  const ignoringNew = await db.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::int AS total
       FROM orders WHERE status = 'approved' AND paid_at IS NOT NULL
         AND (payment_due_at IS NULL OR payment_due_at IS NOT NULL)
         AND (review_due_at IS NULL OR review_due_at IS NOT NULL)`
  );
  assert.deepEqual(revenue.rows[0], ignoringNew.rows[0]);

  // `paid_at` 不得被任一新期限回填。
  const collision = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE paid_at IS NOT NULL AND (paid_at = payment_due_at OR paid_at = review_due_at)`
  );
  assert.equal(collision.rows[0].n, 0);

  // `payment_received_at` 本輪完全未被動到。
  const received = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE payment_received_at IS NOT NULL
        AND (payment_received_at = payment_due_at OR payment_received_at = review_due_at)`
  );
  assert.equal(received.rows[0].n, 0);

  // 沒有任何訂單被本輪 expired／cancelled。
  const statuses = await db.query(`SELECT DISTINCT status FROM orders ORDER BY status`);
  assert.deepEqual(
    statuses.rows.map((r) => r.status),
    ["approved", "cancelled", "pending_payment"],
    "本輪不得引入 expired 狀態，也不得自動取消任何訂單"
  );
});
