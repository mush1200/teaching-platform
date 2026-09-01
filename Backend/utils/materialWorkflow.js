/**
 * 教材上架審核的 **canonical state machine**。
 *
 * 只有這一份定義；routes / services / 前端 filter 都從這裡讀，不得各自維護一組
 * 狀態字串或轉移規則（那正是 `reports` 曾經長出 dead filter 的成因）。
 * 架構比照 `utils/reportWorkflow.js` 與 `utils/paymentProofReview.js`。
 *
 * ## 狀態
 *
 *   pending_review      待審核 —— 創作者送出（新建或重新送審）後的狀態
 *   published           已上架 —— Admin 核准，買家看得到
 *   changes_requested   需修改 —— Admin 退回，**球在創作者手上**
 *   unpublished         已下架 —— 曾經上架，之後被平台下架（目前唯一來源是檢舉處置）
 *
 * `changes_requested` 與 `unpublished` **刻意分開**：
 * 前者是「從未公開過，請修改後再送」，後者是「曾經公開、被平台下架」。
 * 兩者對創作者的意義、對買家資料的關聯（訂單／評價）、稽核來源都不同，
 * 共用一個狀態會讓「這份教材為什麼不在架上」永遠答不出來。
 *
 * 命名上刻意**不用 `rejected`**：平台沒有永久拒絕的商業行為，退回的目的是讓創作者
 * 修好後回來。`rejected` 會讓創作者直接放棄，與產品目標相反。
 *
 * ## 允許的轉移
 *
 *   pending_review     → published            Admin 核准上架
 *   pending_review     → changes_requested    Admin 退回修改（原因必填）
 *   changes_requested  → pending_review       Creator 修改後重新送審
 *   unpublished        → pending_review       Creator 修改後重新送審
 *   published          → unpublished          **只能**經由檢舉處置 workflow
 *
 * 明確禁止（不得繞過正式審核）：
 *   changes_requested → published
 *   unpublished       → published
 *   published         → changes_requested
 *
 * ## Review snapshot 與歷史
 *
 * `materials.review_reason_code / review_note / reviewed_by / reviewed_at` 是
 * **latest review decision snapshot**，每次新的審核決定都會覆寫。
 * **完整歷史的 canonical source 是 `activity_logs`**（`target_type = 'material'`）：
 * `material.created` / `material.published` / `material.changes_requested` /
 * `material.resubmitted` / `material.unpublished`。
 * Creator 看最近一次（snapshot），Admin 稽核看完整歷史（activity_logs）。
 */

/** 四個正式狀態。與 DB 的 `materials_status_check` 一致。 */
const MATERIAL_STATUSES = Object.freeze([
  "pending_review",
  "published",
  "changes_requested",
  "unpublished",
]);

/** 需要 Admin 採取行動的狀態 —— 只有這一個。Dashboard 的待辦計數以此為準。 */
const ADMIN_BACKLOG_STATUSES = Object.freeze(["pending_review"]);

/**
 * 球在創作者手上的狀態。
 *
 * **不得**計入 Admin 待辦：教材被退回之後，Admin 已經做完他那一步了。
 * 把它加進待辦會讓「今天還有多少事要做」這個數字永遠降不下來。
 */
const CREATOR_ACTION_STATUSES = Object.freeze(["changes_requested", "unpublished"]);

/** 創作者可以重新送審的來源狀態。 */
const RESUBMITTABLE_STATUSES = CREATOR_ACTION_STATUSES;

const ALLOWED_TRANSITIONS = Object.freeze({
  pending_review: Object.freeze(["published", "changes_requested"]),
  changes_requested: Object.freeze(["pending_review"]),
  unpublished: Object.freeze(["pending_review"]),
  published: Object.freeze(["unpublished"]),
});

/**
 * 每個轉移**只能**由誰觸發。授權的真正邊界仍在 route 的 middleware 與
 * owner 檢查，這裡是語意宣告：同一個轉移不該同時存在兩個入口。
 *
 * `published → unpublished` 標為 `report_workflow`：它只能經由
 * `POST /admin/report-cases/:id/resolve` 的 `unpublish_material` 處置發生。
 * 教材審核頁**不得**提供第二個下架入口 —— 那會產生一批沒有案件、沒有原因的下架事件。
 */
const TRANSITION_ACTOR = Object.freeze({
  "pending_review>published": "admin",
  "pending_review>changes_requested": "admin",
  "changes_requested>pending_review": "creator",
  "unpublished>pending_review": "creator",
  "published>unpublished": "report_workflow",
});

/**
 * 退回原因 allowlist。
 *
 * 每一項都對應教材上實際存在的欄位群，不是憑空分類：
 *   incomplete_info    teaching_objective / activity_steps / usage_duration /
 *                      short_description / contents
 *   media_quality      cover_image_url / material_images
 *   features_mismatch  material_features（值域見 constants/materialFeatures.js）
 *   file_problem       file_key —— **見下方警告**
 *   ip_concern         ip_declaration_accepted 與內容本身
 *   other              以上皆非
 */
const REVIEW_REASONS = Object.freeze([
  "incomplete_info",
  "media_quality",
  "features_mismatch",
  "file_problem",
  "ip_concern",
  "other",
]);

const REVIEW_REASON_LABEL = Object.freeze({
  incomplete_info: "教材資訊不完整或不清楚",
  media_quality: "封面或圖片不符合要求",
  features_mismatch: "教材特色標註與內容不符",
  file_problem: "教材檔案有問題或無法使用",
  ip_concern: "內容或版權疑慮",
  other: "其他",
});

