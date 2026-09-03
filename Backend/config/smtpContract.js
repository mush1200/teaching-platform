/**
 * Production 的 SMTP 設定契約（`REL-03`）。
 *
 * ## 問題
 *
 * `services/emailService.js` 的 `getTransporter()` 是**延遲建立**的：設定缺漏時
 * backend 照常啟動、照常收單，直到**第一次寄信**才 throw，而那個例外會被
 * `utils/bestEffortDispatch.js`（`REL-02`）接住並只印一行 `console.error`。
 * 結果是「**設定根本沒填**」與「**這次寄信剛好失敗**」看起來一模一樣。
 *
 * ## 為什麼不是無條件 fail-closed
 *
 * `DEC-17` 明示 **MVP 初期不啟用郵件**，`render.yaml` 因此**刻意不宣告任何
 * `SMTP_*`**，而現行 production 正是在這個狀態下運行。無條件要求 SMTP 齊備
 * 會讓現在的 production **起不來** —— 那不是修好，是製造事故。
 *
 * ## 因此：條件式契約（Owner decision，2026-09-03）
 *
 * ```text
 *   五個 production SMTP 變數全部不存在  → 允許啟動（維持 DEC-17 的現況）
 *   任何一個存在                        → 視為「已啟用 SMTP」，整份契約必須成立
 *   部分設定 / 格式錯誤                  → 拒絕啟動（那是部署錯誤）
 * ```
 *
 * 「存在」的判準是**變數有沒有被設定**，不是它有沒有值 ——
 * 一個只留空白的 `SMTP_PASS` 是**有人試圖設定卻設錯**，不是「無意啟用郵件」。
 * 因此空白值會 engage 契約，然後在驗證時失敗。這正是要抓的情況。
 *
 * ## 這不是 feature flag
 *
 * 這裡**沒有** `EMAIL_ENABLED` / `MAIL_DISABLED`，也不打算有。啟用與否由
 * 「設定存不存在」本身表達，**不新增產品層級的開關**。
 *
 * ## 這個檢查證明什麼、不證明什麼
 *
 * 它只證明**設定完整且格式正確**。它**不證明**：SMTP 連得上、Resend 認證成功、
 * 寄件網域已驗證、DNS／SPF／DKIM／DMARC 正確、信真的進得了收件匣。
 * 那些屬於 `PRE-10` 與實際投遞的範圍。**本模組不進行任何網路連線。**
 *
 * ## 邊界
 *
 * 不改 `REL-02` 的 rejection 邊界，也不碰 `emailService.js` ——
 * 啟動後單次寄信失敗**仍然**只被接住並記錄，不影響任何業務交易。
 */

/**
 * production 的 SMTP 變數。**`SMTP_TEST_TO` 不在其中** ——
 * 它只被 `scripts/smtp-smoke-test.js` 使用，是 test-only 變數，
 * 不得因為它存在就把 production 判定為「已啟用 SMTP」。
 */
const SMTP_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];

/** `SMTP_PORT` 未設時 `emailService.js` 使用的既有預設，見 canonical 契約。 */
const DEFAULT_SMTP_PORT = 587;

function trimmed(value) {
  return String(value ?? "").trim();
}

function isProduction() {
  return trimmed(process.env.NODE_ENV).toLowerCase() === "production";
}

/**
 * SMTP 是否被「啟用」。
 *
 * 只看變數**是否被定義**（含空白值）—— 空白代表設定失敗而不是無意啟用。
 */
function isSmtpEngaged(env = process.env) {
  return SMTP_VARS.some((name) => env[name] !== undefined && env[name] !== null);
}

/**
 * 寄件地址驗證。
 *
 * 接受 `user@example.com` 與 `Display Name <user@example.com>` 兩種
 * （`emailService.js` 把它直接交給 nodemailer 的 `from`，兩者皆合法）。
 *
 * 刻意**只做結構檢查**，不引入 email 驗證相依、也不試圖判斷網域是否真實存在 ——
 * 那需要 `PRE-10` 的網域決定，而本檢查必須在網域拍板之前就能用。
 * 但它必須擋掉已知的實際壞值：`SMTP_FROM` 未設時舊行為會回退成 `SMTP_USER`，
 * 在 Resend 情境下那是字面 `resend`，**不是地址**。
 */
