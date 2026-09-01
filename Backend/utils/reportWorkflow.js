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
 * ## `reviewed` 是 **legacy terminal**，不是合法的新轉移目標
 *
 * 它只代表「舊版有人按過『標記已處理』」—— 沒有 resolution、沒有處置說明、
 * 沒有案件歷程。因此：
 *
 *   - **不在** `ALLOWED_TRANSITIONS` 的任何一列裡：正式 workflow（含
 *     `GET /admin/report-cases/:id` 回傳的 `allowedTransitions`）永遠不會把它列為可選目標。
 *   - 仍留在 `REPORT_STATUSES` 與 `TERMINAL_REPORT_STATUSES`：既有資料要讀得到、
 *     要能被 `?status=` 查詢、要歸入「已結案」。
 *   - 既有列**不回填**成 `resolved` —— 那會製造不存在的歷史事實
 *     （回填後就無法區分「當時只是標記已讀」與「當時真的做了處置」）。
 *   - 唯一還能寫出新 `reviewed` 的路徑是 **deprecated 的**
 *     `PATCH /admin/reports/:id { status: "reviewed" }`，它**不經過**這張轉移表
 *     （見 `repositories/report.repository.js` 的 `markReportReviewed`，條件是 `WHERE status = 'pending'`）。
 *     正式 Admin UI 已經沒有任何入口會呼叫它。
 *
 * ## 允許的轉移（正式 workflow）
 *
 *   pending          → investigating | awaiting_creator | resolved | dismissed
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

/**
 * **未結案**（non-terminal）：案件的生命週期還沒結束。
 *
 * ⚠️ 這**不等於**「現在需要 Admin 處理」—— `awaiting_creator` 的球在創作者手上。
 * 兩個概念刻意分成兩組常數（見 `ADMIN_ACTIONABLE_REPORT_STATUSES`）：
 * 把它們混成同一組，正是 Dashboard 待辦數與檢舉頁「待處理中」對不起來的成因。
 */
const OPEN_REPORT_STATUSES = Object.freeze(["pending", "investigating", "awaiting_creator"]);

/**
 * **現在需要 Admin 執行下一步**的狀態。Dashboard 的待辦計數以此為準。
 *
 * 判斷標準是「球在誰手上」，不是「案件有沒有結束」：
 *
 *   pending           沒有人接手 → **Admin 要動**
 *   investigating     Admin 已接手、工作未完成 → **Admin 要動**
 *   awaiting_creator  平台已要求創作者說明，等對方回覆 → **球在創作者手上**
 *
 * `awaiting_creator` 不在這組的程式碼證據：
 *   1. `routes/creatorCases.js` 把它定義為 `CREATOR_ACTION_STATUSES`
 *      （創作者端 `?scope=action_required` 就是查這個狀態）；
 *   2. 創作者送出說明後由 `submitCreatorResponse` 轉回 `investigating`（球才回到 Admin）。
 *
 * Admin 仍可從 `awaiting_creator` 直接 resolve / dismiss（見 `ALLOWED_TRANSITIONS`），
 * 但那是「不等了」的逃生門，不是這個狀態預期的下一步 —— 它不該讓案件每天出現在待辦數字裡。
 *
 * 這與教材審核的同一條原則一致：`changes_requested`（球在創作者手上）
 * 同樣不計入 Admin 待辦（見 `utils/materialWorkflow.js`）。
 */
const ADMIN_ACTIONABLE_REPORT_STATUSES = Object.freeze(["pending", "investigating"]);

/** 球在創作者手上的未結案狀態。`OPEN = ADMIN_ACTIONABLE + 這一組`。 */
const CREATOR_ACTION_REPORT_STATUSES = Object.freeze(["awaiting_creator"]);

const TERMINAL_REPORT_STATUSES = Object.freeze(["resolved", "dismissed", "reviewed"]);

/**
 * **Legacy** 終態：只存在於歷史資料，正式 workflow 不會再產生。
 * UI 必須把它顯示成「舊版已處理」而不是「已處理」—— 它沒有處置紀錄，
 * 與 `resolved` 不是同一件事。
 */
const LEGACY_TERMINAL_STATUSES = Object.freeze(["reviewed"]);

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
  // `reviewed` 刻意**不在**這裡：它是 legacy terminal，不是正式 workflow 的目標狀態。
  pending: Object.freeze(["investigating", "awaiting_creator", "resolved", "dismissed"]),
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

/** 這個狀態是否只存在於歷史資料（legacy），不是正式 workflow 產生的。 */
function isLegacyStatus(status) {
  return LEGACY_TERMINAL_STATUSES.includes(String(status));
}

/** 案件是否還沒結束（non-terminal）。 */
function isOpen(status) {
  return OPEN_REPORT_STATUSES.includes(String(status));
}

/** 現在是否需要 Admin 執行下一步。**這才是 Dashboard 待辦的定義。** */
function isAdminActionable(status) {
  return ADMIN_ACTIONABLE_REPORT_STATUSES.includes(String(status));
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
  ADMIN_ACTIONABLE_REPORT_STATUSES,
  CREATOR_ACTION_REPORT_STATUSES,
  TERMINAL_REPORT_STATUSES,
  LEGACY_TERMINAL_STATUSES,
  REPORT_RESOLUTIONS,
  REPORT_EVENT_TYPES,
  ALLOWED_TRANSITIONS,
  isReportStatus,
  isTerminal,
  canTransition,
  isLegacyStatus,
  isOpen,
  isAdminActionable,
  isResolution,
  statusForResolution,
  mutatesMaterial,
};
