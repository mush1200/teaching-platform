/**
 * 逾期申訴告警的資料庫測試（P1-09 Wave 2 #11 — Gate 3）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 本輪的核心風險
 *
 * 告警最容易壞掉的方式**不是算錯**，而是**兩個地方各算一次**：
 * dashboard 說「3 件逾期」，點進佇列只看到 2 件 —— 一旦發生，
 * Admin 就再也不會相信那個數字，告警等於沒有。
 *
 * 因此這裡逐案斷言三者**永遠一致**：
 *
 *   1. `complaintSla.isOverdue()`（單筆的 JS 判定，UI 顯示用）
 *   2. `listComplaints({ overdueOnly })`（`?overdue=1` 的 DB 條件）
 *   3. `countOverdue()`（dashboard 告警數字）
 *
 * ## Terminal-state correctness
 *
 * `submitted` / `under_review` / `responded` 過期 → **actionable overdue**。
 * `resolved` / `closed` 過期 → **不得**造成任何告警。
 * 已處理完的案件不是待辦；對它示警只會讓真正的逾期被淹沒。
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
const sla = require("../utils/complaintSla");
const dashboard = require("../services/adminDashboard.service");
const { resolveReportingRange } = require("../utils/reportingRange");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], complaints: [] };

async function makeUser(role = "buyer") {
  const id = `usr_ov_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

/**
 * 建立一筆申訴並直接把 `statutory_due_at` 推到過去／未來。
 *
 * **不改系統時間** —— 只調整這一列的期限欄位，其餘一切走正常流程。
 */