function isValidSenderAddress(value) {
  const raw = trimmed(value);
  if (!raw) return false;
  const angle = raw.match(/<([^<>]+)>\s*$/);
  const mailbox = angle ? angle[1].trim() : raw;
  if (/\s/.test(mailbox)) return false;
  const at = mailbox.indexOf("@");
  if (at <= 0 || at !== mailbox.lastIndexOf("@")) return false;
  const domain = mailbox.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

/**
 * `SMTP_PORT` 驗證。
 *
 * 未設 → 沿用既有預設 587（canonical 契約允許省略，本模組不改變它）。
 * 設了就必須是 **1..65535 的整數** —— 現行程式碼是 `Number(...)`，
 * `"abc"` 會得到 `NaN` 而 `secure: NaN === 465` 為 false，
 * 於是連線在寄信時才失敗。小數同樣拒絕（`587.5` 不是埠號）。
 *
 * @returns {string|null} 錯誤說明；通過時 `null`
 */
function describePortProblem(raw) {
  if (raw === undefined || raw === null) return null;
  const text = trimmed(raw);
  if (text === "") return "is set but blank";
  if (!/^\d+$/.test(text)) {
    return `is not a whole number (got ${JSON.stringify(String(raw))})`;
  }
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return `must be between 1 and 65535 (got ${JSON.stringify(String(raw))})`;
  }
  return null;
}

/**
 * `REL-03` 的啟動契約。**在 `app.listen()` 之前呼叫，失敗即拒絕啟動。**
 *
 * 不連線、不建立 transport、不寄信、不碰資料庫、**不印出任何 secret**
 * （錯誤訊息只提變數名稱，不提值）。
 *
 * @returns {{production: boolean, engaged: boolean, checked: string[]}}
 */
function assertProductionSmtpContract() {
  if (!isProduction()) {
    return { production: false, engaged: isSmtpEngaged(), checked: [] };
  }

  if (!isSmtpEngaged()) {
    // `DEC-17`：MVP 初期不啟用郵件是**被允許的**狀態，不是錯誤。
    return { production: true, engaged: false, checked: [] };
  }

  const present = SMTP_VARS.filter((n) => process.env[n] !== undefined && process.env[n] !== null);
  const problems = [];

  for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) {
    if (!trimmed(process.env[name])) {
      problems.push(`${name} is missing or blank`);
    }
  }

  const portProblem = describePortProblem(process.env.SMTP_PORT);
  if (portProblem) problems.push(`SMTP_PORT ${portProblem}`);

  const from = process.env.SMTP_FROM;
  if (from === undefined || from === null || !trimmed(from)) {
    problems.push(
      "SMTP_FROM is missing or blank (it must not fall back to SMTP_USER here: " +
        'with Resend that fallback yields the literal "resend", which is not an address)'
    );
  } else if (!isValidSenderAddress(from)) {
    problems.push("SMTP_FROM is not a valid sender address");
  }

  if (problems.length > 0) {
    throw new Error(
      `SMTP configuration is incomplete or invalid. Refusing to start in production.\n` +
        `  Configured (present): ${present.join(", ")}\n` +
        `  Problems: ${problems.join("; ")}\n` +
        `  Either supply the complete SMTP contract (${SMTP_VARS.join(", ")}), ` +
        `or remove every SMTP_* variable to run without email (permitted by DEC-17).\n` +
        `  Note: this check validates configuration only. It does not prove connectivity, ` +
        `authentication, sender-domain verification, or delivery.`
    );
  }

  return { production: true, engaged: true, checked: present };
}

module.exports = {
  assertProductionSmtpContract,
  // 測試用
  isSmtpEngaged,
  isValidSenderAddress,
  describePortProblem,
  SMTP_VARS,
  DEFAULT_SMTP_PORT,
};
