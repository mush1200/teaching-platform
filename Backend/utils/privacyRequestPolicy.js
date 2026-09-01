/**
 * 個資權利請求（Privacy Rights Request）的 canonical policy。
 *
 * `OPS-04` / `DEC-LEGAL-13`（2026-08-28 Owner Decision Round 3）。
 *
 * ## 這是一個**獨立 domain**，不是消費申訴的一種
 *
 * Owner 明訂：**consumer complaint ≠ privacy rights request**。
 * 兩者法律基礎不同（消保法 §43 vs 個人資料保護法），
 * 因此**不得**塞進 `consumer_complaints.complaint_type`，
 * 也不得只加一個 `complaint_type = 'privacy_request'` 就宣稱完成。
 *
 * 可以重用的是**模式**（case lifecycle / event history / 稽核 / Admin UI primitives），
 * 不是 domain 本身。
 *
 * ## 為什麼**沒有** SLA / 法定期限
 *
 * 消費申訴有 `statutory_due_at`（消保法 §43 II 十五日），那是**有法源的數字**。
 * 個資請求的法定回覆期限**尚未取得律師結論**（Privacy §8.3 marker），
 * 因此本 domain **刻意沒有任何 deadline 欄位、沒有 overdue 判定、
 * 也不重用 `utils/complaintSla.js`**。
 *
 * 只記 `received_at` 與 `completed_at` —— 等律師給出期限後，
 * 那兩個時間點足以往回計算，而現在不會先對外承諾任何天數。
 *
 * ## 身分驗證：**刻意不建立法律標準**
 *
 * identity-verification 的法律標準同樣 blocked。因此本檔**不定義**
 * 「已依法完成身分驗證」這種狀態，也**不要求**任何政府證件。
 * 需要向請求者確認資訊時，用中性的 `waiting_for_information` 狀態
 * 與內部註記處理。
 *
 * ## `deletion` 請求 ≠ 執行刪除
 *
 * 本 domain 只記錄「使用者提出了刪除請求」。**不執行任何刪除、
 * 匿名化或帳號關閉** —— 帳號刪除語意仍卡在 `SCHEMA-02` / `O-22`
 * （`L-21` 保存期限未決，且 `users` 有 38 個 FK 分屬 CASCADE/SET NULL/RESTRICT）。
 * 案件 `completed` 的意思是「本平台已處理完這個請求」，
 * **不等於**「資料已全部刪除」。
 */

/**
 * 請求類型。
 *
 * **直接對應《隱私權政策》草稿 §8.1／§8.2 已經寫明的權利**，
 * 不自行新增、也不刪減 —— 本輪不是 legal research。
 *
 *   §8.1：查詢或請求閱覽、請求製給複製本、請求補充或更正、
 *         請求停止蒐集處理或利用、請求刪除
 *   §8.2：查看 / 更正 / 刪除 / 匯出（製給複製本）/ 撤回同意
 */
const PRIVACY_REQUEST_TYPES = Object.freeze([
  "access",
  "copy",
  "correction",
  "stop_processing",
  "deletion",
  "withdraw_consent",
  "other",
]);

const PRIVACY_REQUEST_TYPE_LABEL = Object.freeze({
  access: "查詢或請求閱覽",
  copy: "請求製給複製本（匯出）",
  correction: "請求補充或更正",
  stop_processing: "請求停止蒐集、處理或利用",
  deletion: "請求刪除",
  withdraw_consent: "撤回同意",
  other: "其他（須說明）",
});

/**
 * 案件狀態。**純粹描述處理進度，不描述任何法律結論。**
 *
 * 刻意沒有 `legally_satisfied` / `statutory_deadline_met` /
 * `lawful_refusal` / `identity_legally_verified` —— 那些都需要
 * 平台目前不具備的法律認定。
 */
const PRIVACY_REQUEST_STATUSES = Object.freeze([
  "open",
  "in_review",
  "waiting_for_information",
  "completed",
  "closed",
]);

const PRIVACY_REQUEST_STATUS_LABEL = Object.freeze({
  open: "已受理",
  in_review: "處理中",
  waiting_for_information: "等待補充資訊",
  completed: "已處理完成",
  closed: "已結案",
});

/** 合法狀態流轉。`closed` 是終態。 */
const PRIVACY_REQUEST_TRANSITIONS = Object.freeze({
  open: ["in_review", "closed"],
  in_review: ["waiting_for_information", "completed", "closed"],
  waiting_for_information: ["in_review", "completed", "closed"],
  completed: ["closed"],
  closed: [],
});

