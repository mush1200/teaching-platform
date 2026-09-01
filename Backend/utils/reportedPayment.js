/**
 * 買家付款申報資訊的驗證（canonical）。
 *
 * ## 這些是**買家申報**，不是平台查證的事實
 *
 * `manual_payment_proofs.reported_*` 的 `reported_` 前綴是刻意的
 * （見 `db/db_schema.sql` 與 `docs/mvp_rules.md` §12.3）：
 * 網路交易定型化契約「不得記載事項」第七點不允許平台把自己的紀錄當成唯一認定依據。
 *
 * 因此本模組**只驗格式，不驗真偽**：
 *
 *   * ❌ 不比對 `reported_amount` 與 `orders.total_amount`（金額不符是**爭議事實**，
 *     不是輸入錯誤 —— 擋掉它等於讓買家無法申報「我少匯了」或「我多匯了」）
 *   * ❌ 不驗證帳戶所有權、不接銀行 API、不做 KYC
 *   * ❌ 不維護銀行代碼表
 *
 * ## 只保存足以核對的最小個資
 *
 * 銀行名稱、**帳號末四碼**、申報金額、申報匯款時間。
 * **不保存完整銀行帳號**，DB 另有 `mpp_reported_last4_check` 以 `^[0-9]{4}$` 擋住。
 */

/** 銀行名稱的長度上限。只是護欄，不是業務規則。 */
const MAX_BANK_NAME_LENGTH = 60;

/** 申報匯款時間的未來寬容（時區／時鐘偏差）。與 Admin 入帳時間的規則一致。 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function fail(code, message) {
  return { valid: false, code, message };
}

/**
 * 驗證並正規化一組買家付款申報。
 *
 * 四個欄位**全部選填**：Phase 1 允許買家只上傳憑證圖片而不填欄位
 * （既有行為，不得因為新增欄位就把既有流程變成必填）。
 * 但**只要有填就必須合格** —— 半套的申報比沒有申報更難核對。
 *
 * @param {object} input
 * @param {Date} [now] 可注入以利測試
 * @returns {{valid: true, value: {bankName: string|null, accountLast4: string|null,
 *            amount: number|null, transferAt: Date|null}, provided: boolean}
 *          | {valid: false, code: string, message: string}}
 */
function validateReportedPayment(input = {}, now = new Date()) {
  const { reportedBankName, reportedAccountLast4, reportedAmount, reportedTransferAt } = input;

  let bankName = null;
  if (reportedBankName != null && String(reportedBankName).trim() !== "") {
    bankName = String(reportedBankName).trim();
    if (bankName.length > MAX_BANK_NAME_LENGTH) {
      return fail("invalid_reported_bank_name", `匯款銀行名稱不可超過 ${MAX_BANK_NAME_LENGTH} 個字。`);
    }
  }

  let accountLast4 = null;
  if (reportedAccountLast4 != null && String(reportedAccountLast4).trim() !== "") {
    accountLast4 = String(reportedAccountLast4).trim();
    // **只收末四碼。** 完整帳號不在本平台的蒐集範圍。
    if (!/^[0-9]{4}$/.test(accountLast4)) {
      return fail("invalid_reported_account_last4", "匯款帳號末四碼必須是 4 位數字。");
    }
  }

  let amount = null;
  if (reportedAmount != null && String(reportedAmount).trim?.() !== "") {
    const parsed = Number(reportedAmount);
    // 訂單金額是 INTEGER（`orders.total_amount`），申報金額的精度必須一致。
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fail("invalid_reported_amount", "匯款金額必須是正整數。");
    }
    amount = parsed;
  }

  let transferAt = null;
  if (reportedTransferAt != null && String(reportedTransferAt).trim() !== "") {
    const parsed = new Date(String(reportedTransferAt));
    if (Number.isNaN(parsed.getTime())) {
      return fail("invalid_reported_transfer_at", "匯款時間格式不正確。");
    }
    // 已經發生的事不可能在未來。
    if (parsed.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      return fail("invalid_reported_transfer_at", "匯款時間不可以是未來時間。");
    }
    transferAt = parsed;
  }

  return {
    valid: true,
    value: { bankName, accountLast4, amount, transferAt },
    provided: bankName != null || accountLast4 != null || amount != null || transferAt != null,
  };
}

module.exports = {
  MAX_BANK_NAME_LENGTH,
  FUTURE_TOLERANCE_MS,
  validateReportedPayment,
};
