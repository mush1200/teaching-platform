/**
 * Report case state machine 的純函式單元測試（無資料庫）。
 *
 *   node --test tests/reportWorkflow.test.js
 *   npm run test:unit --prefix Backend
 *
 * 這裡鎖住的是 workflow 的**形狀**，不是任何一次資料寫入：
 *   1. 終態不可再轉移 —— 已結案的檢舉不能被別人改判
 *   2. legacy `reviewed` 仍在 allowlist 且仍是終態
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

test("open 狀態就是「需要 Admin 行動」的那三個", () => {
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

test("legacy reviewed 只能從 pending 進入", () => {
  assert.equal(workflow.canTransition("pending", "reviewed"), true);
  assert.equal(workflow.canTransition("investigating", "reviewed"), false);
  assert.equal(workflow.canTransition("awaiting_creator", "reviewed"), false);
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
