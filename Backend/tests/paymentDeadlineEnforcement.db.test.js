/**
 * 付款期限 enforcement 的資料庫測試（P1-09 Wave 2 #12 — Gate 11 / Gate 6）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 政策（2026-08-27 產品拍板，Option A + A2）
 *
 * 付款期限限制的是：**買家必須在 `payment_due_at` 以前完成第一次有效提交。**
 *
 * ```text
 * payment_due_at IS NULL                     → allow（legacy exempt）
 * now <= payment_due_at                      → allow
 * now >  payment_due_at ＋ 曾有期限前成功提交  → allow（退件後可重傳）
 * now >  payment_due_at ＋ 從未有期限前提交    → reject
 * ```
 *
 * ## 這裡不測 UI，測的是 domain rule
 *
 * 特別是 **A2-3**：一次被拒絕的嘗試**不得**讓訂單取得「曾提交」資格。
 * 那是這個政策最容易被實作錯的地方 —— 如果 enforcement 寫在憑證列插入之後，
 * 或用「有沒有憑證列」當判準，被拒的嘗試就會自己把門打開。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const orderService = require("../services/orderService");
const policy = require("../utils/paymentTimingPolicy");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], orders: [] };

async function makeUser(role = "buyer") {
  const id = `usr_pe_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

/** `dueOffsetDays`：正數 = 期限在未來；負數 = 已逾期；`null` = legacy（無期限）。 */
async function makeOrder(buyerId, { dueOffsetDays = 7 } = {}) {
  const orderId = `ord_pe_${uniq()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price,
                        discount_amount, payment_due_at)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 480, 480, 0,
             CASE WHEN $3::text IS NULL THEN NULL ELSE NOW() + ($3 || ' days')::interval END)`,
    [orderId, buyerId, dueOffsetDays == null ? null : String(dueOffsetDays)]
  );
  created.orders.push(orderId);
  return orderId;
}

/**
 * 模擬一次**被接受**的提交：寫一列憑證（時間可指定）。
 *
 * 只有真正被 `paymentProof.service.storeUploads()` 接受的提交才會產生列，
 * 因此這正是 canonical evidence 的形狀。
 */
async function acceptedSubmission(orderId, uploadedBy, { atOffsetDays = 0 } = {}) {
  const { rows } = await db.query(
    `INSERT INTO manual_payment_proofs(order_id, storage_key, checksum_sha256, storage_status,
                                       proof_mime_type, proof_size_bytes, original_filename,
                                       uploaded_by, review_status, uploaded_at, created_at)
     VALUES ($1, $2, 'x', 'private', 'image/png', 10, 'p.png', $3, 'pending',
             NOW() + ($4 || ' days')::interval, NOW() + ($4 || ' days')::interval)
     RETURNING id`,
    [orderId, `payment-proofs/${require("crypto").randomUUID()}`, uploadedBy, String(atOffsetDays)]
  );
  return rows[0].id;
}

/** 直接呼叫唯一的 write gate。 */
async function attempt(orderId, userId, count = 1) {
  try {
    await orderService.uploadProof(orderId, userId, count, 3);
    return { ok: true };
  } catch (err) {
    return { ok: false, code: err.code, meta: err.meta };
  }
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
// 基本 enforcement
// ---------------------------------------------------------------------------

test("期限內：允許提交", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: 7 });
  assert.deepEqual(await attempt(orderId, buyer), { ok: true });
});

test("A2-2：從未成功提交，期限過後第一次提交 → 拒絕", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: -1 });
  const r = await attempt(orderId, buyer);
  assert.equal(r.ok, false);
  assert.equal(r.code, "PAYMENT_DEADLINE_EXPIRED");
  assert.equal(r.meta.reason, "deadline_expired");
});

