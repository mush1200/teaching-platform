/**
 * 人工銀行退款執行紀錄的資料庫測試（P1-09 Wave 2 #5 — Gate 14）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 本輪要鎖住的核心是**三個事件永遠不得互相推導**：
 *
 *   CASE APPROVED  ≠  REFUND EXECUTED  ≠  TAX DOCUMENT REVERSED
 *
 * 具體到不變條件：
 *
 *   1. 只有 `remedy_pending`（且已核准）的案件可以執行退款。
 *   2. 實退不得超過核准；`approved_amount IS NULL`（非金錢補救）不得執行銀行退款。
 *   3. 金額／方式／時間／交易參考／執行者**原子寫入**，
 *      不存在「已完成但還沒有憑據」的中間狀態。
 *   4. 沒有交易參考的「已退款」不是憑據，是宣稱 —— 一律拒絕。
 *   5. **退款完成不動 `orders.status` / `paid_at` / `payment_received_at`。**
 *   6. **退款完成不自動變更 entitlement**，即使案件記錄了 `entitlement_action`。
 *   7. **退款完成不代表稅務憑證已沖銷**（schema 刻意沒有 tax 欄位）。
 *   8. **退款完成不動 Creator 營收／成交統計。**
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const remedy = require("../services/refundRemedy.service");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;

const created = { users: [], materials: [], orders: [], items: [], cases: [] };

async function makeUser(role = "buyer") {
  const id = `usr_rx_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_rx_${uniq()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status) VALUES ($1, $2, 100, $3, 'published')`,
    [id, `退款執行測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

async function makeApprovedOrder(buyerId, materialId) {
  const orderId = `ord_rx_${uniq()}`;
  const itemId = `oi_rx_${uniq()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price,
                        discount_amount, paid_at, payment_received_at)
     VALUES ($1, $2, 'approved', 'manual_transfer', 100, 100, 0, NOW(), NOW())`,
    [orderId, buyerId]
  );
  await db.query(
    `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, subtotal)
     VALUES ($1, $2, $3, 'fixture', 100, 1, 100)`,
    [itemId, orderId, materialId]
  );
  created.orders.push(orderId);
  created.items.push(itemId);
  return { orderId, itemId };
}

/**
 * 建立一個已經走到 `remedy_pending` 的案件。
 * `approvedAmount = null` 代表非金錢補救（例如重新交付）。
 */
async function pendingCase({ orderId, buyerId, admin, approvedAmount = 100, entitlementAction = null }) {
  const c = await remedy.createCase({
    orderId,
    caseType: "duplicate_payment",
    buyerStatement: "重複匯款",
    actorId: buyerId,
  });
  assert.equal(c.ok, true, JSON.stringify(c));
  created.cases.push(c.case.id);
  const id = c.case.id;
  await remedy.transition({ caseId: id, toStatus: "under_review", note: "受理", actorId: admin });
  await remedy.transition({
    caseId: id,
    toStatus: "approved",
    note: "同意退款",
    approvedAmount,
    entitlementAction,
    actorId: admin,
  });
  await remedy.transition({ caseId: id, toStatus: "remedy_pending", note: "待人工匯款", actorId: admin });
  return id;
}

