/**
 * 檢舉案件（moderation case）的 **canonical state machine**。
 *
 * 只有這一份定義；routes / services / 前端 filter 都從這裡讀，
 * 不得各自維護一組狀態字串（那正是 orders 曾經長出 dead filter `paid` 的成因）。
 *
 * ## 狀態
 *
 *   pending           待處理 —— 買家送出檢舉後的初始狀態
 *   investigating     調查中 —— Admin 已接手
 *   awaiting_creator  等待創作者回覆 —— Admin 已要求創作者補充說明
 *   resolved          已處理 —— 檢舉成立並已執行處置
 *   dismissed         已駁回 —— 檢舉不成立
 *   reviewed          【legacy】舊版「標記已讀」的終態
 *
 * `reviewed` **保留但不再產生新的語意分支**：
 * 舊 API `PATCH /admin/reports/:id { status: "reviewed" }` 仍然可用（既有 caller / Postman
 * collection 依賴它），既有列也**不回填**成 `resolved` —— 那是當下事實的紀錄，
 * 回填會讓「當時只是標記已讀」與「當時做了處置」變得無法區分。
 * 新 UI 一律走 resolve / dismiss。
 *
 * ## 允許的轉移
 *
 *   pending          → investigating | awaiting_creator | resolved | dismissed | reviewed(legacy)
 *   investigating    → awaiting_creator | resolved | dismissed
 *   awaiting_creator → investigating（創作者已回覆）| resolved | dismissed
 *   resolved / dismissed / reviewed → （終態，不可再轉移）
 */

const REPORT_STATUSES = Object.freeze([
  "pending",
  "investigating",
  "awaiting_creator",
  "resolved",
  "dismissed",
  "reviewed",
]);

/** 需要 Admin 採取行動的狀態；Review Queue 的預設檢視。 */
const OPEN_REPORT_STATUSES = Object.freeze(["pending", "investigating", "awaiting_creator"]);

const TERMINAL_REPORT_STATUSES = Object.freeze(["resolved", "dismissed", "reviewed"]);

/**
 * 最終處置。**只列出這個平台真的做得到的動作** ——
 * 「使用者停權」不在其中：`users` 沒有 status／suspension 欄位，
 * 放進 allowlist 只會做出一個什麼都不會發生的按鈕。
 *
 *   dismissed          檢舉不成立（無處置）        → status = dismissed
 *   warning            對創作者發出警告（僅紀錄）   → status = resolved
 *   request_changes    要求創作者修改教材（僅紀錄） → status = resolved
 *   unpublish_material 下架教材（實際寫入 materials.status = 'unpublished'）→ status = resolved
 */
const REPORT_RESOLUTIONS = Object.freeze([
  "dismissed",
  "warning",
  "request_changes",
  "unpublish_material",
]);

/** 會實際改動教材狀態的處置；其餘僅留紀錄。 */
const MATERIAL_MUTATING_RESOLUTIONS = Object.freeze(["unpublish_material"]);

const REPORT_EVENT_TYPES = Object.freeze([
  "status_changed",
  "admin_note",
  "creator_response_requested",
  "creator_response",
  "resolution",
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["investigating", "awaiting_creator", "resolved", "dismissed", "reviewed"]),
  investigating: Object.freeze(["awaiting_creator", "resolved", "dismissed"]),
  awaiting_creator: Object.freeze(["investigating", "resolved", "dismissed"]),
  resolved: Object.freeze([]),
  dismissed: Object.freeze([]),
  reviewed: Object.freeze([]),
});

function isReportStatus(value) {
  return REPORT_STATUSES.includes(String(value));
}

function isTerminal(status) {
  return TERMINAL_REPORT_STATUSES.includes(String(status));
}

function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[String(from)];
  return Array.isArray(allowed) && allowed.includes(String(to));
}

function isResolution(value) {
  return REPORT_RESOLUTIONS.includes(String(value));
}

/** 處置 → 案件終態。`dismissed` 是唯一走「已駁回」的處置。 */
function statusForResolution(resolution) {
  return String(resolution) === "dismissed" ? "dismissed" : "resolved";
}

function mutatesMaterial(resolution) {
  return MATERIAL_MUTATING_RESOLUTIONS.includes(String(resolution));
}

module.exports = {
  REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
  TERMINAL_REPORT_STATUSES,
  REPORT_RESOLUTIONS,
  REPORT_EVENT_TYPES,
  ALLOWED_TRANSITIONS,
  isReportStatus,
  isTerminal,
  canTransition,
  isResolution,
  statusForResolution,
  mutatesMaterial,
};
