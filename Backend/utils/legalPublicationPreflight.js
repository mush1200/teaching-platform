/**
 * `OPS-05` —— 法律文件發布前的**技術**前置檢查（純函式，無 I/O）。
 *
 * ## 這個模組回答什麼、不回答什麼
 *
 * 它只回答一句話：**「這份發布請求在技術上組得起來嗎？」**
 *
 * 它**不**回答、也不可能回答：
 *
 *   * 條文內容在法律上是否正確
 *   * 律師是否真的核准了
 *   * 會計師是否真的核准了
 *   * 這次改版依法是否構成「重大變更」（`DEC-LEGAL-01`，律師側未決）
 *
 * 因此輸出刻意分成**兩條互不合併的判定線**：
 *
 * ```text
 * technical        —— 這裡能判斷，PASS / FAIL
 * externalApproval —— 這裡不能判斷，只能記錄 operator 提供了什麼證據
 * ```
 *
 * 兩者都成立才算 `readyToPublish`。**任何情況下都不得把 technical PASS
 * 單獨呈現成「可以發布了」** —— 那正是這張票要防止的誤解。
 *
 * ## 為什麼 taxonomy 不在這裡重寫
 *
 * 文件型別取自 `services/legalDocument.service.js`，
 * 發布理由與 note 規則取自 `utils/legalDocumentPublishPolicy.js`。
 * 這裡**不重新宣告**任何一組 —— 前置檢查與真正的寫入路徑必須用同一份定義，
 * 否則會出現「preflight 說可以、API 說不行」這種比沒有檢查更糟的狀態。
 */

const { DOCUMENT_TYPES } = require("./legalDocumentTypes");
const { validatePublishJustification } = require("./legalDocumentPublishPolicy");

/**
 * 草稿檔頭的封鎖標記。
 *
 * `docs/legal-drafts/*.draft.md` 四份都帶著這兩行。只要來源檔案裡還有它們，
 * 就代表這份文字**尚未經律師核可**，preflight 一律判定為 blocked ——
 * 不管 operator 在旗標上填了什麼。
 *
 * 這是刻意的最後一道防線：它讓「不小心把草稿發出去」在技術上先撞牆一次。
 */
const DRAFT_BLOCK_MARKERS = Object.freeze([
  "DRAFT — NOT LAWYER APPROVED",
  "NOT FOR PRODUCTION PUBLICATION",
]);

/** `effective_date` 的對外契約是 `YYYY-MM-DD`（見 legalDocuments.db.test.js 的時區測試）。 */
const EFFECTIVE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (!EFFECTIVE_DATE_PATTERN.test(String(value))) return false;
  const [y, m, d] = String(value).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/**
 * `requiresReconsent` 必須是 operator **顯式**提供的 boolean。
 *
 * 與 `validateRequiresReconsent()` 同一條規則：沒有 default、不接受字串、
 * 也**不得**由 `reasonCode` 推導（`OPS-03` / `DEC-LEGAL-11`）。
 */
function checkRequiresReconsent(value) {
  if (value === true || value === false) return { ok: true, value };
  return {
    ok: false,
    code: "requires_reconsent_required",
    message:
      "requiresReconsent must be an explicit boolean (true or false); it is never derived from the reason code",
  };
}

/**
 * 技術面前置檢查。
 *
 * @returns {{ok: boolean, failures: Array<{code: string, message: string}>}}
 */
function checkTechnical({
  documentType,
  version,
  body,
  effectiveDate,
  requiresReconsent,
  reasonCode,
  note,
} = {}) {
  const failures = [];
  const add = (code, message) => failures.push({ code, message });

  if (!DOCUMENT_TYPES.includes(String(documentType))) {
    add(
      "invalid_document_type",
      `documentType must be one of: ${DOCUMENT_TYPES.join(", ")}`
    );
  }

  if (!version || !String(version).trim()) {
    add("version_required", "version is required and must not be blank");
  }

  // 空正文永遠發布不出去（service 與 DB CHECK 都會擋；這裡先擋以給出可讀的錯誤）。
  if (body === null || body === undefined || String(body).trim() === "") {
    add("body_required", "the source document body is empty");
  }

  if (!isRealDate(effectiveDate)) {
    add(
      "effective_date_invalid",
      "effectiveDate must be a real calendar date in YYYY-MM-DD form"
    );
  }

  const reconsent = checkRequiresReconsent(requiresReconsent);
  if (!reconsent.ok) add(reconsent.code, reconsent.message);

  // 理由與 boolean 分開驗證、互不傳參 —— 與 service.publish() 同一結構。
  const justification = validatePublishJustification({ reasonCode, note });
  if (!justification.valid) add(justification.code, justification.message);

  return { ok: failures.length === 0, failures };
}

/**
 * 外部審閱面：**只記錄 operator 提供了什麼，不判斷真偽。**
 *
 * 程式沒有辦法知道律師是不是真的核准了。它能做的只有兩件事：
 *   1. 要求 operator 明確填入可稽核的核准參照，並明確按下確認；
 *   2. 在來源檔案仍帶著草稿封鎖標記時，直接擋下來。
 *
 * 這裡**刻意不**把任何東西自動化成 boolean truth。
 */
function checkExternalApproval({
  body,
  lawyerApprovalRef,
  accountantApprovalRef,
  accountantReviewRequired = false,
  acknowledgeExternalReview = false,
} = {}) {
  const blockers = [];
  const add = (code, message) => blockers.push({ code, message });

  const text = body === null || body === undefined ? "" : String(body);
  const found = DRAFT_BLOCK_MARKERS.filter((m) => text.includes(m));
  if (found.length > 0) {
    add(
      "source_is_an_unapproved_draft",
      `the source still carries draft markers (${found.join("; ")}) — it has not been lawyer approved`
    );
  }

  if (!lawyerApprovalRef || !String(lawyerApprovalRef).trim()) {
    add(
      "lawyer_approval_reference_required",
      "a lawyer approval reference is required; this tool records it, it cannot verify it"
    );
  }

  if (accountantReviewRequired && (!accountantApprovalRef || !String(accountantApprovalRef).trim())) {
    add(
      "accountant_approval_reference_required",
      "this document type was flagged as requiring accountant review; supply the reference"
    );
  }

  if (acknowledgeExternalReview !== true) {
    add(
      "external_review_not_acknowledged",
      "the operator must explicitly acknowledge that the referenced external approvals are genuine"
    );
  }

  return { ok: blockers.length === 0, blockers };
}

/**
 * 完整前置檢查。
 *
 * **這個函式永遠不寫入任何東西。** 它沒有資料庫 handle，也沒有 HTTP client；
 * 呼叫它不可能發布任何法律文件。
 */
function preflight(request = {}) {
  const technical = checkTechnical(request);
  const externalApproval = checkExternalApproval(request);

  return {
    technical,
    externalApproval,
    /*
     * 兩條線都成立才是 true。
     *
     * 注意 `readyToPublish === true` 的意思仍然只是
     * 「技術前置齊備，且 operator 聲明外部核准存在」——
     * **它不是、也不可能是「這份文件在法律上可以發布」的判定。**
     */
    readyToPublish: technical.ok && externalApproval.ok,
  };
}

module.exports = {
  DRAFT_BLOCK_MARKERS,
  EFFECTIVE_DATE_PATTERN,
  checkTechnical,
  checkExternalApproval,
  preflight,
};
