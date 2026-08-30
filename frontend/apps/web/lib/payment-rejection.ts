import { PAYMENT_REJECTION_REASON_LABEL } from "./admin-labels";

/**
 * 把付款退件資訊組成**給買家看**的一句話。
 *
 * Admin 的退件表單上寫著「退回原因（必選，**購買者會看到**）」，
 * 而 Backend 也一直有回傳 `payment_proof_rejected_reason` —— 但買家端從來沒有渲染它。
 * 買家只看到「付款憑證未通過，請重新上傳」，不知道錯在哪，最可能的行為就是
 * 把同一張憑證再傳一次，然後再被退一次。
 *
 * 三個買家可見的位置（訂單列表、訂單詳情、重新上傳頁）共用這一個 formatter，
 * 避免同一件事又出現三種說法。
 */
export function describePaymentRejection(reasonCode: unknown, note: unknown): string | null {
  const code = typeof reasonCode === "string" ? reasonCode.trim() : "";
  const trimmedNote = typeof note === "string" ? note.trim() : "";

  const labels: Record<string, string> = PAYMENT_REJECTION_REASON_LABEL;
  const reasonLabel = code && Object.prototype.hasOwnProperty.call(labels, code) ? labels[code] : "";

  /*
   * 未登記的代碼**不顯示原始代碼**：`amount_mismatch` 這種字串對買家沒有意義，
   * 而且是把系統內部值丟到使用者面前（與訂單狀態顯示 `pending_payment` 同一類問題）。
   * 這時退回只有備註、或完全沒有補充資訊的情況。
   */
  if (reasonLabel && trimmedNote) return `${reasonLabel}：${trimmedNote}`;
  if (reasonLabel) return reasonLabel;
  if (trimmedNote) return trimmedNote;
  return null;
}