/**
 * 來源。目前只有一個 —— Owner 決定對外入口是 Privacy Email
 * （`DEC-LEGAL-07`），Admin 收到信之後在後台建立案件。
 * **本輪未新增任何站內或匿名的提交端點。**
 */
const PRIVACY_REQUEST_SOURCES = Object.freeze(["privacy_email"]);

const PRIVACY_REQUEST_EVENT_TYPES = Object.freeze(["created", "status_changed", "internal_note"]);

const MAX_SUMMARY_LENGTH = 5000;
const MAX_NOTE_LENGTH = 5000;
const MAX_REFERENCE_LENGTH = 255;

const isRequestType = (v) => PRIVACY_REQUEST_TYPES.includes(String(v));
const isStatus = (v) => PRIVACY_REQUEST_STATUSES.includes(String(v));
const isSource = (v) => PRIVACY_REQUEST_SOURCES.includes(String(v));

function textLength(value) {
  return [...String(value ?? "").trim()].length;
}

function fail(code, message, extra = {}) {
  return { valid: false, code, message, ...extra };
}

/**
 * 建立案件的輸入驗證。
 *
 * ## 資料最小化
 *
 * 只收「回覆這個請求真正需要的東西」：
 *   * `requestType` —— 對應到已揭露的權利
 *   * `requesterReference` —— 請求者寄件的聯絡識別（通常是 Email），否則無從回覆
 *   * `summary` —— 內部摘要
 *   * `receivedAt` —— 實際收到的時間（不是建案時間）
 *
 * **刻意不收**出生日期、身分證字號、護照、政府證件、銀行資訊 ——
 * 《隱私權政策》草稿並未揭露平台會蒐集這些，本輪也不得擅自擴張蒐集範圍。
 */
function validateCreate({ requestType, requesterReference, summary, receivedAt, source } = {}) {
  if (!isRequestType(requestType)) {
    return fail(
      "invalid_request_type",
      `requestType must be one of ${PRIVACY_REQUEST_TYPES.join("|")}`
    );
  }

  const reference = String(requesterReference ?? "").trim();
  if (!reference) {
    return fail("requester_reference_required", "requesterReference is required to reply to the request");
  }
  if (textLength(reference) > MAX_REFERENCE_LENGTH) {
    return fail("requester_reference_too_long", `requesterReference must be at most ${MAX_REFERENCE_LENGTH} characters`);
  }

  const text = String(summary ?? "").trim();
  if (!text) {
    return fail("summary_required", "summary is required");
  }
  if (textLength(text) > MAX_SUMMARY_LENGTH) {
    return fail("summary_too_long", `summary must be at most ${MAX_SUMMARY_LENGTH} characters`);
  }

  if (receivedAt === undefined || receivedAt === null || String(receivedAt).trim() === "") {
    return fail("received_at_required", "receivedAt is required");
  }
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime())) {
    return fail("received_at_invalid", "receivedAt must be a valid timestamp");
  }

  const src = source === undefined || source === null ? "privacy_email" : String(source).trim();
  if (!isSource(src)) {
    return fail("invalid_source", `source must be one of ${PRIVACY_REQUEST_SOURCES.join("|")}`);
  }

  return {
    valid: true,
    requestType: String(requestType),
    requesterReference: reference,
    summary: text,
    receivedAt: received,
    source: src,
  };
}

/** 狀態流轉的輸入驗證（不含 DB 查詢；實際 from 狀態由 service 讀取後比對）。 */
function validateTransitionInput({ toStatus, note } = {}) {
  if (!isStatus(toStatus)) {
    return fail("invalid_status", `status must be one of ${PRIVACY_REQUEST_STATUSES.join("|")}`);
  }
  const text = note == null ? "" : String(note).trim();
  if (textLength(text) > MAX_NOTE_LENGTH) {
    return fail("note_too_long", `note must be at most ${MAX_NOTE_LENGTH} characters`);
  }
  return { valid: true, toStatus: String(toStatus), note: text || null };
}

function canTransition(from, to) {
  return Boolean(PRIVACY_REQUEST_TRANSITIONS[from]?.includes(to));
}

module.exports = {
  PRIVACY_REQUEST_TYPES,
  PRIVACY_REQUEST_TYPE_LABEL,
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_REQUEST_STATUS_LABEL,
  PRIVACY_REQUEST_TRANSITIONS,
  PRIVACY_REQUEST_SOURCES,
  PRIVACY_REQUEST_EVENT_TYPES,
  MAX_SUMMARY_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_REFERENCE_LENGTH,
  isRequestType,
  isStatus,
  isSource,
  canTransition,
  validateCreate,
  validateTransitionInput,
};
