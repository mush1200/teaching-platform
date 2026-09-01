/**
 * 人工轉帳的收款帳戶資訊 —— **全系統唯一來源**。
 *
 * 平台目前唯一的金流方式是「買家自行匯款 ＋ 管理員審核憑證」（CLAUDE.md §1），
 * 所以這組數字是買家真的會照著匯錢的目標。先前它被**硬編碼在三個地方**
 * （checkout 頁、payment-proof 頁、訂單成立通知信），三份各寫各的、且都是佔位值
 * `1234-5678-9012-3456`。任何一份被改到、其他兩份沒跟上，買家就會收到互相矛盾的匯款指示。
 *
 * 因此改成：**Backend 是唯一持有者**，前端一律透過 `GET /payment/bank-info` 取得，
 * 通知信也讀同一個 function。前端不再保留任何 fallback 常數 —— 有 fallback 就等於
 * 又多一份 source of truth，而且會在設定缺失時安靜地顯示錯的帳號。
 *
 * ## 為什麼是 env 而不是 DB
 *
 * 這是**部署環境設定**，不是營運可調的業務參數：換帳戶牽涉對帳與金流稽核，
 * 不該是後台一個表單就能改的東西（與 tracker §15.5 S-1 的判準一致 —— 目前沒有
 * 任何業務常數合格成為 Admin 可調設定）。放 env 也避免為單一組值新增 schema。
 *
 * ## Fail safe，不 fail secret
 *
 * 未設定時**不編造帳號、也不沿用任何預設值**，而是回報 `configured: false`，
 * 由呼叫端決定如何降級（前端顯示「付款資訊尚未設定」並擋住付款指示，
 * 通知信略過匯款段落）。這與 `privateFileStorage.js` 的 fail-closed 是同一個原則：
 * 缺設定時要看得見地壞掉，不要安靜地錯。
 *
 * 這裡**刻意不在啟動時 throw**：付款資訊缺失只會讓付款指示不可用，
 * 不像 `JWT_SECRET` 那樣會讓整個授權模型失效，因此不阻擋 Backend 啟動
 * （否則本機開發與既有測試都得先配一組假帳號 —— 那正是本項要消滅的東西）。
 */

/**
 * 已知佔位值 —— 一律視同「未設定」。
 *
 * 沿用 CLAUDE.md §8 對 `JWT_SECRET` 的同一條規則：把佔位字串貼進 env 不算設定完成。
 * 少了這道檢查，本項最可能的迴歸就是有人把舊的假帳號原封不動搬進 `.env`，
 * 於是三處畫面「一致地」顯示同一個不存在的帳號 —— 比先前更難發現。
 */
const PLACEHOLDER_ACCOUNTS = new Set(["1234-5678-9012-3456", "1234567890123456", "0000000000000000"]);

const PLACEHOLDER_NAMES = new Set(["teaching platform", "teaching platform co.", "teaching platform 收款帳戶"]);

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** 帳號比對時忽略分隔符，避免 `1234-5678…` 與 `12345678…` 被當成兩個不同的值。 */
function normalizeAccount(value) {
  return trimmed(value).replace(/[\s-]/g, "");
}

/**
 * 讀取收款帳戶設定。
 *
 * @returns {{configured: true, bankName: string, bankCode: string, accountNumber: string, accountName: string}
 *          | {configured: false, missing: string[]}}
 */
function getPaymentBankInfo() {
  const bankName = trimmed(process.env.PAYMENT_BANK_NAME);
  const bankCode = trimmed(process.env.PAYMENT_BANK_CODE);
  const accountNumber = trimmed(process.env.PAYMENT_BANK_ACCOUNT);
  const accountName = trimmed(process.env.PAYMENT_BANK_ACCOUNT_NAME);

  const missing = [];
  if (!bankName) missing.push("PAYMENT_BANK_NAME");
  if (!bankCode) missing.push("PAYMENT_BANK_CODE");
  if (!accountNumber) missing.push("PAYMENT_BANK_ACCOUNT");
  if (!accountName) missing.push("PAYMENT_BANK_ACCOUNT_NAME");

  if (PLACEHOLDER_ACCOUNTS.has(normalizeAccount(accountNumber))) {
    missing.push("PAYMENT_BANK_ACCOUNT (placeholder value is not accepted)");
  }
  if (PLACEHOLDER_NAMES.has(accountName.toLowerCase())) {
    missing.push("PAYMENT_BANK_ACCOUNT_NAME (placeholder value is not accepted)");
  }

  if (missing.length > 0) {
    return { configured: false, missing };
  }

  return { configured: true, bankName, bankCode, accountNumber, accountName };
}

/** 通知信用的單行摘要；未設定時回 `null`，由呼叫端略過整個匯款段落。 */
function formatBankInfoLine() {
  const info = getPaymentBankInfo();
  if (!info.configured) return null;
  return `銀行代碼 ${info.bankCode} / 銀行 ${info.bankName} / 戶名 ${info.accountName} / 帳號 ${info.accountNumber}`;
}

module.exports = { getPaymentBankInfo, formatBankInfoLine };
