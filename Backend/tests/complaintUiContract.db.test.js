/**
 * 申訴 UI 所依賴之 API 契約的資料庫測試（P1-09 Wave 2 #10 — Gate 3）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * Wave 2 #6 已經測過 service 層的商業規則。**本檔測的是不同的東西**：
 * 「UI 需要的每個欄位，backend 是否真的提供，且是否為 canonical 值」。
 *
 * 具體不變條件：
 *
 *   1. UI 用到的狀態／類型／轉移表與 backend **逐字一致**
 *      —— 前端的 `lib/complaint-labels.ts` 不得漂移。
 *   2. 買家視角的歷程**不含** `internal_note`；Admin 視角**含**。
 *   3. 逾期與法定期限是 backend 的衍生值（`overdue` / `daysUntilDue` / `statutory_due_at`），
 *      **前端不得自行推算**，因此 API 必須提供它們。
 *   4. 證據清單**永遠不含** `storage_key` / `checksum_sha256`。
 *   5. 終態（`closed`）沒有任何合法轉移 —— UI 據此停止顯示處理表單。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const complaints = require("../services/consumerComplaint.service");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], orders: [], complaints: [] };

async function makeUser(role = "buyer") {
  const id = `usr_cu_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeOrder(buyerId) {
  const orderId = `ord_cu_${uniq()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'approved', 'manual_transfer', 480, 480, 0)`,
    [orderId, buyerId]
  );
  created.orders.push(orderId);
  return orderId;
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
    if (created.orders.length) {
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

test("前端 label 表與 backend canonical 值**逐字一致**（狀態／類型／轉移）", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "frontend", "apps", "web", "lib", "complaint-labels.ts"),
    "utf8"
  );

  // 狀態
  for (const status of complaints.STATUSES) {
    assert.ok(src.includes(`"${status}"`), `前端缺少狀態 ${status}`);
  }
  // 類型
  for (const type of complaints.COMPLAINT_TYPES) {
    assert.ok(src.includes(`"${type}"`), `前端缺少類型 ${type}`);
  }
  // 轉移表：逐條比對前端宣告的 allowed 陣列。
  for (const [from, allowed] of Object.entries(complaints.TRANSITIONS)) {
    const expected = `${from}: [${allowed.map((a) => `"${a}"`).join(", ")}]`;
    assert.ok(
      src.includes(expected),
      `前端轉移表與 backend 不符：預期出現 \`${expected}\``
    );
  }
});

test("買家視角歷程不含 internal_note；Admin 視角含（UI 據此分流）", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const r = await open({
    buyerId: buyer,
    complaintType: "payment",
    subject: "UI 契約測試",
    statement: "x",
    actorId: buyer,
  });
  const id = r.complaint.id;

  await complaints.transition({
    complaintId: id,
    toStatus: "under_review",
    message: "內部：先查銀行",
    visibleToBuyer: false,
    actorId: admin,
  });
  await complaints.transition({
    complaintId: id,
    toStatus: "responded",
    message: "已回覆買家",
    visibleToBuyer: true,
    actorId: admin,
  });

  const adminView = await complaints.listEvents(id);
  const buyerView = await complaints.listEvents(id, { forBuyer: true });
  assert.ok(adminView.some((e) => e.event_type === "internal_note"), "Admin 必須看得到內部註記");
  assert.equal(
    buyerView.some((e) => e.event_type === "internal_note"),
    false,
    "**買家視角不得出現內部註記**"
  );
  assert.ok(buyerView.some((e) => e.event_type === "response_to_buyer"));
});

test("API 提供 UI 需要的所有欄位，含 backend 衍生的逾期資訊", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);
  const r = await open({
    buyerId: buyer,
    orderId,
    complaintType: "duplicate_payment",
    subject: "重複扣款",
    statement: "匯了兩次",
    actorId: buyer,
  });

  // 清單與詳情都必須帶得出 UI 要渲染的欄位。
  for (const row of [r.complaint, await complaints.getComplaint(r.complaint.id)]) {
    for (const field of [
      "id",
      "buyer_id",
      "order_id",
      "complaint_type",
      "subject",
      "statement",
      "status",
      "submitted_at",
      "statutory_due_at",
      "resolution_summary",
      "related_remedy_case_id",
    ]) {
      assert.ok(field in row, `缺少 UI 需要的欄位 ${field}`);
    }
    // **衍生欄位必須由 backend 提供** —— 前端不得自行推算法定期限。
    assert.equal(typeof row.overdue, "boolean", "overdue 必須由 backend 提供");
    assert.equal(typeof row.daysUntilDue, "number", "daysUntilDue 必須由 backend 提供");
    assert.ok(row.statutory_due_at, "statutory_due_at 必須有值");
  }
});

test("逾期清單由 DB 條件產生 —— UI 的 `?overdue=1` 不是前端過濾", async () => {
  const buyer = await makeUser();
  const r = await open({
    buyerId: buyer,
    complaintType: "other",
    subject: "逾期契約測試",
    statement: "x",
    actorId: buyer,
  });
  const id = r.complaint.id;
  assert.equal((await complaints.getComplaint(id)).overdue, false);

  await db.query(
    `UPDATE consumer_complaints SET statutory_due_at = NOW() - interval '2 days' WHERE id = $1`,
    [id]
  );
  const overdueList = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
  assert.ok(overdueList.some((c) => c.id === id), "已逾期者必須出現在 overdue 清單");
  const one = await complaints.getComplaint(id);
  assert.equal(one.overdue, true);
  assert.ok(one.daysUntilDue < 0, "UI 顯示「已逾期 N 天」需要負數");
});

test("證據清單永遠不含 storage_key / checksum（UI 拿不到就洩不出去）", async () => {
  const buyer = await makeUser();
  const r = await open({
    buyerId: buyer,
    complaintType: "payment",
    subject: "證據契約",
    statement: "x",
    actorId: buyer,
  });
  await complaints.addEvidence({
    complaintId: r.complaint.id,
    uploadedBy: buyer,
    file: {
      storageKey: `complaint-evidence/${require("crypto").randomUUID()}`,
      originalFilename: "proof.png",
      mimeType: "image/png",
      sizeBytes: 100,
      checksumSha256: "deadbeef",
    },
  });
  const list = await complaints.listEvidence(r.complaint.id);
  assert.equal(list.length, 1);
  assert.equal("storage_key" in list[0], false);
  assert.equal("checksum_sha256" in list[0], false);
  // UI 用 `has_file` 決定顯示 📎 還是 📝。
  assert.equal(list[0].has_file, true);
  assert.equal(list[0].original_filename, "proof.png");
});

test("終態：closed 沒有任何合法轉移，UI 據此停止顯示處理表單", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const r = await open({
    buyerId: buyer,
    complaintType: "other",
    subject: "終態契約",
    statement: "x",
    actorId: buyer,
  });
  const id = r.complaint.id;
  await complaints.transition({
    complaintId: id,
    toStatus: "closed",
    message: "結案",
    resolutionSummary: "已於電話中處理完成。",
    actorId: admin,
  });

  assert.deepEqual(complaints.TRANSITIONS.closed, [], "closed 必須是終態");
  // 結案後買家也不得再補件 —— UI 因此不顯示補件表單。
  const late = await complaints.addEvidence({
    complaintId: id,
    uploadedBy: buyer,
    externalReference: "補件",
  });
  assert.equal(late.ok, false);
  assert.equal(late.code, "complaint_closed");
});

test("resolved ≠ 已退款：UI 不得把 resolved 呈現為退款完成", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const orderId = await makeOrder(buyer);
  const r = await open({
    buyerId: buyer,
    orderId,
    complaintType: "refund_request",
    subject: "要求退款",
    statement: "x",
    actorId: buyer,
  });
  await complaints.transition({ complaintId: r.complaint.id, toStatus: "under_review", message: "受理", actorId: admin });
  await complaints.transition({
    complaintId: r.complaint.id,
    toStatus: "resolved",
    message: "同意退款，另循補救流程",
    resolutionSummary: "已同意退款，退款執行另由補救案件處理。",
    actorId: admin,
  });

  const after = await complaints.getComplaint(r.complaint.id);
  assert.equal(after.status, "resolved");
  assert.equal(after.related_remedy_case_id, null, "resolved 不會自動產生補救案件");
  const cases = await db.query(`SELECT COUNT(*)::int AS n FROM refund_remedy_cases WHERE order_id = $1`, [
    orderId,
  ]);
  assert.equal(cases.rows[0].n, 0, "**resolved 不等於已退款**");
});
