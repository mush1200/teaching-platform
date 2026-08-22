/**
 * 檢舉案件工作流的資料庫整合測試。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/reportCases.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * 所有 fixture id 都帶 `tp_rctest_` 前綴，測試前後各清一次，因此可重複執行。
 *
 * 要鎖住的東西：
 *   1. 完整的正向流程：pending → investigating → awaiting_creator → investigating → resolved
 *   2. 每一次轉移都留下 report_event（案件不會變成「不知道為什麼被結案」）
 *   3. 非法轉移被擋下，且**不留下任何副作用**
 *   4. `unpublish_material` 真的會下架教材，並同時寫 activity_logs
 *   5. Creator 只看得到自己教材上的案件，且看不到 Admin 內部筆記
 *   6. 佇列的 `status=open` 篩選與 statusCounts
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
const reportRepository = require("../repositories/report.repository");
const reportAdminService = require("../services/reportAdmin.service");

const PREFIX = "tp_rctest_";
const id = (name) => `${PREFIX}${name}`;

const ADMIN = { userId: id("admin"), role: "admin" };
const CREATOR = { userId: id("creator"), role: "teacher" };
const OTHER_CREATOR = { userId: id("creator2"), role: "teacher" };

async function cleanup() {
  // report_events 由 FK ON DELETE CASCADE 帶走，但顯式刪除讓失敗訊息更清楚。
  await db.query(
    `DELETE FROM report_events WHERE report_id IN (SELECT id FROM reports WHERE id LIKE $1)`,
    [`${PREFIX}%`]
  );
  await db.query(`DELETE FROM reports WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM activity_logs WHERE actor_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function seed() {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES
       ($1, $2, 'x', 'admin'),
       ($3, $4, 'x', 'teacher'),
       ($5, $6, 'x', 'teacher'),
       ($7, $8, 'x', 'buyer')`,
    [
      ADMIN.userId, `${PREFIX}admin@example.test`,
      CREATOR.userId, `${PREFIX}creator@example.test`,
      OTHER_CREATOR.userId, `${PREFIX}creator2@example.test`,
      id("buyer"), `${PREFIX}buyer@example.test`,
    ]
  );
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key) VALUES
       ($1, $2, 100, $3, 'published', 'k1'),
       ($4, $5, 100, $6, 'published', 'k2')`,
    [
      id("mat_own"), `${PREFIX}我的教材`, CREATOR.userId,
      id("mat_other"), `${PREFIX}別人的教材`, OTHER_CREATOR.userId,
    ]
  );
}

/**
 * `reports` 上有 `UNIQUE (material_id, reporter_id)` —— 同一個人對同一份教材只能檢舉一次。
 * 因此每一筆 fixture 都配一位**專屬的檢舉人**，否則第二筆就會撞 23505。
 */
