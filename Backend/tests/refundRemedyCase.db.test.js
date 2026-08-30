/**
 * 退款／補救案件的資料庫測試（P1-09 Wave 2 #3 — Gate 14）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是八條不變條件：
 *
 *   1. 案件可獨立於 `reports`（內容檢舉）建立，且一張訂單可有**多個**案件。
 *   2. `order_item_id` 可選，但指定時必須屬於同一張訂單。
 *   3. 狀態轉移有明確規則；終態沒有出口。
 *   4. **`approved` ≠ 退款完成** —— 必須經 `remedy_pending` 才能 `completed`；
 *      未完成的案件不得帶有實際退款時間。
 *   5. **建立或核准案件都不改動 `orders.status` 與 `paid_at`。**
 *   6. **建立案件不會自動變更 entitlement** —— `entitlement_action` 只是記錄意圖。
 *   7. 每次轉移都有 `activity_logs` 稽核。
 *   8. `reports` 不受影響（兩套流程完全分離）。
 *
 * 第 4、5、6 條是本輪的核心：把「責任已核准」「錢真的退了」「授權被撤銷」
 * 「訂單被取消」四件事混在一起，帳務、客服與稽核會同時失準。
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
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], materials: [], orders: [], items: [], cases: [] };

async function makeUser(role = "buyer") {
  const id = `usr_rr_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_rr_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, 'published', NULL)`,
    [id, `退款案件測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

async function makeApprovedOrder(buyerId, materialId) {
  const orderId = `ord_rr_${uniqueSuffix()}`;
  const itemId = `oi_rr_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount, paid_at)
     VALUES ($1, $2, 'approved', 'manual_transfer', 100, 100, 0, NOW())`,
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

async function open(input) {
  const r = await remedy.createCase(input);
  if (r.ok) created.cases.push(r.case.id);
  return r;
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

test("create: 一張訂單可有多個案件，buyer_id 自訂單帶入", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  const { orderId, itemId } = await makeApprovedOrder(buyer, materialId);

  const first = await open({
    orderId,
    caseType: "duplicate_payment",
    buyerStatement: "重複匯款兩次",
    requestedAmount: 100,
    actorId: buyer,
  });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.case.buyer_id, buyer, "buyer_id 必須自訂單帶入，不信任呼叫端");
  assert.equal(first.case.status, "requested");
  assert.equal(first.case.order_item_id, null, "整張訂單的問題不需指向特定品項");

  const second = await open({
    orderId,
    orderItemId: itemId,
    caseType: "corrupted_or_unusable_file",
    buyerStatement: "PDF 開不起來",
    actorId: buyer,
  });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.case.order_item_id, itemId);

  const all = await remedy.listCases({ orderId });
  assert.equal(all.length, 2, "一張訂單可累積多個案件");
});

test("create: order_item 必須屬於同一張訂單；case_type 受限", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const matA = await makeMaterial(teacher);
  const matB = await makeMaterial(teacher);
  const a = await makeApprovedOrder(buyer, matA);
  const b = await makeApprovedOrder(buyer, matB);

  const mismatch = await remedy.createCase({
    orderId: a.orderId,
    orderItemId: b.itemId,
    caseType: "wrong_material",
    actorId: buyer,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "order_item_mismatch");

  const badType = await remedy.createCase({
    orderId: a.orderId,
    caseType: "i_just_changed_my_mind",
    actorId: buyer,
  });
  assert.equal(badType.ok, false);
  assert.equal(badType.code, "invalid_case_type");
});

test("state machine: approved 必須經 remedy_pending 才能 completed", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const c = await open({ orderId, caseType: "access_failure", actorId: buyer });

  const step = (toStatus, extra = {}) =>
    remedy.transition({ caseId: c.case.id, toStatus, note: "測試", actorId: admin, actorRole: "admin", ...extra });

  assert.equal((await step("under_review")).ok, true);
  assert.equal((await step("approved", { approvedAmount: 100 })).ok, true);

  // **核心**：approved 不得直接跳到 completed。
  const jump = await step("completed");
  assert.equal(jump.ok, false, "「責任已核准」不等於「錢真的退了」");
  assert.equal(jump.code, "invalid_transition");
  assert.deepEqual(jump.allowed, ["remedy_pending", "cancelled"]);

  assert.equal((await step("remedy_pending")).ok, true);

  // Wave 2 #5 起，已核准**金錢**退款的案件不得經由一般轉移完成 ——
  // 付款證據只能由 `executeRefund()` 原子寫入。
  const bypass = await step("completed");
  assert.equal(bypass.ok, false);
  assert.equal(bypass.code, "use_execute_refund");

  const done = await remedy.executeRefund({
    caseId: c.case.id,
    amount: 100,
    paymentReference: "TXN-0826",
    actorId: admin,
    actorRole: "admin",
  });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.ok(done.case.completed_at);
  assert.ok(done.case.refund_paid_at);
  assert.equal(done.case.refund_method, "manual_bank_transfer");

  // 終態沒有出口。
  for (const to of ["under_review", "approved", "cancelled"]) {
    const out = await step(to);
    assert.equal(out.ok, false, `completed → ${to} 必須被拒絕`);
  }
});

test("approved ≠ refunded: 未完成的案件不得帶有實際退款時間", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const c = await open({ orderId, caseType: "statutory_rescission", actorId: buyer });

  await remedy.transition({ caseId: c.case.id, toStatus: "under_review", note: "x", actorId: admin });
  const early = await remedy.transition({
    caseId: c.case.id,
    toStatus: "approved",
    note: "x",
    actorId: admin,
    refundPaidAt: new Date().toISOString(),
  });
  assert.equal(early.ok, false);
  assert.equal(early.code, "use_execute_refund");

  // 即使繞過 service，DB CHECK 仍然擋得住。
  // Wave 2 #5 起由更嚴的 `rrc_refund_execution_atomic` 先行擋下
  // （四個執行欄位必須全有或全無），`rrc_refund_paid_requires_completed` 仍在。
  await assert.rejects(
    () => db.query(`UPDATE refund_remedy_cases SET refund_paid_at = NOW() WHERE id = $1`, [c.case.id]),
    /rrc_refund_execution_atomic|rrc_refund_paid_requires_completed/
  );
});

test("note: 每個決定都必須說得出理由", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);
  const c = await open({ orderId, caseType: "other", actorId: buyer });

  for (const note of [undefined, null, "", "   "]) {
    const r = await remedy.transition({ caseId: c.case.id, toStatus: "under_review", note, actorId: admin });
    assert.equal(r.ok, false);
    assert.equal(r.code, "note_required");
  }
});

test("separation: 案件流程不改動 orders.status / paid_at，也不改動 entitlement", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId, itemId } = await makeApprovedOrder(buyer, materialId);

  const before = await db.query(
    `SELECT o.status, o.paid_at, oi.entitlement_status
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1`,
    [orderId]
  );

  const c = await open({ orderId, orderItemId: itemId, caseType: "material_takedown", actorId: buyer });
  await remedy.transition({ caseId: c.case.id, toStatus: "under_review", note: "調查中", actorId: admin });
  const approved = await remedy.transition({
    caseId: c.case.id,
    toStatus: "approved",
    note: "教材已下架，同意退款",
    approvedAmount: 100,
    entitlementAction: "revoke_pending",
    actorId: admin,
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.case.entitlement_action, "revoke_pending", "意圖已記錄");

  const after = await db.query(
    `SELECT o.status, o.paid_at, oi.entitlement_status
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1`,
    [orderId]
  );
  assert.equal(after.rows[0].status, before.rows[0].status, "訂單狀態不得被案件流程改動");
  assert.deepEqual(after.rows[0].paid_at, before.rows[0].paid_at, "paid_at 不得被改動");
  assert.equal(
    after.rows[0].entitlement_status,
    "active",
    "`entitlement_action` 只是意圖 —— 建立或核准案件不得自動撤銷授權"
  );
});

test("audit: 每次轉移都有 activity_logs", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);

  const c = await open({ orderId, caseType: "wrong_material", actorId: buyer, actorRole: "parent" });
  await remedy.transition({ caseId: c.case.id, toStatus: "under_review", note: "受理", actorId: admin, actorRole: "admin" });
  await remedy.transition({ caseId: c.case.id, toStatus: "rejected", note: "查無此情形", actorId: admin, actorRole: "admin" });

  const history = await remedy.listHistory(c.case.id);
  assert.equal(history.length, 3, "建立 ＋ 兩次轉移");
  assert.equal(history[0].meta.to, "rejected");
  assert.equal(history[0].meta.note, "查無此情形");
  assert.equal(history[2].action, "remedy_case.requested");
});

test("non-regression: reports（內容檢舉）完全不受影響，且歷史訂單無假 backfill", async () => {
  // 兩套流程分離：退款案件不會憑空出現在檢舉表，反之亦然。
  const { rows: r } = await db.query(
    `SELECT COUNT(*) AS n FROM reports WHERE id IN (SELECT id FROM refund_remedy_cases)`
  );
  assert.equal(Number(r[0].n), 0, "兩張表的 id 空間不得混用");

  const { rows: legacy } = await db.query(
    `SELECT COUNT(*) AS n FROM refund_remedy_cases WHERE id <> ALL($1::text[])`,
    [created.cases.length ? created.cases : [""]]
  );
  assert.equal(
    Number(legacy[0].n),
    0,
    "既有訂單沒有退款案件是事實 —— 不得 backfill"
  );
});
