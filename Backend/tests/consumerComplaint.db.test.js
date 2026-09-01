/**
 * 消費申訴的資料庫測試（P1-09 Wave 2 #6 — Gate 3）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 本輪要鎖的不變條件：
 *
 *   1. 買家可對**自己的**訂單申訴；**不得**對他人訂單申訴。
 *   2. **被凍結的帳號仍可申訴**（帳號遭冒用者正是最需要這條管道的人）。
 *   3. 申訴**不依賴** `reports` —— 兩者完全分離。
 *   4. 買家可提供外部證據（檔案或文字參照）——
 *      **平台自己的紀錄不是唯一證據來源**。
 *   5. `statutory_due_at` 由單一 policy 計算，逾期偵測可用。
 *   6. **建立或處理申訴不動** `orders.status` / `paid_at` / `payment_received_at` /
 *      `entitlement_status`，也不建立 remedy case、不退款。
 *   7. `resolved` ≠ 已退款。
 *   8. 每次轉移都有 `activity_logs` 與案件歷程；內部註記不外流給申訴人。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const complaints = require("../services/consumerComplaint.service");
const remedy = require("../services/refundRemedy.service");
const sla = require("../utils/complaintSla");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;

const created = { users: [], materials: [], orders: [], items: [], complaints: [], cases: [] };

async function makeUser(role = "buyer", { frozen = false } = {}) {
  const id = `usr_cc_${uniq()}`;
  await db.query(
    `INSERT INTO users(id, email, password_hash, role, account_status, frozen_at, freeze_reason)
     VALUES ($1, $2, 'x', $3, $4, $5, $6)`,
    [
      id,
      `${id}@example.test`,
      role,
      frozen ? "frozen" : "active",
      frozen ? new Date() : null,
      frozen ? "測試凍結" : null,
    ]
  );
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_cc_${uniq()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status) VALUES ($1, $2, 100, $3, 'published')`,
    [id, `申訴測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

async function makeApprovedOrder(buyerId, materialId) {
  const orderId = `ord_cc_${uniq()}`;
  const itemId = `oi_cc_${uniq()}`;
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

async function open(input) {
  const r = await complaints.createComplaint(input);
  if (r.ok) created.complaints.push(r.complaint.id);
  return r;
}

test.after(async () => {
  try {
    if (created.complaints.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'consumer_complaint' AND target_id = ANY($1)`,
        [created.complaints]
      );
      await db.query(`DELETE FROM consumer_complaints WHERE id = ANY($1)`, [created.complaints]);
    }
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

test("create: 買家可對自己的訂單申訴；statutory_due_at 由單一 policy 計算", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  const { orderId, itemId } = await makeApprovedOrder(buyer, materialId);

  const r = await open({
    buyerId: buyer,
    orderId,
    orderItemId: itemId,
    complaintType: "payment",
    subject: "重複扣款",
    statement: "我匯了兩次，第二次沒有被沖銷。",
    actorId: buyer,
    actorRole: "parent",
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.complaint.status, "submitted");
  assert.equal(r.complaint.buyer_id, buyer);
  assert.equal(r.complaint.order_item_id, itemId);

  const expected = sla.statutoryDueAt(r.complaint.submitted_at);
  assert.equal(
    new Date(r.complaint.statutory_due_at).getTime(),
    expected.getTime(),
    "期限必須來自 utils/complaintSla.js，不得就地另算"
  );
  // 寫進 DB 的值必須是**台灣日曆日的末日終了**（民法 §121 I），
  // 而末日 ＝ 申訴日 + 15 個台灣日曆日（民法 §120 II 始日不算入）。
  const submittedDay = sla.taiwanCalendarDate(r.complaint.submitted_at);
  assert.equal(
    sla.taiwanCalendarDate(r.complaint.statutory_due_at),
    sla.addCalendarDays(submittedDay, 15),
    "末日必須是申訴日 + 15 天（曾誤算為 +16）"
  );
  assert.equal(
    new Date(r.complaint.statutory_due_at).toISOString().slice(11),
    "15:59:59.999Z",
    "期間終止在台北 23:59:59.999（＝ UTC 15:59:59.999）"
  );
  assert.equal(r.complaint.overdue, false);

  // 同一張訂單可以有多筆申訴（不同事由）—— 這正是 `reports` 的 UNIQUE 承接不了的。
  const second = await open({
    buyerId: buyer,
    orderId,
    complaintType: "download",
    subject: "下載失敗",
    statement: "點下載一直 503。",
    actorId: buyer,
  });
  assert.equal(second.ok, true);

  const mine = await complaints.listComplaints({ buyerId: buyer });
  assert.equal(mine.length, 2);
});

test("ownership: 不得對他人訂單申訴；order_item 必須屬於同一張訂單", async () => {
  const teacher = await makeUser("teacher");
  const owner = await makeUser();
  const stranger = await makeUser();
  const materialId = await makeMaterial(teacher);
  const { orderId, itemId } = await makeApprovedOrder(owner, materialId);
  const other = await makeApprovedOrder(owner, await makeMaterial(teacher));

  const r = await complaints.createComplaint({
    buyerId: stranger,
    orderId,
    complaintType: "payment",
    subject: "x",
    statement: "y",
    actorId: stranger,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "order_not_owned");

  const mismatch = await complaints.createComplaint({
    buyerId: owner,
    orderId,
    orderItemId: other.itemId,
    complaintType: "payment",
    subject: "x",
    statement: "y",
    actorId: owner,
  });
  assert.equal(mismatch.code, "order_item_mismatch");

  const orphanItem = await complaints.createComplaint({
    buyerId: owner,
    orderItemId: itemId,
    complaintType: "payment",
    subject: "x",
    statement: "y",
    actorId: owner,
  });
  assert.equal(orphanItem.code, "order_required_for_item");
});

test("frozen buyer: 被凍結的帳號仍可申訴，且可不綁訂單（帳號遭冒用）", async () => {
  const frozen = await makeUser("buyer", { frozen: true });
  const check = await db.query(`SELECT account_status FROM users WHERE id = $1`, [frozen]);
  assert.equal(check.rows[0].account_status, "frozen");

  const r = await open({
    buyerId: frozen,
    complaintType: "account_security",
    subject: "帳號被冒用",
    statement: "我沒有下這筆訂單，請立即處理。",
    actorId: frozen,
  });
  assert.equal(r.ok, true, "凍結帳號必須仍能提出申訴 —— 他可能正是被害人");
  assert.equal(r.complaint.order_id, null, "帳號層級的爭議不指向任何訂單");

  const ev = await complaints.addEvidence({
    complaintId: r.complaint.id,
    uploadedBy: frozen,
    externalReference: "已向 165 反詐騙專線報案，受理編號 TEST-0001",
  });
  assert.equal(ev.ok, true, "凍結帳號也必須能補件");
});

test("validation: type / subject / statement 必填且受限", async () => {
  const buyer = await makeUser();
  const base = { buyerId: buyer, actorId: buyer, subject: "s", statement: "t" };

  assert.equal((await complaints.createComplaint({ ...base, complaintType: "nope" })).code, "invalid_complaint_type");
  assert.equal(
    (await complaints.createComplaint({ ...base, complaintType: "other", subject: "   " })).code,
    "subject_required"
  );
  assert.equal(
    (await complaints.createComplaint({ ...base, complaintType: "other", statement: "" })).code,
    "statement_required"
  );
});

test("evidence: 檔案或文字參照皆可；結案後不得再補件", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const r = await open({
    buyerId: buyer,
    complaintType: "payment",
    subject: "轉帳沒入帳",
    statement: "我 8/20 已匯款。",
    actorId: buyer,
  });
  const id = r.complaint.id;

  const empty = await complaints.addEvidence({ complaintId: id, uploadedBy: buyer });
  assert.equal(empty.code, "evidence_required");

  const ref = await complaints.addEvidence({
    complaintId: id,
    uploadedBy: buyer,
    externalReference: "台銀 8/20 15:32 轉出 100 元，交易序號 A1234",
  });
  assert.equal(ref.ok, true, JSON.stringify(ref));

  const file = await complaints.addEvidence({
    complaintId: id,
    uploadedBy: buyer,
    file: {
      storageKey: `complaint-evidence/${require("crypto").randomUUID()}`,
      originalFilename: "transfer.png",
      mimeType: "image/png",
      sizeBytes: 1234,
      checksumSha256: "deadbeef",
    },
    note: "網銀轉帳截圖",
  });
  assert.equal(file.ok, true, JSON.stringify(file));

  const list = await complaints.listEvidence(id);
  assert.equal(list.length, 2);
  // **storage_key 與 checksum 不得外流。**
  for (const row of list) {
    assert.equal("storage_key" in row, false, "storage_key 不得出現在任何回傳值");
    assert.equal("checksum_sha256" in row, false, "checksum 不得出現在任何回傳值");
  }
  assert.equal(list.filter((e) => e.has_file).length, 1);

  // 結案後不得再補件。
  await complaints.transition({ complaintId: id, toStatus: "under_review", message: "受理", actorId: admin });
  await complaints.transition({
    complaintId: id,
    toStatus: "closed",
    message: "已結案",
    resolutionSummary: "款項已於 8/21 入帳，已通知申訴人。",
    actorId: admin,
  });
  const late = await complaints.addEvidence({
    complaintId: id,
    uploadedBy: buyer,
    externalReference: "補件",
  });
  assert.equal(late.code, "complaint_closed");
});

test("state machine: 轉移規則、message 必填、結案必須有處理結果", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const r = await open({
    buyerId: buyer,
    complaintType: "delivery",
    subject: "沒收到教材",
    statement: "付款後看不到下載。",
    actorId: buyer,
  });
  const id = r.complaint.id;
  const step = (toStatus, extra = {}) =>
    complaints.transition({ complaintId: id, toStatus, message: "處理中", actorId: admin, actorRole: "admin", ...extra });

  // message 必填。
  for (const message of [undefined, null, "", "  "]) {
    const bad = await complaints.transition({ complaintId: id, toStatus: "under_review", message, actorId: admin });
    assert.equal(bad.code, "message_required");
  }
  // submitted 不能直接 resolved。
  const jump = await step("resolved", { resolutionSummary: "x" });
  assert.equal(jump.ok, false);
  assert.equal(jump.code, "invalid_transition");
  assert.deepEqual(jump.allowed, ["under_review", "closed"]);

  assert.equal((await step("under_review")).ok, true);
  // resolved / closed 必須有處理結果。
  const noSummary = await step("resolved");
  assert.equal(noSummary.code, "resolution_summary_required");

  const responded = await step("responded", { message: "已回覆買家", visibleToBuyer: true });
  assert.equal(responded.ok, true);
  assert.ok(responded.complaint.responded_at);
  // 買家不滿意可以回到審理中 —— 沒有這條路只會逼出「開第二張申訴」。
  assert.equal((await step("under_review", { message: "買家追問" })).ok, true);

  const resolved = await step("resolved", {
    message: "已完成處理",
    resolutionSummary: "已重新開通下載，並確認買家取得檔案。",
  });
  assert.equal(resolved.ok, true);
  assert.ok(resolved.complaint.resolved_at);

  const closed = await step("closed", { message: "結案", resolutionSummary: "同上" });
  assert.equal(closed.ok, true);
  // closed 是終態。
  for (const to of ["under_review", "responded", "resolved"]) {
    assert.equal((await step(to, { resolutionSummary: "x" })).ok, false, `closed → ${to} 必須被拒絕`);
  }
});

test("SLA: 逾期偵測用 DB 條件，且已結案不再計為逾期", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const r = await open({
    buyerId: buyer,
    complaintType: "other",
    subject: "逾期測試",
    statement: "x",
    actorId: buyer,
  });
  const id = r.complaint.id;

  // 把期限推到過去（模擬十六天前提出）。
  await db.query(
    `UPDATE consumer_complaints
        SET submitted_at = NOW() - interval '20 days', statutory_due_at = NOW() - interval '4 days'
      WHERE id = $1`,
    [id]
  );

  const overdue = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
  assert.ok(overdue.some((c) => c.id === id), "未結案且已過期限必須被列為逾期");
  const one = await complaints.getComplaint(id);
  assert.equal(one.overdue, true);
  assert.ok(one.daysUntilDue < 0);

  await complaints.transition({ complaintId: id, toStatus: "under_review", message: "受理", actorId: admin });
  await complaints.transition({
    complaintId: id,
    toStatus: "resolved",
    message: "已處理",
    resolutionSummary: "已完成處理並回覆。",
    actorId: admin,
  });
  const after = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
  assert.equal(after.some((c) => c.id === id), false, "已結案的申訴不應再出現在逾期待辦");
  assert.equal((await complaints.getComplaint(id)).overdue, false);
});

test("separation: 申訴不動 orders / entitlement，也不自動建立 remedy case", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);
  const { orderId } = await makeApprovedOrder(buyer, materialId);

  const before = await db.query(
    `SELECT o.status, o.paid_at, o.payment_received_at, oi.entitlement_status
       FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.id = $1`,
    [orderId]
  );

  const r = await open({
    buyerId: buyer,
    orderId,
    complaintType: "refund_request",
    subject: "要求退款",
    statement: "教材與說明不符。",
    actorId: buyer,
  });
  await complaints.transition({ complaintId: r.complaint.id, toStatus: "under_review", message: "受理", actorId: admin });
  await complaints.transition({
    complaintId: r.complaint.id,
    toStatus: "resolved",
    message: "已同意退款，另循補救流程辦理",
    resolutionSummary: "已同意退款，退款執行另由補救案件處理。",
    actorId: admin,
  });

  const after = await db.query(
    `SELECT o.status, o.paid_at, o.payment_received_at, oi.entitlement_status
       FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.id = $1`,
    [orderId]
  );
  assert.equal(after.rows[0].status, before.rows[0].status, "orders.status 不得被申訴流程改動");
  assert.deepEqual(after.rows[0].paid_at, before.rows[0].paid_at);
  assert.deepEqual(after.rows[0].payment_received_at, before.rows[0].payment_received_at);
  assert.equal(after.rows[0].entitlement_status, "active", "申訴不得自動撤銷授權");

  // **`resolved` ≠ 已退款。** 沒有任何 remedy case 被自動建立。
  const autoCase = await db.query(`SELECT COUNT(*)::int AS n FROM refund_remedy_cases WHERE order_id = $1`, [
    orderId,
  ]);
  assert.equal(autoCase.rows[0].n, 0, "申訴不得自動建立補救案件 —— 那是尚未做出的個案判斷");
  assert.equal((await complaints.getComplaint(r.complaint.id)).related_remedy_case_id, null);

  // linkage 由人在建立 remedy case 之後才寫入。
  const rc = await remedy.createCase({ orderId, caseType: "wrong_material", actorId: admin });
  created.cases.push(rc.case.id);
  const linked = await complaints.linkRemedyCase({
    complaintId: r.complaint.id,
    remedyCaseId: rc.case.id,
    actorId: admin,
    actorRole: "admin",
  });
  assert.equal(linked.ok, true, JSON.stringify(linked));
  assert.equal(linked.complaint.related_remedy_case_id, rc.case.id);
  // 關聯到別張訂單的補救案件必須被拒絕。
  const otherOrder = await makeApprovedOrder(buyer, await makeMaterial(teacher));
  const rc2 = await remedy.createCase({ orderId: otherOrder.orderId, caseType: "other", actorId: admin });
  created.cases.push(rc2.case.id);
  const wrong = await complaints.linkRemedyCase({
    complaintId: r.complaint.id,
    remedyCaseId: rc2.case.id,
    actorId: admin,
  });
  assert.equal(wrong.code, "order_mismatch");
});

test("audit: activity_logs ＋ 案件歷程；內部註記不外流給申訴人", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const r = await open({
    buyerId: buyer,
    complaintType: "material_mismatch",
    subject: "內容不符",
    statement: "與商品頁描述不同。",
    actorId: buyer,
    actorRole: "parent",
  });
  const id = r.complaint.id;

  await complaints.transition({
    complaintId: id,
    toStatus: "under_review",
    message: "內部：先請創作者說明",
    visibleToBuyer: false,
    actorId: admin,
    actorRole: "admin",
  });
  await complaints.transition({
    complaintId: id,
    toStatus: "responded",
    message: "已請創作者補充說明，將於三日內回覆。",
    visibleToBuyer: true,
    actorId: admin,
    actorRole: "admin",
  });

  const all = await complaints.listEvents(id);
  assert.deepEqual(all.map((e) => e.event_type), ["submitted", "internal_note", "response_to_buyer"]);
  const buyerView = await complaints.listEvents(id, { forBuyer: true });
  assert.deepEqual(buyerView.map((e) => e.event_type), ["submitted", "response_to_buyer"]);
  assert.equal(
    buyerView.some((e) => e.message.includes("先請創作者說明")),
    false,
    "內部註記不得出現在申訴人視角"
  );

  // **不依賴 `activity_logs.id` 排序** —— `id` 是 UUID（identity 不是 time），
  // 因此 `ORDER BY id` 不代表時序。canonical 已於 `SCHEMA-01` 對齊實況。
  const logs = await db.query(
    `SELECT action, meta FROM activity_logs
      WHERE target_type = 'consumer_complaint' AND target_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  assert.equal(logs.rows.length, 3);
  const submitted = logs.rows.filter((l) => l.action === "complaint.submitted");
  assert.equal(submitted.length, 1);
  assert.equal(logs.rows.filter((l) => l.action === "complaint.status_changed").length, 2);
  assert.ok(submitted[0].meta.statutoryDueAt, "建立時就記下法定期限");
});

test("non-regression: reports 與 refund_remedy_cases 完全不受影響", async () => {
  // 三張表的 id 空間不得混用。
  const mixed = await db.query(
    `SELECT (SELECT COUNT(*) FROM reports WHERE id IN (SELECT id FROM consumer_complaints))::int AS r,
            (SELECT COUNT(*) FROM refund_remedy_cases WHERE id IN (SELECT id FROM consumer_complaints))::int AS c`
  );
  assert.equal(mixed.rows[0].r, 0);
  assert.equal(mixed.rows[0].c, 0);

  // 沒有任何申訴憑空產生 remedy case。
  const orphanLinks = await db.query(
    `SELECT COUNT(*)::int AS n FROM consumer_complaints cc
      WHERE cc.related_remedy_case_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM refund_remedy_cases rc WHERE rc.id = cc.related_remedy_case_id)`
  );
  assert.equal(orphanLinks.rows[0].n, 0);

  // 全表：每一筆申訴都有法定期限（NOT NULL 之外再確認沒有 0 值時間）。
  const noDue = await db.query(
    `SELECT COUNT(*)::int AS n FROM consumer_complaints WHERE statutory_due_at <= submitted_at`
  );
  assert.equal(noDue.rows[0].n, 0, "期限必須晚於申訴時間");
});