test("A2-3：被拒絕的嘗試**不得**讓訂單取得「曾提交」資格", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: -1 });

  const first = await attempt(orderId, buyer);
  assert.equal(first.code, "PAYMENT_DEADLINE_EXPIRED");

  // **沒有任何部分寫入** —— 被拒絕的嘗試不得留下憑證列或改動訂單。
  const proofs = await db.query(
    `SELECT COUNT(*)::int AS n FROM manual_payment_proofs WHERE order_id = $1`,
    [orderId]
  );
  assert.equal(proofs.rows[0].n, 0, "被拒絕的提交不得寫入任何憑證列");
  const o = await db.query(
    `SELECT status, payment_info_submitted_at, review_due_at FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(o.rows[0].status, "pending_payment");
  assert.equal(o.rows[0].payment_info_submitted_at, null, "被拒絕的提交不得寫入提交時間");
  assert.equal(o.rows[0].review_due_at, null);

  // 第二次仍然被拒 —— 失敗不會累積成資格。
  const second = await attempt(orderId, buyer);
  assert.equal(second.code, "PAYMENT_DEADLINE_EXPIRED");
});

// ---------------------------------------------------------------------------
// A2：期限內曾提交過
// ---------------------------------------------------------------------------

test("A2-1：期限前提交 → 期限後被退件 → 期限後仍可重傳", async () => {
  const buyer = await makeUser();
  // 期限在 1 天前；提交發生在 3 天前（＝期限前）。
  const orderId = await makeOrder(buyer, { dueOffsetDays: -1 });
  const proofId = await acceptedSubmission(orderId, buyer, { atOffsetDays: -3 });

  // Admin 在期限之後才退件。
  await db.query(
    `UPDATE manual_payment_proofs SET review_status = 'rejected', rejection_reason = 'unreadable',
            reviewed_at = NOW() WHERE id = $1`,
    [proofId]
  );

  const r = await attempt(orderId, buyer);
  assert.deepEqual(r, { ok: true }, "**買家不得因平台審核時程而失去補件權利**");
});

test("A2-7：多筆憑證時，只要**任何一筆**在期限前即取得資格（不是只看最新）", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: -2 });
  // 第一筆在期限前（-5 天），第二筆在期限後（-1 天）。最新一筆是逾期的。
  await acceptedSubmission(orderId, buyer, { atOffsetDays: -5 });
  const latest = await acceptedSubmission(orderId, buyer, { atOffsetDays: -1 });
  await db.query(`UPDATE manual_payment_proofs SET review_status = 'rejected' WHERE id = $1`, [latest]);

  const r = await attempt(orderId, buyer);
  assert.deepEqual(r, { ok: true }, "只看最新一筆會誤判 —— 必須看全部憑證列");
});

test("反例：全部提交都在期限之後 → 仍然拒絕", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: -5 });
  // 兩筆都在期限之後（-3、-1 天，期限是 -5 天）。
  await acceptedSubmission(orderId, buyer, { atOffsetDays: -3 });
  await acceptedSubmission(orderId, buyer, { atOffsetDays: -1 });

  const r = await attempt(orderId, buyer);
  assert.equal(r.ok, false, "「有憑證列」不等於「期限前提交過」");
  assert.equal(r.code, "PAYMENT_DEADLINE_EXPIRED");
});

test("A2-6：legacy（`payment_due_at IS NULL`）行為完全不變", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: null });
  const o = await db.query(`SELECT payment_due_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(o.rows[0].payment_due_at, null);

  assert.deepEqual(await attempt(orderId, buyer), { ok: true }, "legacy 不受 enforcement 影響");
  // 退件後重傳同樣不受影響。
  const proofId = await acceptedSubmission(orderId, buyer, { atOffsetDays: -30 });
  await db.query(`UPDATE manual_payment_proofs SET review_status = 'rejected' WHERE id = $1`, [proofId]);
  assert.deepEqual(await attempt(orderId, buyer), { ok: true });
});

// ---------------------------------------------------------------------------
// Boundary / race
// ---------------------------------------------------------------------------

test("邊界：due_at > now 允許、due_at == now 允許、due_at < now 拒絕", async () => {
  const now = new Date("2026-09-01T15:59:59.999Z");
  const due = new Date("2026-09-01T15:59:59.999Z");
  const base = { hasTimelySubmission: false };

  assert.equal(
    policy.evaluatePaymentSubmission({ ...base, paymentDueAt: new Date(due.getTime() + 1) }, now).allowed,
    true,
    "due_at > now → 允許"
  );
  assert.equal(
    policy.evaluatePaymentSubmission({ ...base, paymentDueAt: due }, now).allowed,
    true,
    "**due_at == now 仍在期限內**（期間終止是末日之終了，不是之前）"
  );
  assert.equal(
    policy.evaluatePaymentSubmission({ ...base, paymentDueAt: new Date(due.getTime() - 1) }, now).allowed,
    false,
    "due_at < now → 拒絕（毫秒級）"
  );
});

