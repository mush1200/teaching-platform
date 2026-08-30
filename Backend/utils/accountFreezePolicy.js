/**
 * 帳號凍結的 **standardized operational reason taxonomy**
 * （`OPS-02` / `DEC-LEGAL-10`，2026-08-27 Owner Decision Round 2）。
 *
 * ## 為什麼要有這個
 *
 * `freeze_reason` 原本是**自由文字**：每個 Admin 各寫各的，跨案件無法比較，
 * 稽核時只能逐筆讀。標準化之後，「這批凍結是為了什麼」變成可統計、可覆核的事實。
 *
 * ## 這裡**刻意不做**法律認定
 *
 * 全部都是**營運分類**，不是法律結論。因此措辭一律避開
 * 「違法」「犯罪」「詐欺成立」這類需要外部認定的字眼 ——
 * `suspected_fraud` 是「疑似」，不是「已認定詐欺」。
 * 平台凍結帳號是營運處置，不是法律判決，文案與稽核都不得寫成後者。
 *
 * 同理，本檔**不定義**任何法定申訴期限或回覆日數 ——
 * 那是 Terms §2.5 的 Owner ＋ Lawyer 未決事項，維持 blocked。
 *
 * ## 與既有自由文字資料的關係
 *
 * `users.freeze_reason` **維持人類可讀文字**，不改型別、不做 migration。
 * 結構化的 `reasonCode` / `note` 寫進 `activity_logs.meta`，
 * 那裡本來就是「當下做了什麼決定」的 append-only 事實來源。
 *
 * **歷史資料不回填、不假裝有 taxonomy** —— 本檔上線前的凍結紀錄沒有
 * `reasonCode`，讀取端一律呈現為 `null`，而不是硬塞一個 `other`。
 *
 * 命名與結構刻意對齊 repo 既有慣例（`utils/materialWorkflow.js` 的
 * `validateRequestChanges`、`utils/paymentProofReview.js` 的 `REJECTION_REASONS`）。
 */

/** 合法的凍結原因代碼。新增需要產品決策，不是自由文字。 */
const FREEZE_REASONS = Object.freeze([
  "suspected_fraud",
  "payment_abuse",
  "account_security",
  "content_policy",
  "repeated_misuse",
  "manual_review",
  "other",
]);

/** 對 Admin 顯示的中文標籤。**不得**改寫成法律結論式措辭。 */
const FREEZE_REASON_LABEL = Object.freeze({
  suspected_fraud: "疑似詐欺行為，待查證",
  payment_abuse: "付款或退款流程遭濫用",
  account_security: "帳號安全疑慮（疑似遭冒用或外洩）",
  content_policy: "上架內容違反平台政策",
  repeated_misuse: "重複違反平台使用規範",
  manual_review: "人工審查中，暫停交易行為",
  other: "其他（須填寫說明）",
});

/** 說明欄位長度上限；`other` 時為必填。 */
const FREEZE_NOTE_MAX_LENGTH = 500;

function isFreezeReason(value) {
  return FREEZE_REASONS.includes(String(value));
}

/** 字數以 code point 計 —— 與 `materialWorkflow.noteLength` 同一判準。 */
function noteLength(note) {
  return [...String(note ?? "").trim()].length;
}

/**
 * 凍結請求的輸入驗證。
 *
 * 合法回傳 `{ valid: true, reasonCode, note, reasonText }`，
 * 否則 `{ valid: false, code, message }`。
 *
 * ## 規則
 *
 *   - `reasonCode` **必填**且必須來自 allowlist —— 不接受任意未知代碼。
 *   - `other` **必須**附說明；否則 `other` 會變成新的自由文字逃生口，
 *     等於沒有 taxonomy。
 *   - 非 `other` 的 `note` 為**選填**（補充脈絡用）。
 *
 * `reasonText` 是給 `users.freeze_reason` 用的人類可讀合成字串，
 * 讓既有只讀該欄位的地方（與歷史資料）維持可讀。
 */
function validateFreezeRequest({ reasonCode, note } = {}) {
  const code = reasonCode == null ? "" : String(reasonCode).trim();
  if (!code) {
    return { valid: false, code: "reason_required", message: "reasonCode is required" };
  }
  if (!isFreezeReason(code)) {
    return {
      valid: false,
      code: "invalid_reason_code",
      message: `reasonCode must be one of ${FREEZE_REASONS.join("|")}`,
    };
  }

  const text = note == null ? "" : String(note).trim();
  if (code === "other" && !text) {
    return {
      valid: false,
      code: "note_required",
      message: "note is required when reasonCode is 'other'",
    };
  }
  if (noteLength(text) > FREEZE_NOTE_MAX_LENGTH) {
    return {
      valid: false,
      code: "note_too_long",
      message: `note must be at most ${FREEZE_NOTE_MAX_LENGTH} characters`,
    };
  }

  const label = FREEZE_REASON_LABEL[code];
  return {
    valid: true,
    reasonCode: code,
    note: text || null,
    reasonText: text ? `${label}：${text}` : label,
  };
}

module.exports = {
  FREEZE_REASONS,
  FREEZE_REASON_LABEL,
  FREEZE_NOTE_MAX_LENGTH,
  isFreezeReason,
  validateFreezeRequest,
};