/**
 * `file_problem` 的能力邊界。
 *
 * 自 Material File Upload & Secure Delivery milestone 起為 **true**：教材本體是真的檔案，
 * Admin 可以在審核時把候選檔下載下來實際打開。因此 UI 可以正當地說
 * 「已檢視教材檔案」，`file_problem` 也真的代表檔案內容有問題。
 *
 * 例外：milestone 之前建立的 legacy 教材沒有 `approved_file_id`
 * （`file_key` 只是字串）。那些教材的審閱面板會顯示「無檔案」而不是下載按鈕 ——
 * 判斷依據是 `pending_file_id` / `approved_file_id` 是否存在，不是這個旗標。
 */
const FILE_REVIEW_ENABLED = true;

/**
 * 創作者可以**更換教材本體檔案**的狀態。
 *
 * 刻意排除 `published` 與 `pending_review`：
 *   - `published` 換檔等於在買家背後偷換已售出的商品，且會繞過審核。
 *     已上架教材要換檔，必須先走檢舉下架或另建教材 —— 沒有捷徑。
 *   - `pending_review` 換檔會讓 Admin 正在審的東西在腳下改變。
 * 兩者都不是「還沒做」，是**刻意不做**。
 */
const FILE_REPLACEABLE_STATUSES = CREATOR_ACTION_STATUSES;

/** 退回說明的最小長度。「請修改」這種零資訊回覆對創作者沒有任何幫助。 */
const REVIEW_NOTE_MIN_LENGTH = 10;
const REVIEW_NOTE_MAX_LENGTH = 1000;

function isMaterialStatus(value) {
  return typeof value === "string" && MATERIAL_STATUSES.includes(value);
}

function isReviewReason(value) {
  return typeof value === "string" && REVIEW_REASONS.includes(value);
}

/** 這個轉移是否合法。未知狀態一律 false（不丟例外，caller 自行回 400/409）。 */
function canTransition(from, to) {
  if (!isMaterialStatus(from) || !isMaterialStatus(to)) return false;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/** 誰可以做這個轉移：`admin` / `creator` / `report_workflow` / `null`（不合法）。 */
function transitionActor(from, to) {
  return TRANSITION_ACTOR[`${from}>${to}`] ?? null;
}

/** 目前狀態下，Admin 可以做的轉移。UI 的按鈕可見性應以此為準，不要自行推論。 */
function adminTransitionsFrom(status) {
  return (ALLOWED_TRANSITIONS[status] || []).filter(
    (to) => transitionActor(status, to) === "admin"
  );
}

function canResubmit(status) {
  return RESUBMITTABLE_STATUSES.includes(status);
}

/** 這個狀態下，創作者可不可以更換教材本體檔案。UI 與 route 都以此為準。 */
function canReplaceFile(status) {
  return FILE_REPLACEABLE_STATUSES.includes(status);
}

/** 字數以 code point 計 —— 中文一個字就是一個字，不用 UTF-8 byte 長度。 */
function noteLength(note) {
  return [...String(note ?? "").trim()].length;
}

/**
 * 退回修改的輸入驗證。合法回傳 `{ valid: true, reasonCode, note }`，
 * 否則回傳 `{ valid: false, message }`（訊息可直接回給前端）。
 *
 * 原因與說明**都是必填**：結構化原因讓創作者知道要改哪一區，
 * 必填說明讓他知道具體是哪裡 —— 缺一不可（見 docs/material-review-workflow.md）。
 */
function validateRequestChanges({ reasonCode, note } = {}) {
  const code = reasonCode == null ? "" : String(reasonCode).trim();
  if (!code) {
    return { valid: false, message: "reasonCode is required" };
  }
  if (!isReviewReason(code)) {
    return { valid: false, message: `reasonCode must be one of ${REVIEW_REASONS.join("|")}` };
  }
  const text = note == null ? "" : String(note).trim();
  if (!text) {
    return { valid: false, message: "note is required" };
  }
  if (noteLength(text) < REVIEW_NOTE_MIN_LENGTH) {
    return {
      valid: false,
      message: `note must be at least ${REVIEW_NOTE_MIN_LENGTH} characters so the creator knows what to fix`,
    };
  }
  if (noteLength(text) > REVIEW_NOTE_MAX_LENGTH) {
    return { valid: false, message: `note must be at most ${REVIEW_NOTE_MAX_LENGTH} characters` };
  }
  return { valid: true, reasonCode: code, note: text };
}

module.exports = {
  MATERIAL_STATUSES,
  ADMIN_BACKLOG_STATUSES,
  CREATOR_ACTION_STATUSES,
  RESUBMITTABLE_STATUSES,
  ALLOWED_TRANSITIONS,
  TRANSITION_ACTOR,
  REVIEW_REASONS,
  REVIEW_REASON_LABEL,
  REVIEW_NOTE_MIN_LENGTH,
  REVIEW_NOTE_MAX_LENGTH,
  FILE_REVIEW_ENABLED,
  FILE_REPLACEABLE_STATUSES,
  isMaterialStatus,
  isReviewReason,
  canTransition,
  transitionActor,
  adminTransitionsFrom,
  canResubmit,
  canReplaceFile,
  noteLength,
  validateRequestChanges,
};