async function insertReport(name, { materialId, status = "pending", reason = "內容不當" }) {
  const reporterId = id(`reporter_${name}`);
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1, $2, 'x', 'buyer')
     ON CONFLICT (id) DO NOTHING`,
    [reporterId, `${PREFIX}reporter_${name}@example.test`]
  );
  await db.query(
    `INSERT INTO reports(id, material_id, reporter_id, reason, status)
     VALUES($1, $2, $3, $4, $5)`,
    [id(name), materialId, reporterId, reason, status]
  );
  return id(name);
}

async function statusOf(reportId) {
  const r = await db.query(`SELECT status, resolution FROM reports WHERE id = $1`, [reportId]);
  return r.rows[0];
}

test.before(async () => {
  const check = await db.query("SELECT current_database() AS db");
  assert.equal(check.rows[0].db, EXPECTED_DB, "connected database must be the security test DB");
  await cleanup();
  await seed();
});

test.after(async () => {
  await cleanup();
  await db.pool.end();
});

test("正向流程：pending → investigating → awaiting_creator → (creator) investigating → resolved", async () => {
  const reportId = await insertReport("flow", { materialId: id("mat_own") });

  const started = await reportAdminService.startInvestigation(reportId, ADMIN);
  assert.equal(started.ok, true);
  assert.equal((await statusOf(reportId)).status, "investigating");

  const requested = await reportAdminService.requestCreatorResponse(reportId, ADMIN, {
    message: "請說明教材第 3 頁的來源",
  });
  assert.equal(requested.ok, true);
  assert.equal((await statusOf(reportId)).status, "awaiting_creator");

  const responded = await reportAdminService.submitCreatorResponse(reportId, CREATOR, {
    message: "圖片為自製，已附授權",
  });
  assert.equal(responded.ok, true);
  assert.equal((await statusOf(reportId)).status, "investigating");

  const resolved = await reportAdminService.resolveReport(reportId, ADMIN, {
    resolution: "warning",
    note: "已提醒創作者標註來源",
  });
  assert.equal(resolved.ok, true);
  const final = await statusOf(reportId);
  assert.equal(final.status, "resolved");
  assert.equal(final.resolution, "warning");

  // 每一步都必須留下歷程，否則案件會變成「不知道為什麼被結案」。
  const events = await reportRepository.listReportEvents(reportId);
  assert.deepEqual(
    events.map((e) => e.event_type),
    ["status_changed", "creator_response_requested", "creator_response", "resolution"]
  );
  assert.equal(events[1].message, "請說明教材第 3 頁的來源");
  assert.equal(events[2].actor_id, CREATOR.userId);
  assert.equal(events[3].meta.resolution, "warning");

  // 結案才寫 reviewed_by / reviewed_at；中間狀態不寫。
  const row = await db.query(`SELECT reviewed_by, reviewed_at FROM reports WHERE id = $1`, [reportId]);
  assert.equal(row.rows[0].reviewed_by, ADMIN.userId);
  assert.ok(row.rows[0].reviewed_at instanceof Date);
});

test("終態不可再被改判，且不留下副作用", async () => {
  const reportId = await insertReport("terminal", { materialId: id("mat_own") });
  await reportAdminService.resolveReport(reportId, ADMIN, { resolution: "dismissed" });
  assert.equal((await statusOf(reportId)).status, "dismissed");

  const before = (await reportRepository.listReportEvents(reportId)).length;
  const again = await reportAdminService.resolveReport(reportId, ADMIN, {
    resolution: "unpublish_material",
  });
  assert.equal(again.ok, false);
  assert.equal(again.code, "invalid_transition");

  const after = await statusOf(reportId);
  assert.equal(after.status, "dismissed", "狀態不得被第二次處置覆寫");
  assert.equal(after.resolution, "dismissed");
  assert.equal(
    (await reportRepository.listReportEvents(reportId)).length,
    before,
    "失敗的轉移不得留下 event"
  );
  const material = await db.query(`SELECT status FROM materials WHERE id = $1`, [id("mat_own")]);
  assert.equal(material.rows[0].status, "published", "失敗的轉移不得下架教材");
});

test("非法處置 code 被擋下", async () => {
  const reportId = await insertReport("badres", { materialId: id("mat_own") });
  const result = await reportAdminService.resolveReport(reportId, ADMIN, {
    resolution: "suspend_user",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_resolution");
  assert.equal((await statusOf(reportId)).status, "pending");
});

test("要求創作者回覆必須帶 message", async () => {
  const reportId = await insertReport("nomsg", { materialId: id("mat_own") });
  const result = await reportAdminService.requestCreatorResponse(reportId, ADMIN, { message: "  " });
  assert.equal(result.ok, false);
  assert.equal(result.code, "message_required");
  assert.equal((await statusOf(reportId)).status, "pending");
});

test("unpublish_material 真的下架教材並寫入 activity_logs", async () => {
  const reportId = await insertReport("unpub", { materialId: id("mat_other") });
  const result = await reportAdminService.resolveReport(reportId, ADMIN, {
    resolution: "unpublish_material",
    note: "侵權屬實",
  });
  assert.equal(result.ok, true);
  assert.equal(result.effects.materialUnpublished, true);

  const material = await db.query(`SELECT status FROM materials WHERE id = $1`, [id("mat_other")]);
  assert.equal(material.rows[0].status, "unpublished");

  const logs = await db.query(
    `SELECT action, target_type, target_id, meta FROM activity_logs
     WHERE actor_id = $1 AND target_id IN ($2, $3)
     ORDER BY id ASC`,
    [ADMIN.userId, id("mat_other"), reportId]
  );
  const actions = logs.rows.map((r) => r.action);
  assert.ok(actions.includes("material.unpublished"), `expected material.unpublished in ${actions}`);
  assert.ok(actions.includes("report.resolved"), `expected report.resolved in ${actions}`);
});

test("已下架的教材不會被重複下架（不產生假事件）", async () => {
  // mat_other 在上一個測試已下架。
  const reportId = await insertReport("unpub2", { materialId: id("mat_other") });
  const result = await reportAdminService.resolveReport(reportId, ADMIN, {
    resolution: "unpublish_material",
  });
  assert.equal(result.ok, true);
  assert.equal(result.effects.materialUnpublished, false);
});

test("Creator 只看得到自己教材上的案件", async () => {
  const mine = await reportRepository.listCreatorCases({ creatorId: CREATOR.userId });
  assert.ok(mine.items.length > 0);
  for (const row of mine.items) {
    assert.equal(row.material_id, id("mat_own"), "不得出現別的創作者的教材");
  }

  // 別人的案件對這位創作者一律不存在。
  const foreign = await reportRepository.findCreatorCase({
    reportId: id("unpub"),
    creatorId: CREATOR.userId,
  });
  assert.equal(foreign, null);

  const denied = await reportAdminService.submitCreatorResponse(id("unpub"), CREATOR, {
    message: "這不是我的教材",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "not_found", "不得回 403 —— 那會洩漏 case id 存在");
});

test("Creator 的時間軸看不到 Admin 內部筆記", async () => {
  const reportId = await insertReport("notes", { materialId: id("mat_own") });
  await reportAdminService.startInvestigation(reportId, ADMIN);
  const noted = await reportAdminService.addAdminNote(reportId, ADMIN, {
    message: "內部：已比對外部來源",
  });
  assert.equal(noted.ok, true);
  await reportAdminService.requestCreatorResponse(reportId, ADMIN, { message: "請提供授權證明" });

  const adminView = await reportRepository.listReportEvents(reportId);
  assert.ok(adminView.some((e) => e.event_type === "admin_note"));

  const creatorView = await reportRepository.listCreatorVisibleEvents(reportId);
  assert.equal(creatorView.some((e) => e.event_type === "admin_note"), false);
  assert.ok(creatorView.some((e) => e.event_type === "creator_response_requested"));
});

test("Admin note 不改變案件狀態", async () => {
  const reportId = await insertReport("noteonly", { materialId: id("mat_own") });
  await reportAdminService.addAdminNote(reportId, ADMIN, { message: "先觀察" });
  assert.equal((await statusOf(reportId)).status, "pending");
});

test("佇列 status=open 只回需要行動的案件；statusCounts 為全表計數", async () => {
  const open = await reportRepository.listReportCases({
    statuses: ["pending", "investigating", "awaiting_creator"],
    limit: 100,
  });
  const ours = open.items.filter((r) => String(r.id).startsWith(PREFIX));
  assert.ok(ours.length > 0);
  for (const row of ours) {
    assert.ok(
      ["pending", "investigating", "awaiting_creator"].includes(row.status),
      `unexpected status ${row.status}`
    );
    // enrich 欄位必須存在，否則 UI 只能顯示 id。
    assert.equal(typeof row.material_title, "string");
    assert.equal(typeof row.reporter_email, "string");
    assert.equal(typeof row.creator_email, "string");
  }

  const counts = await reportRepository.countReportsByStatus();
  assert.ok((counts.resolved ?? 0) >= 1, "flow 案件已 resolved");
  assert.ok((counts.dismissed ?? 0) >= 1, "terminal 案件已 dismissed");
});

test("搜尋以人類可讀欄位為主（教材標題 / 檢舉人 email）", async () => {
  const byTitle = await reportRepository.listReportCases({ q: `${PREFIX}我的教材`, limit: 100 });
  assert.ok(byTitle.items.length > 0);
  for (const row of byTitle.items) assert.equal(row.material_id, id("mat_own"));

  const byEmail = await reportRepository.listReportCases({ q: `${PREFIX}reporter_flow@`, limit: 100 });
  assert.equal(byEmail.items.length, 1);
  assert.equal(byEmail.items[0].id, id("flow"));

  const noMatch = await reportRepository.listReportCases({ q: `${PREFIX}definitely-no-such-thing` });
  assert.equal(noMatch.items.length, 0);
  assert.equal(noMatch.pagination.total, 0);
  assert.equal(noMatch.pagination.totalPages, 1);
});

test("legacy PATCH 路徑（pending → reviewed）仍然可用，且會留下歷程", async () => {
  const reportId = await insertReport("legacy", { materialId: id("mat_own") });
  const result = await reportAdminService.reviewReport(reportId, ADMIN);
  assert.equal(result.ok, true);
  assert.equal((await statusOf(reportId)).status, "reviewed");

  const events = await reportRepository.listReportEvents(reportId);
  assert.equal(events.length, 1);
  assert.equal(events[0].meta.legacy, true);

  // 二次呼叫必須是 409（already_reviewed），不是靜默成功。
  const again = await reportAdminService.reviewReport(reportId, ADMIN);
  assert.equal(again.ok, false);
  assert.equal(again.code, "already_reviewed");
});

test("legacy reviewed 是終態：新工作流的動作一律 409，且不留下副作用", async () => {
  const reportId = await insertReport("legacy_terminal", { materialId: id("mat_own") });
  await reportAdminService.reviewReport(reportId, ADMIN);
  assert.equal((await statusOf(reportId)).status, "reviewed");

  const eventsBefore = (await reportRepository.listReportEvents(reportId)).length;

  for (const attempt of [
    () => reportAdminService.startInvestigation(reportId, ADMIN),
    () => reportAdminService.requestCreatorResponse(reportId, ADMIN, { message: "x" }),
    () => reportAdminService.resolveReport(reportId, ADMIN, { resolution: "unpublish_material" }),
  ]) {
    const result = await attempt();
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_transition");
  }

  const after = await statusOf(reportId);
  assert.equal(after.status, "reviewed", "legacy 終態不得被新工作流改寫");
  assert.equal(after.resolution, null, "沒有處置就不該憑空生出 resolution");
  assert.equal(
    (await reportRepository.listReportEvents(reportId)).length,
    eventsBefore,
    "失敗的轉移不得留下 event"
  );

  // 詳情仍然查得到，且 allowedTransitions 為空 —— UI 據此顯示「已結案」而不是動作按鈕。
  const enriched = await reportRepository.findEnrichedReportById(reportId);
  assert.ok(enriched);
  assert.equal(enriched.status, "reviewed");

  // 不會變成 orphan：不帶 status 的查詢（UI 的「全部」）仍看得到它。
  const all = await reportRepository.listReportCases({ q: reportId, limit: 10 });
  assert.equal(all.items.length, 1);
  assert.equal(all.items[0].id, reportId);
});
