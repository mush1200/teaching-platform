/**
 * 付款憑證審核的 canonical 常數（Epic §4）。
 *
 * 拒絕時 **必須**帶一個結構化的 reason code。自由文字 `note` 仍然存在，
 * 但只是選填的補充說明 —— 只有 code 能被統計、能在買家端對應到穩定的文案。
 *
 * 買家在 `GET /me/orders/:orderId` 會看到 `payment_proof_rejected_reason`
 * 與既有的 `payment_proof_rejected_note`，所以這裡的每一個值都必須是
 * **可以直接給買家看**的理由，不得放內部備註用的分類。
 */

const REJECTION_REASONS = Object.freeze([
  "amount_mismatch",    // 金額不符
  "unreadable",         // 無法辨識付款資訊
  "payment_not_found",  // 查無款項
  "invalid_proof",      // 憑證無效
  "other",              // 其他（此時 note 必填）
]);

/** `other` 沒有預設文案，必須靠 `note` 說明，否則買家收到的是一句空話。 */
const REASON_REQUIRING_NOTE = "other";

/**
 * 給買家看的中文說明。Backend 只在**通知信**需要它（信件內容由 Backend 組），
 * Web UI 有自己的一份對照（`lib/paymentProofReasons.ts`）—— 兩邊都由這組 code 驅動，
 * 所以文案可以各自本地化，語意不會分歧。
 */
const REJECTION_REASON_TEXT = Object.freeze({
  amount_mismatch: "匯款金額與訂單應付金額不符",
  unreadable: "憑證影像無法辨識付款資訊",
  payment_not_found: "尚未查到這筆款項入帳",
  invalid_proof: "上傳的檔案不是有效的付款憑證",
  other: "其他原因",
});

function isRejectionReason(value) {
  return REJECTION_REASONS.includes(String(value));
}

/**
 * @returns {{ ok: true, reason: string, note: string|null } | { ok: false, message: string }}
 */
function parseRejection(body = {}) {
  const rawReason = body.rejection_reason ?? body.rejectionReason ?? body.reason;
  const reason = rawReason == null ? "" : String(rawReason).trim();
  if (!reason) {
    return { ok: false, message: `rejection_reason is required (one of ${REJECTION_REASONS.join("|")})` };
  }
  if (!isRejectionReason(reason)) {
    return { ok: false, message: `rejection_reason must be one of ${REJECTION_REASONS.join("|")}` };
  }
  const note = body.note == null ? "" : String(body.note).trim();
  if (reason === REASON_REQUIRING_NOTE && !note) {
    return { ok: false, message: 'note is required when rejection_reason is "other"' };
  }
  return { ok: true, reason, note: note || null };
}

module.exports = {
  REJECTION_REASONS,
  REASON_REQUIRING_NOTE,
  REJECTION_REASON_TEXT,
  isRejectionReason,
  parseRejection,
};
