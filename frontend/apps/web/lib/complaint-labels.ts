/**
 * 消費申訴的前端標籤與狀態對照（單一來源）。
 *
 * ## 這裡不得出現任何前端自己發明的狀態
 *
 * `COMPLAINT_STATUSES` / `COMPLAINT_TRANSITIONS` / `COMPLAINT_TYPES` 必須與
 * Backend 的 `services/consumerComplaint.service.js` **逐字一致**。
 * 前端只負責把 canonical 值翻成中文，**不負責決定哪些轉移合法** ——
 * 真正的守門在 backend（非法轉移回 409 並附 `allowed`）。
 * 這裡的轉移表只用來決定按鈕要不要顯示，是 UX hint 不是授權邊界。
 *
 * 對照 `lib/admin-labels.ts` 的既有慣例。
 */

export const COMPLAINT_STATUSES = [
  "submitted",
  "under_review",
  "responded",
  "resolved",
  "closed",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: "已提交",
  under_review: "處理中",
  responded: "已回覆",
  resolved: "已處理完成",
  closed: "已結案",
};

export const COMPLAINT_STATUS_TONE: Record<
  ComplaintStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  submitted: "warning",
  under_review: "info",
  responded: "info",
  resolved: "success",
  closed: "neutral",
};

/** 買家視角的下一步說明 —— 讓「已提交」不會看起來像沒人理。 */
export const COMPLAINT_STATUS_BUYER_HINT: Record<ComplaintStatus, string> = {
  submitted: "平台已收到您的申訴，將盡快指派人員處理。",
  under_review: "平台正在調查中，有結果會回覆您。",
  responded: "平台已回覆，請查看下方處理歷程。若仍有疑問可繼續補充證據。",
  resolved: "平台已完成處理，處理結果如下方所示。",
  closed: "本案已結案。若有新的爭議，請另行提出申訴。",
};

export const COMPLAINT_TYPES = [
  "payment",
  "delivery",
  "download",
  "material_mismatch",
  "duplicate_payment",
  "refund_request",
  "account_security",
  "other",
] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

export const COMPLAINT_TYPE_LABEL: Record<ComplaintType, string> = {
  payment: "付款問題",
  delivery: "沒有收到教材",
  download: "無法下載",
  material_mismatch: "教材與說明不符",
  duplicate_payment: "重複付款",
  refund_request: "要求退款",
  account_security: "帳號安全（冒用、未授權交易）",
  other: "其他",
};

/**
 * 合法轉移（**與 backend `TRANSITIONS` 逐字一致**）。
 *
 * 只用來決定 Admin 要顯示哪些按鈕。backend 仍會獨立驗證並在非法時回 409。
 */
export const COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  submitted: ["under_review", "closed"],
  under_review: ["responded", "resolved", "closed"],
  responded: ["under_review", "resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

/** `resolved` / `closed` 需要處理結果摘要（backend 會擋 `resolution_summary_required`）。 */
export const COMPLAINT_STATUS_REQUIRES_RESOLUTION: ComplaintStatus[] = ["resolved", "closed"];

/** 終態 —— 不再有任何轉移，UI 應停止顯示處理表單。 */
export const COMPLAINT_TERMINAL_STATUSES: ComplaintStatus[] = ["closed"];

/** 案件歷程的事件型別（backend `consumer_complaint_events.event_type`）。 */
export const COMPLAINT_EVENT_LABEL: Record<string, string> = {
  submitted: "買家提出申訴",
  status_changed: "狀態變更",
  internal_note: "內部註記（不對買家顯示）",
  response_to_buyer: "回覆買家",
  buyer_message: "買家補充",
  evidence_added: "新增證據",
  resolution: "處理結果",
};

export function complaintStatusLabel(status?: string | null): string {
  if (!status) return "—";
  return COMPLAINT_STATUS_LABEL[status as ComplaintStatus] ?? status;
}

export function complaintTypeLabel(type?: string | null): string {
  if (!type) return "—";
  return COMPLAINT_TYPE_LABEL[type as ComplaintType] ?? type;
}
