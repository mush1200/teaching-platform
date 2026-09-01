/**
 * 法律文件發布時的 **standardized internal justification**
 * （`OPS-03` / `DEC-LEGAL-11`，2026-08-28 Owner Decision Round 3）。
 *
 * ## 這是什麼
 *
 * `SCHEMA-03` 已讓發布時**必須顯式決定** `requires_reconsent`，
 * 但稽核只答得出「誰、何時、設成什麼」，答不出**「依據什麼」**。
 * 本檔補的就是那一格：發布時必須同時留下一個標準化、可稽核的**營運理由**。
 *
 * ## 這**不是**什麼
 *
 * **不是法律判定。** 這裡的每一個代碼都是**營運分類**，用來描述
 * 「這次改版在做什麼」，**不是**在認定「這是否構成法律上的重大變更」。
 *
 * 因此本檔刻意**不出現**：
 *   - `material_change` / `non_material`（那是法律重大性分類）
 *   - `legally_required`（那是法律結論）
 *   - 「重大變更」字樣（`DEC-LEGAL-01` 的判準尚未取得）
 *
 * 「什麼變更依法必須要求重新同意」**仍為 `LAWYER VALIDATION REQUIRED`**
 * （`DEC-LEGAL-01`）。本檔不回答、也不得被當成已回答。
 *
 * ## reason 與 boolean 是**兩個獨立的顯式選擇**
 *
 * **絕對不得**建立 `reasonCode → requires_reconsent` 的推導。
 * 同一個 `policy_scope_change` 可能要求重新同意，也可能不要求 ——
 * 那是發布者依（尚未取得的）法律判準另行決定的事。
 * 本檔因此**只驗證理由本身**，完全不碰、也不回傳任何 boolean。
 *
 * ## 儲存位置
 *
 * **不新增 schema。** `legal_documents.requires_reconsent` 繼續是唯一的
 * authoritative boolean；理由與說明寫進 `activity_logs.meta` ——
 * 那裡本來就是「當下做了什麼決定」的 append-only 事實來源。
 *
 * 命名與結構對齊 repo 既有慣例（`utils/accountFreezePolicy.js`、
 * `utils/materialWorkflow.js` 的 `validateRequestChanges`）。
 */

/** 合法的發布理由代碼。新增需要產品決策，不是自由文字。 */
const PUBLISH_REASONS = Object.freeze([
  "editorial_update",
  "policy_scope_change",
  "user_rights_change",
  "platform_process_change",
  "compliance_review",
  "administrative_correction",
  "other",
]);

/**
 * 對 Admin 顯示的中文標籤。
 *
 * 全部描述**這次改版做了什麼**，而不是它的法律效果。
 * 例如 `user_rights_change` 是「條文調整了使用者的權利或義務範圍」，
 * **不是**「因此依法必須重新同意」—— 後者不是平台能自行認定的。
 */
const PUBLISH_REASON_LABEL = Object.freeze({
  editorial_update: "文字修訂（錯字、標點、排版、非實質整理）",
  policy_scope_change: "政策適用範圍調整",
  user_rights_change: "使用者權利或義務範圍調整",
  platform_process_change: "平台流程或作業方式調整",
  compliance_review: "依外部審閱意見修訂",
  administrative_correction: "行政更正（如生效日、文件識別）",
  other: "其他（須填寫說明）",
});

/** 說明欄位長度上限；`other` 時為必填。 */
const PUBLISH_NOTE_MAX_LENGTH = 500;

function isPublishReason(value) {
  return PUBLISH_REASONS.includes(String(value));
}

/** 字數以 code point 計 —— 與 repo 既有 `noteLength` 同一判準。 */
function noteLength(note) {
  return [...String(note ?? "").trim()].length;
}

/**
 * 發布理由的輸入驗證。
 *
 * 合法回傳 `{ valid: true, reasonCode, note, reasonText }`，
 * 否則 `{ valid: false, code, message }`。
 *
 * ## 規則
 *
 *   - `reasonCode` **必填**且必須來自 allowlist —— 不接受任意未知代碼。
 *   - `other` **必須**附說明，否則它會變成新的自由文字逃生口，等於沒有 taxonomy。
 *   - 非 `other` 的 `note` 為**選填**（補充脈絡用）。
 *
 * **本函式不接收、也不回傳 `requiresReconsent`** —— 兩者刻意分離，
 * 讓「理由自動決定布林值」在型別上就不可能發生。
 */
function validatePublishJustification({ reasonCode, note } = {}) {
  const code = reasonCode == null ? "" : String(reasonCode).trim();
  if (!code) {
    return {
      valid: false,
      code: "justification_required",
      message: "reasonCode is required when publishing a legal document",
    };
  }
  if (!isPublishReason(code)) {
    return {
      valid: false,
      code: "invalid_justification_code",
      message: `reasonCode must be one of ${PUBLISH_REASONS.join("|")}`,
    };
  }

  const text = note == null ? "" : String(note).trim();
  if (code === "other" && !text) {
    return {
      valid: false,
      code: "justification_note_required",
      message: "note is required when reasonCode is 'other'",
    };
  }
  if (noteLength(text) > PUBLISH_NOTE_MAX_LENGTH) {
    return {
      valid: false,
      code: "justification_note_too_long",
      message: `note must be at most ${PUBLISH_NOTE_MAX_LENGTH} characters`,
    };
  }

  const label = PUBLISH_REASON_LABEL[code];
  return {
    valid: true,
    reasonCode: code,
    note: text || null,
    reasonText: text ? `${label}：${text}` : label,
  };
}

module.exports = {
  PUBLISH_REASONS,
  PUBLISH_REASON_LABEL,
  PUBLISH_NOTE_MAX_LENGTH,
  isPublishReason,
  validatePublishJustification,
};
