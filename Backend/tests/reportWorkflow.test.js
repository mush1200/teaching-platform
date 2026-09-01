/**
 * Report case state machine 的純函式單元測試（無資料庫）。
 *
 *   node --test tests/reportWorkflow.test.js
 *   npm run test:unit --prefix Backend
 *
 * 這裡鎖住的是 workflow 的**形狀**，不是任何一次資料寫入：
 *   1. 終態不可再轉移 —— 已結案的檢舉不能被別人改判
 *   2. legacy `reviewed` 仍在 allowlist、仍是終態，但**不是**任何合法轉移的目標
 *   3. 處置 allowlist 只含平台真的做得到的動作（沒有「使用者停權」）
 *   4. `dismissed` 是唯一走「已駁回」的處置
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const workflow = require("../utils/reportWorkflow");

test("狀態 allowlist 保留 legacy reviewed，且與 ALLOWED_TRANSITIONS 的 key 完全一致", () => {
  assert.ok(workflow.REPORT_STATUSES.includes("reviewed"));
  assert.deepEqual(
    [...workflow.REPORT_STATUSES].sort(),
    Object.keys(workflow.ALLOWED_TRANSITIONS).sort()
  );
});

/*
 * 狀態分組的不變條件（2026-08-23）。
 *
 * 「未結案」與「現在需要 Admin 處理」是**兩個不同的概念**：
 * `awaiting_creator` 未結案，但球在創作者手上。Dashboard 的待辦數字用後者，
 * 檢舉頁的「未結案」用前者 —— 兩邊各自手寫一組 status array 正是它們對不起來的成因。
 */
test("status groups：open / adminActionable / terminal / legacy 的關係", () => {
  const open = [...workflow.OPEN_REPORT_STATUSES];
  const actionable = [...workflow.ADMIN_ACTIONABLE_REPORT_STATUSES];
  const creatorSide = [...workflow.CREATOR_ACTION_REPORT_STATUSES];
  const terminal = [...workflow.TERMINAL_REPORT_STATUSES];
  const legacy = [...workflow.LEGACY_TERMINAL_STATUSES];

  // open = adminActionable + creator 側
  assert.deepEqual([...open].sort(), [...actionable, ...creatorSide].sort());
  // adminActionable 是 open 的子集，且真的更小（awaiting_creator 被排除）
  assert.ok(actionable.every((s) => open.includes(s)));
  assert.ok(actionable.length < open.length);
  assert.deepEqual(actionable, ["pending", "investigating"]);
  assert.deepEqual(creatorSide, ["awaiting_creator"]);

  // terminal 與 open 不重疊，兩者聯集就是全部狀態
  assert.equal(terminal.some((s) => open.includes(s)), false);
  assert.deepEqual([...open, ...terminal].sort(), [...workflow.REPORT_STATUSES].sort());
  assert.deepEqual(terminal.sort(), ["dismissed", "resolved", "reviewed"]);

  // legacy 是 terminal 的子集
  assert.ok(legacy.every((s) => terminal.includes(s)));
});

test("legacy reviewed 永遠不會進 open / adminActionable / Dashboard 待辦", () => {
  assert.equal(workflow.OPEN_REPORT_STATUSES.includes("reviewed"), false);
  assert.equal(workflow.ADMIN_ACTIONABLE_REPORT_STATUSES.includes("reviewed"), false);
  assert.equal(workflow.isOpen("reviewed"), false);
  assert.equal(workflow.isAdminActionable("reviewed"), false);
  // 其餘終態同理
  for (const status of ["resolved", "dismissed"]) {
    assert.equal(workflow.isOpen(status), false, status);
    assert.equal(workflow.isAdminActionable(status), false, status);
  }
});

test("isAdminActionable：球在誰手上", () => {
  assert.equal(workflow.isAdminActionable("pending"), true);
  assert.equal(workflow.isAdminActionable("investigating"), true);
  // 等創作者回覆不是 Admin 的待辦
  assert.equal(workflow.isAdminActionable("awaiting_creator"), false);
  assert.equal(workflow.isOpen("awaiting_creator"), true);
  assert.equal(workflow.isAdminActionable("banana"), false);
});