test("判準的四種 reason 皆可辨識", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const past = new Date("2026-09-01T00:00:00Z");
  const future = new Date("2026-09-20T00:00:00Z");

  assert.equal(policy.evaluatePaymentSubmission({ paymentDueAt: null }, now).reason, "no_deadline");
  assert.equal(policy.evaluatePaymentSubmission({ paymentDueAt: future }, now).reason, "within_deadline");
  assert.equal(
    policy.evaluatePaymentSubmission({ paymentDueAt: past, hasTimelySubmission: true }, now).reason,
    "timely_resubmit"
  );
  assert.equal(
    policy.evaluatePaymentSubmission({ paymentDueAt: past, hasTimelySubmission: false }, now).reason,
    "deadline_expired"
  );
});

// ---------------------------------------------------------------------------
// Authorization 不得被 enforcement 改壞
// ---------------------------------------------------------------------------

test("authorization：non-owner 仍是 403，且不因期限錯誤洩漏訂單狀態", async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  // 一張已逾期且從未提交的訂單 —— owner 會拿到 PAYMENT_DEADLINE_EXPIRED。
  const orderId = await makeOrder(owner, { dueOffsetDays: -1 });

  const byStranger = await attempt(orderId, stranger);
  assert.equal(byStranger.code, "FORBIDDEN", "**ownership 必須先於期限檢查**");
  assert.notEqual(
    byStranger.code,
    "PAYMENT_DEADLINE_EXPIRED",
    "non-owner 不得由期限錯誤推知訂單存在且已逾期"
  );

  const byOwner = await attempt(orderId, owner);
  assert.equal(byOwner.code, "PAYMENT_DEADLINE_EXPIRED");

  // 不存在的訂單仍是 404（順序：存在 → 擁有權 → 狀態 → 期限）。
  const missing = await attempt("ord_does_not_exist", owner);
  assert.equal(missing.code, "NOT_FOUND");
});

test("已核准的訂單仍是 INVALID_STATUS，不會被期限檢查搶先", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer, { dueOffsetDays: -1 });
  await db.query(`UPDATE orders SET status = 'approved', paid_at = NOW() WHERE id = $1`, [orderId]);
  const r = await attempt(orderId, buyer);
  assert.equal(r.code, "INVALID_STATUS", "狀態檢查排在期限檢查之前");
});

// ---------------------------------------------------------------------------
// API 衍生欄位與 enforcement 一致
// ---------------------------------------------------------------------------

test("API 的 payment_submission_allowed 與 enforcement 結果**永遠一致**", async () => {
  const buyer = await makeUser();
  const buyerOrders = require("../services/buyerOrders.service");

  const cases = [
    { label: "期限內", dueOffsetDays: 7, timely: null, expect: true },
    { label: "逾期未提交過", dueOffsetDays: -1, timely: null, expect: false },
    { label: "逾期但期限前提交過", dueOffsetDays: -1, timely: -3, expect: true },
    { label: "legacy 無期限", dueOffsetDays: null, timely: null, expect: true },
  ];

  for (const c of cases) {
    const orderId = await makeOrder(buyer, { dueOffsetDays: c.dueOffsetDays });
    if (c.timely != null) await acceptedSubmission(orderId, buyer, { atOffsetDays: c.timely });

    const api = await buyerOrders.getBuyerOrder(orderId);
    assert.equal(
      api.payment_submission_allowed,
      c.expect,
      `${c.label}：API 的 payment_submission_allowed 應為 ${c.expect}`
    );

    const gate = await attempt(orderId, buyer);
    assert.equal(
      gate.ok,
      c.expect,
      `${c.label}：**API 說 ${api.payment_submission_allowed}，gate 卻是 ${gate.ok}** —— 兩者必須一致`
    );

    // `payment_deadline_expired` 只反映期限本身，與能否提交是兩件事。
    assert.equal(
      api.payment_deadline_expired,
      c.dueOffsetDays != null && c.dueOffsetDays < 0,
      `${c.label}：payment_deadline_expired`
    );
  }
});

test("non-regression：本輪未新增任何 order status，也未改動既有資料", async () => {
  const st = await db.query(`SELECT DISTINCT status FROM orders ORDER BY status`);
  assert.deepEqual(
    st.rows.map((r) => r.status),
    ["approved", "cancelled", "pending_payment"],
    "**不得引入 expired status**"
  );
  // legacy 訂單仍未被 backfill 期限。
  const legacy = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE created_at < TIMESTAMP '2026-08-26' AND payment_due_at IS NOT NULL`
  );
  assert.equal(legacy.rows[0].n, 0);
});