async function makeComplaint(buyer, { overdueDays = null, status = "submitted" } = {}) {
  const r = await complaints.createComplaint({
    buyerId: buyer,
    complaintType: "other",
    subject: `逾期告警測試 ${uniq()}`,
    statement: "x",
    actorId: buyer,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  created.complaints.push(r.complaint.id);
  const id = r.complaint.id;

  if (overdueDays != null) {
    await db.query(
      `UPDATE consumer_complaints
          SET statutory_due_at = NOW() - ($2 || ' days')::interval
        WHERE id = $1`,
      [id, String(overdueDays)]
    );
  }
  if (status !== "submitted") {
    // 直接設狀態：本檔測的是 overdue 判定，不是狀態機（那由 consumerComplaint.db.test.js 覆蓋）。
    await db.query(
      `UPDATE consumer_complaints
          SET status = $2,
              resolution_summary = CASE WHEN $2 IN ('resolved','closed') THEN '測試處理結果' ELSE resolution_summary END,
              resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE resolved_at END,
              closed_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE closed_at END
        WHERE id = $1`,
      [id, status]
    );
  }
  return id;
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
    if (created.users.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("期限未到的 active 申訴：overdue=false，不進告警", async () => {
  const buyer = await makeUser();
  const id = await makeComplaint(buyer); // 預設 15 日後到期
  const one = await complaints.getComplaint(id);
  assert.equal(one.overdue, false);
  assert.ok(one.daysUntilDue > 0);

  const list = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
  assert.equal(list.some((c) => c.id === id), false, "未到期不得出現在 overdue 佇列");
});

test("期限已過的 active 申訴：三種狀態都是 actionable overdue", async () => {
  const buyer = await makeUser();
  for (const status of ["submitted", "under_review", "responded"]) {
    const id = await makeComplaint(buyer, { overdueDays: 2, status });
    const one = await complaints.getComplaint(id);
    assert.equal(one.overdue, true, `${status} 過期後必須是 overdue`);
    assert.equal(one.daysUntilDue, -2, `${status} 應顯示已逾期 2 天`);

    const list = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
    assert.ok(list.some((c) => c.id === id), `${status} 必須出現在 overdue 佇列`);
  }
});

test("terminal-state correctness：resolved / closed 過期也不得造成 actionable overdue", async () => {
  const buyer = await makeUser();
  const before = await complaints.countOverdue();

  for (const status of ["resolved", "closed"]) {
    const id = await makeComplaint(buyer, { overdueDays: 30, status });
    const one = await complaints.getComplaint(id);
    assert.equal(one.status, status);
    // 單筆判定
    assert.equal(one.overdue, false, `**${status} 不得回 overdue=true**`);
    assert.equal(sla.isOverdue(one), false);
    // 佇列
    const list = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
    assert.equal(
      list.some((c) => c.id === id),
      false,
      `${status} 不得出現在 overdue 佇列`
    );
  }

  // 告警數字完全沒有被這兩筆推高。
  assert.equal(
    await complaints.countOverdue(),
    before,
    "**已處理完的逾期案件不得讓告警數字上升**"
  );
});

test("三個 consumer 永遠一致：isOverdue ／ ?overdue=1 ／ countOverdue", async () => {
  const buyer = await makeUser();
  // 混合資料：2 筆 active 逾期、1 筆 active 未逾期、2 筆 terminal 逾期。
  const active = [
    await makeComplaint(buyer, { overdueDays: 1, status: "submitted" }),
    await makeComplaint(buyer, { overdueDays: 5, status: "responded" }),
  ];
  await makeComplaint(buyer, { status: "under_review" });
  await makeComplaint(buyer, { overdueDays: 9, status: "resolved" });
  await makeComplaint(buyer, { overdueDays: 9, status: "closed" });

  const list = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
  const count = await complaints.countOverdue();

  // (1) 清單長度 === 計數
  assert.equal(list.length, count, "`?overdue=1` 的筆數必須等於 dashboard 的告警數字");
  // (2) 清單中每一筆的單筆判定都必須是 true
  for (const c of list) {
    assert.equal(c.overdue, true, `${c.id} 出現在 overdue 佇列卻回 overdue=false`);
    assert.equal(sla.isOverdue(c), true);
  }
  // (3) 我們建立的 active 逾期案件都在裡面
  for (const id of active) {
    assert.ok(list.some((c) => c.id === id), `${id} 應在 overdue 佇列`);
  }
});

test("dashboard summary 的 overdueComplaintsCount 與 countOverdue 相同", async () => {
  const buyer = await makeUser();
  await makeComplaint(buyer, { overdueDays: 3, status: "under_review" });

  // `getDashboardSummary` 需要一個已解析的期間（同 route 的用法）。
  const period = resolveReportingRange({ range: "30d" });
  const summary = await dashboard.getDashboardSummary(period);
  const direct = await complaints.countOverdue();
  assert.equal(
    summary.overdueComplaintsCount,
    direct,
    "**dashboard 與 service 必須用同一個判準** —— 數字對不上就毀掉告警可信度"
  );
  assert.ok(summary.overdueComplaintsCount >= 1);
});

test("狀態轉為 terminal 後，告警數字立刻下降（read-time，不需要 scheduler）", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const id = await makeComplaint(buyer, { overdueDays: 4, status: "under_review" });

  const before = await complaints.countOverdue();
  assert.equal((await complaints.getComplaint(id)).overdue, true);

  const r = await complaints.transition({
    complaintId: id,
    toStatus: "resolved",
    message: "已完成處理",
    resolutionSummary: "已回覆申訴人並完成處理。",
    actorId: admin,
  });
  assert.equal(r.ok, true, JSON.stringify(r));

  // **不需要任何排程或背景工作** —— 下一次讀取就已經正確。
  assert.equal((await complaints.getComplaint(id)).overdue, false);
  assert.equal(await complaints.countOverdue(), before - 1, "告警數字必須立刻反映 canonical state");
  const list = await complaints.listComplaints({ overdueOnly: true, limit: 200 });
  assert.equal(list.some((c) => c.id === id), false);
});

test("佇列排序：期限最近的在最前面，逾期案件不會被普通 pending 淹沒", async () => {
  const buyer = await makeUser();
  const future = await makeComplaint(buyer, { status: "submitted" }); // 15 日後到期
  const overdue = await makeComplaint(buyer, { overdueDays: 7, status: "submitted" });

  // 不帶 overdueOnly 的全量佇列 —— 這是 Admin 預設看到的畫面。
  const all = await complaints.listComplaints({ limit: 200 });
  const posOverdue = all.findIndex((c) => c.id === overdue);
  const posFuture = all.findIndex((c) => c.id === future);
  assert.ok(posOverdue >= 0 && posFuture >= 0);
  assert.ok(
    posOverdue < posFuture,
    "**逾期案件必須排在未到期案件之前** —— 否則會被普通 pending 淹沒"
  );

  // 期限單調遞增 —— 排序由 backend 保證，前端不需要也不得重排。
  for (let i = 1; i < all.length; i += 1) {
    assert.ok(
      new Date(all[i - 1].statutory_due_at) <= new Date(all[i].statutory_due_at),
      "佇列必須依 statutory_due_at 遞增排序"
    );
  }
});

test("OVERDUE_SQL 是唯一判準 —— dashboard 未自行手寫條件", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "services", "adminDashboard.service.js"),
    "utf8"
  );
  assert.ok(
    src.includes("consumerComplaint.OVERDUE_SQL"),
    "dashboard 必須引用 consumerComplaint.OVERDUE_SQL"
  );
  assert.equal(
    src.includes("status IN ('submitted', 'under_review', 'responded')"),
    false,
    "**dashboard 不得手寫 overdue 的 status 清單** —— 那就是第二套判準"
  );
  assert.match(complaints.OVERDUE_SQL, /statutory_due_at < NOW\(\)/);
  assert.match(complaints.OVERDUE_SQL, /'submitted', 'under_review', 'responded'/);
});