test("open 狀態就是「案件尚未結束」的那三個", () => {
  assert.deepEqual([...workflow.OPEN_REPORT_STATUSES], [
    "pending",
    "investigating",
    "awaiting_creator",
  ]);
  // open 與 terminal 必須是 REPORT_STATUSES 的一個 partition：
  // 少一個狀態沒被分類，Admin 的佇列就會有案件永遠不出現。
  assert.deepEqual(
    [...workflow.OPEN_REPORT_STATUSES, ...workflow.TERMINAL_REPORT_STATUSES].sort(),
    [...workflow.REPORT_STATUSES].sort()
  );
});

test("終態不可再轉移", () => {
  for (const terminal of workflow.TERMINAL_REPORT_STATUSES) {
    assert.equal(workflow.isTerminal(terminal), true, terminal);
    assert.deepEqual([...workflow.ALLOWED_TRANSITIONS[terminal]], [], terminal);
    for (const to of workflow.REPORT_STATUSES) {
      assert.equal(workflow.canTransition(terminal, to), false, `${terminal} -> ${to}`);
    }
  }
});

test("調查流程的正向路徑", () => {
  assert.equal(workflow.canTransition("pending", "investigating"), true);
  assert.equal(workflow.canTransition("pending", "awaiting_creator"), true);
  assert.equal(workflow.canTransition("investigating", "awaiting_creator"), true);
  // 創作者回覆後，球回到 Admin 手上
  assert.equal(workflow.canTransition("awaiting_creator", "investigating"), true);
  for (const from of workflow.OPEN_REPORT_STATUSES) {
    assert.equal(workflow.canTransition(from, "resolved"), true, from);
    assert.equal(workflow.canTransition(from, "dismissed"), true, from);
  }
});

/*
 * legacy `reviewed` 退出正式 workflow（2026-08-23）。
 *
 * 它仍然是合法的**狀態值**（既有資料要讀得到、要能被 `?status=` 查詢、要歸入已結案），
 * 但**不是**任何轉移的目標 —— 正式 API 不得把它列為 allowedTransition。
 * 唯一還能寫出新 `reviewed` 的是 deprecated 的 `PATCH /admin/reports/:id`，
 * 那條路徑不經過這張轉移表（見 repositories/report.repository.js 的 markReportReviewed）。
 */
test("legacy reviewed 不是任何合法轉移的目標", () => {
  for (const from of workflow.REPORT_STATUSES) {
    assert.equal(workflow.canTransition(from, "reviewed"), false, `${from} → reviewed 不得合法`);
  }
  for (const targets of Object.values(workflow.ALLOWED_TRANSITIONS)) {
    assert.equal(targets.includes("reviewed"), false);
  }
});

test("legacy reviewed 仍是可讀的終態，只是被標記為 legacy", () => {
  assert.ok(workflow.REPORT_STATUSES.includes("reviewed"));
  assert.ok(workflow.TERMINAL_REPORT_STATUSES.includes("reviewed"));
  assert.deepEqual([...workflow.LEGACY_TERMINAL_STATUSES], ["reviewed"]);
  assert.equal(workflow.isLegacyStatus("reviewed"), true);
  assert.equal(workflow.isLegacyStatus("resolved"), false);
  // legacy 終態同樣不可再轉移
  assert.deepEqual([...workflow.ALLOWED_TRANSITIONS.reviewed], []);
});

test("未知狀態一律不可轉移", () => {
  assert.equal(workflow.isReportStatus("suspended"), false);
  assert.equal(workflow.canTransition("banana", "resolved"), false);
  assert.equal(workflow.canTransition("pending", "banana"), false);
});

test("處置 allowlist 不含 backend 做不到的動作", () => {
  assert.deepEqual([...workflow.REPORT_RESOLUTIONS], [
    "dismissed",
    "warning",
    "request_changes",
    "unpublish_material",
  ]);
  // users 表沒有 status / suspension 欄位；放進來只會做出無效的按鈕。
  assert.equal(workflow.isResolution("suspend_user"), false);
  assert.equal(workflow.isResolution("delete_material"), false);
});

test("dismissed 是唯一走「已駁回」的處置，其餘皆為 resolved", () => {
  assert.equal(workflow.statusForResolution("dismissed"), "dismissed");
  for (const resolution of workflow.REPORT_RESOLUTIONS.filter((r) => r !== "dismissed")) {
    assert.equal(workflow.statusForResolution(resolution), "resolved", resolution);
  }
});

test("只有 unpublish_material 會改動教材", () => {
  assert.equal(workflow.mutatesMaterial("unpublish_material"), true);
  for (const resolution of ["dismissed", "warning", "request_changes"]) {
    assert.equal(workflow.mutatesMaterial(resolution), false, resolution);
  }
});