test.after(async () => {
  try {
    if (created.cases.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'refund_remedy_case' AND target_id = ANY($1)`,
        [created.cases]
      );
      await db.query(`DELETE FROM refund_remedy_cases WHERE id = ANY($1)`, [created.cases]);
    }
    if (created.orders.length) {
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.materials.length) {
      await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("execute: 有效的人工退款 —— 五項證據原子寫入且案件完成", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const caseId = await pendingCase({ orderId, buyerId: buyer, admin });

  const paidAt = new Date("2026-08-26T09:30:00Z").toISOString();
  const r = await remedy.executeRefund({
    caseId,
    amount: 100,
    paymentReference: "CTBC-20260826-0001",
    paidAt,
    note: "網銀轉出，已核對回條",
    actorId: admin,
    actorRole: "admin",
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.case.status, "completed");
  assert.equal(r.case.refund_amount, 100);
  assert.equal(r.case.refund_method, "manual_bank_transfer");
  assert.equal(r.case.refund_reference, "CTBC-20260826-0001");
  assert.equal(r.case.completed_by, admin, "executed_by 沿用既有的 completed_by，不重複造欄位");
  assert.ok(r.case.refund_paid_at);
  assert.ok(r.case.completed_at);

  // 稅務欄位刻意不存在 —— 「已退款」不得被解讀為「憑證已沖銷」。
  assert.equal(
    "tax_reversal_status" in r.case,
    false,
    "schema 不得有 tax 欄位（P14 待會計師），更不得自動標成完成"
  );

  // 二次執行被狀態檢查擋在最前面（案件已 completed，不再是 remedy_pending）。
  // service 另有 `already_executed` 作為第二層防線，但在目前的 DB CHECK 之下
  // 「remedy_pending 卻已有 refund_paid_at」不可能成立，因此第一層就會先擋。
  const dup = await remedy.executeRefund({
    caseId,
    amount: 100,
    paymentReference: "CTBC-DUP",
    actorId: admin,
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.code, "invalid_state");
  assert.equal(dup.status, "completed");
});

test("execute: 只有 remedy_pending 可以執行 —— 其他狀態一律拒絕", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);

  const c = await remedy.createCase({ orderId, caseType: "access_failure", actorId: buyer });
  created.cases.push(c.case.id);
  const id = c.case.id;

  const try_ = () =>
    remedy.executeRefund({ caseId: id, amount: 50, paymentReference: "X", actorId: admin });

  let r = await try_(); // requested
  assert.equal(r.ok, false);
  assert.equal(r.code, "invalid_state");
  assert.equal(r.status, "requested");

  await remedy.transition({ caseId: id, toStatus: "under_review", note: "受理", actorId: admin });
  r = await try_();
  assert.equal(r.code, "invalid_state");

  // **approved 也不行** —— 「責任已核准」不是「可以匯款了」的同義詞，
  // 必須先進入 remedy_pending（＝已排入補救）。
  await remedy.transition({
    caseId: id,
    toStatus: "approved",
    note: "同意",
    approvedAmount: 100,
    actorId: admin,
  });
  r = await try_();
  assert.equal(r.code, "invalid_state");
  assert.equal(r.status, "approved");

  // 不存在的案件。
  const missing = await remedy.executeRefund({
    caseId: "rrc_nope",
    amount: 1,
    paymentReference: "X",
    actorId: admin,
  });
  assert.equal(missing.code, "case_not_found");
});

test("execute: 金額規則 —— 不得超過核准、必須為正整數、非金錢補救不得退款", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const caseId = await pendingCase({ orderId, buyerId: buyer, admin, approvedAmount: 100 });

  const over = await remedy.executeRefund({
    caseId,
    amount: 101,
    paymentReference: "X",
    actorId: admin,
  });
  assert.equal(over.ok, false);
  assert.equal(over.code, "amount_exceeds_approved");
  assert.equal(over.approvedAmount, 100);

  for (const amount of [0, -1, 1.5, null, undefined, "100"]) {
    const bad = await remedy.executeRefund({ caseId, amount, paymentReference: "X", actorId: admin });
    assert.equal(bad.code, "invalid_amount", `amount=${amount} 必須被拒絕`);
  }

  // 部分退款是合法的（核准 100、實退 80）。
  const partial = await remedy.executeRefund({
    caseId,
    amount: 80,
    paymentReference: "CTBC-PARTIAL",
    actorId: admin,
  });
  assert.equal(partial.ok, true, JSON.stringify(partial));
  assert.equal(partial.case.refund_amount, 80);
  assert.equal(partial.case.approved_amount, 100, "核准金額不得被實退金額覆寫");

  // 非金錢補救：approved_amount 為 NULL → 沒有銀行退款可執行。
  const { orderId: o2 } = await makeApprovedOrder(buyer, await makeMaterial(teacher));
  const nonCash = await pendingCase({ orderId: o2, buyerId: buyer, admin, approvedAmount: null });
  const r = await remedy.executeRefund({
    caseId: nonCash,
    amount: 50,
    paymentReference: "X",
    actorId: admin,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "non_cash_remedy");
});

test("execute: 缺交易參考或缺 actor 一律拒絕", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const caseId = await pendingCase({ orderId, buyerId: buyer, admin });

  for (const ref of [undefined, null, "", "   "]) {
    const r = await remedy.executeRefund({ caseId, amount: 100, paymentReference: ref, actorId: admin });
    assert.equal(r.code, "payment_reference_required", `reference=${JSON.stringify(ref)} 必須被拒絕`);
  }
  const noActor = await remedy.executeRefund({ caseId, amount: 100, paymentReference: "X" });
  assert.equal(noActor.code, "actor_required");

  // 全部失敗之後，案件必須完全沒被動過。
  const c = await remedy.getCase(caseId);
  assert.equal(c.status, "remedy_pending");
  assert.equal(c.refund_paid_at, null);
  assert.equal(c.refund_amount, null);
  assert.equal(c.completed_at, null);
});

test("evidence invariant: 繞過 service 直接寫 DB 也做不出「已完成但無憑據」", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const caseId = await pendingCase({ orderId, buyerId: buyer, admin, approvedAmount: 100 });

  // 已核准金錢退款的案件不得在無付款證據時被標成 completed。
  await assert.rejects(
    () => db.query(`UPDATE refund_remedy_cases SET status = 'completed' WHERE id = $1`, [caseId]),
    /rrc_cash_completion_requires_evidence|rrc_refund/
  );
  // 證據不得只有一半。
  await assert.rejects(
    () =>
      db.query(
        `UPDATE refund_remedy_cases SET status='completed', refund_paid_at=NOW(), refund_amount=100 WHERE id=$1`,
        [caseId]
      ),
    /rrc_refund_execution_atomic/
  );
  // 實退不得超過核准（四項證據齊全，只有金額超額）。
  await assert.rejects(
    () =>
      db.query(
        `UPDATE refund_remedy_cases
            SET status='completed', refund_paid_at=NOW(), refund_amount=999,
                refund_reference='X', refund_method='manual_bank_transfer'
          WHERE id=$1`,
        [caseId]
      ),
    /rrc_refund_within_approved/
  );
  // Phase 1 只有一種方式。
  await assert.rejects(
    () =>
      db.query(
        `UPDATE refund_remedy_cases
            SET status='completed', refund_paid_at=NOW(), refund_amount=100,
                refund_reference='X', refund_method='crypto'
          WHERE id=$1`,
        [caseId]
      ),
    /rrc_refund_method_check/
  );

  // 一般轉移路徑也走不通（service 層）。
  const bypass = await remedy.transition({
    caseId,
    toStatus: "completed",
    note: "偷偷完成",
    actorId: admin,
  });
  assert.equal(bypass.ok, false);
  assert.equal(bypass.code, "use_execute_refund");
});

test("separation: 退款完成不動 orders / entitlement / Creator 營收", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId, itemId } = await makeApprovedOrder(buyer, materialId);
  // 案件明確記錄了「應該撤銷授權」的意圖 —— 但退款執行仍不得自行執行它。
  const caseId = await pendingCase({
    orderId,
    buyerId: buyer,
    admin,
    approvedAmount: 100,
    entitlementAction: "revoke_pending",
  });

  const before = await db.query(
    `SELECT o.status, o.paid_at, o.payment_received_at, oi.entitlement_status,
            oi.price_snapshot, oi.subtotal, oi.fulfilled_material_version_id
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1`,
    [orderId]
  );
  const revenueBefore = await db.query(
    `SELECT COALESCE(SUM(oi.subtotal), 0)::int AS total, COUNT(*)::int AS units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       JOIN materials m ON m.id = oi.material_id
      WHERE m.teacher_id = $1 AND o.status = 'approved'`,
    [teacher]
  );

  const r = await remedy.executeRefund({
    caseId,
    amount: 100,
    paymentReference: "CTBC-SEP-01",
    actorId: admin,
    actorRole: "admin",
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(
    r.pendingEntitlementAction,
    "revoke_pending",
    "意圖會被回報給呼叫端 —— 但那只是回報"
  );

  const after = await db.query(
    `SELECT o.status, o.paid_at, o.payment_received_at, oi.entitlement_status,
            oi.price_snapshot, oi.subtotal, oi.fulfilled_material_version_id
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1`,
    [orderId]
  );
  assert.equal(after.rows[0].status, "approved", "退款完成 ≠ orders.status = cancelled");
  assert.deepEqual(after.rows[0].paid_at, before.rows[0].paid_at, "paid_at 不得被動");
  assert.deepEqual(
    after.rows[0].payment_received_at,
    before.rows[0].payment_received_at,
    "payment_received_at 不得被動"
  );
  assert.equal(
    after.rows[0].entitlement_status,
    "active",
    "**退款完成不得自動撤銷授權** —— 那需要另一個明示動作"
  );

  const revenueAfter = await db.query(
    `SELECT COALESCE(SUM(oi.subtotal), 0)::int AS total, COUNT(*)::int AS units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       JOIN materials m ON m.id = oi.material_id
      WHERE m.teacher_id = $1 AND o.status = 'approved'`,
    [teacher]
  );
  assert.deepEqual(
    revenueAfter.rows[0],
    revenueBefore.rows[0],
    "Creator 營收與成交數不得被退款執行改動（無 clawback、無 negative balance）"
  );

  // 授權欄位仍可由人另行操作 —— 只是不會自己動。
  const item = await db.query(`SELECT entitlement_status FROM order_items WHERE id = $1`, [itemId]);
  assert.equal(item.rows[0].entitlement_status, "active");
});

test("audit: refund.executed 帶完整執行證據", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const caseId = await pendingCase({ orderId, buyerId: buyer, admin });

  // 失敗的執行不得留下成功稽核。
  await remedy.executeRefund({ caseId, amount: 999, paymentReference: "X", actorId: admin });
  const none = await db.query(
    `SELECT COUNT(*)::int AS n FROM activity_logs
      WHERE target_type = 'refund_remedy_case' AND target_id = $1 AND action = 'refund.executed'`,
    [caseId]
  );
  assert.equal(none.rows[0].n, 0, "被拒絕的執行不得寫成功 audit");

  await remedy.executeRefund({
    caseId,
    amount: 90,
    paymentReference: "CTBC-AUDIT-1",
    actorId: admin,
    actorRole: "admin",
  });
  const { rows } = await db.query(
    `SELECT actor_id, actor_role, meta FROM activity_logs
      WHERE target_type = 'refund_remedy_case' AND target_id = $1 AND action = 'refund.executed'`,
    [caseId]
  );
  assert.equal(rows.length, 1);
  const m = rows[0].meta;
  assert.equal(rows[0].actor_id, admin);
  assert.equal(m.caseId, caseId);
  assert.equal(m.orderId, orderId);
  assert.equal(m.buyerId, buyer);
  assert.equal(m.amount, 90);
  assert.equal(m.approvedAmount, 100);
  assert.equal(m.method, "manual_bank_transfer");
  assert.equal(m.paymentReference, "CTBC-AUDIT-1");
  assert.equal(m.executedBy, admin);
  assert.ok(m.executedAt);
});

test("non-regression: 未執行退款的案件與既有訂單完全未被觸及", async () => {
  // 全表：有 refund_paid_at 的案件必然 completed 且四項證據齊全。
  const bad = await db.query(
    `SELECT COUNT(*)::int AS n FROM refund_remedy_cases
      WHERE refund_paid_at IS NOT NULL
        AND (status <> 'completed' OR refund_reference IS NULL
             OR refund_amount IS NULL OR refund_method IS NULL OR completed_by IS NULL)`
  );
  assert.equal(bad.rows[0].n, 0, "不得存在「宣稱已退款但證據不全」的列");

  // 全表：實退不得超過核准。
  const over = await db.query(
    `SELECT COUNT(*)::int AS n FROM refund_remedy_cases
      WHERE refund_amount IS NOT NULL AND (approved_amount IS NULL OR refund_amount > approved_amount)`
  );
  assert.equal(over.rows[0].n, 0);

  // 沒有任何已核准訂單因為退款而被改成 cancelled 且仍留有 paid_at 矛盾。
  const orders = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders o
      WHERE o.id IN (SELECT order_id FROM refund_remedy_cases WHERE refund_paid_at IS NOT NULL)
        AND o.status <> 'approved'`
  );
  assert.equal(orders.rows[0].n, 0, "已執行退款的訂單仍必須保留其交易歷史");

  // reports（內容檢舉）完全不受影響。
  const mixed = await db.query(
    `SELECT COUNT(*)::int AS n FROM reports WHERE id IN (SELECT id FROM refund_remedy_cases)`
  );
  assert.equal(mixed.rows[0].n, 0);
});
