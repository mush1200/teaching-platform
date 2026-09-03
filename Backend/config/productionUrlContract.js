/**
 * Production 的對外 URL 與 token 期限契約（`PRE-12`）。
 *
 * ## 為什麼這是「資料被寫壞」而不是「顯示錯了」
 *
 * `utils/publicUrl.js` 在 `PUBLIC_BACKEND_URL` 與 `API_PUBLIC_URL` 皆未設時會**靜默**
 * 回退 `http://localhost:<PORT>`，而 `services/materialMedia.service.js` 的 `mediaUrl()`
 * 會把那個**絕對 URL** 寫進 `materials.cover_image_url` / `material_images.image_url` /
 * `demo_video_url`。事後把環境變數補上**不會**回寫既有列 —— 那些素材永久失效。
 *
 * 也就是說：設定缺漏的代價不是「這次請求壞掉」，而是**在資料庫留下永久的壞值**。
 * 因此這裡採用與 `utils/jwt.js`（`JWT_SECRET`）和 `config/privateFileStorage.js`
 * 相同的取捨 —— **寧可起不來，也不要在看起來正常、實際會寫壞資料的狀態下運行**。
 *
 * ## 這不是設定框架
 *
 * `PRE-12` 的缺口是**具體的四個變數**，不是「缺少一套設定系統」。本模組刻意只認
 * 這幾個名字、只做這幾件檢查，不提供註冊機制、不掃描環境、不做 schema 定義。
 * 需要再加變數時請明確加在下面，不要把它一般化。
 *
 * ## 只在 production 收緊
 *
 * 本機開發與測試**維持既有的 localhost 回退**：那是開發者每天在用的路徑，
 * 收緊它只會製造摩擦而擋不到任何 production 事故。判準是 `NODE_ENV === "production"`，
 * 與 `config/privateFileStorage.js` 一致。
 *
 * 唯一的例外是 `JWT_EXPIRES_IN` 的**格式**檢查 —— 那與 localhost 回退無關，
 * 而且「設錯要等到第一次登入才炸」在任何環境都是壞的失敗時點，因此**所有環境都檢查**。
 *
 * canonical 契約（別名、預設值）見 `docs/production-environment-contract.md`。
 * 本模組**不自行發明**別名或預設值。
 */

const jwt = require("jsonwebtoken");

/** canonical 名稱 → 該變數在 canonical 契約中被允許的別名。 */
const BACKEND_URL_VARS = ["PUBLIC_BACKEND_URL", "API_PUBLIC_URL"];
const WEB_URL_VARS = ["PUBLIC_WEB_URL", "FRONTEND_URL", "APP_BASE_URL"];

function trimmed(value) {
  return String(value ?? "").trim();
}

function isProduction() {
  return trimmed(process.env.NODE_ENV).toLowerCase() === "production";
}

/**
 * 回傳第一個有值的變數名與值。全部未設時回 `null`。
 * **不做回退** —— 回退正是本模組要消滅的行為。
 */
function readFirstConfigured(names) {
  for (const name of names) {
    const value = trimmed(process.env[name]);
    if (value) return { name, value };
  }
  return null;
}

/**
 * production 用的 loopback 判斷。
 *
 * 只擋**確定指向本機**的目的地。`PRE-10`（自訂網域）仍未解除，因此
 * Render 配發的 `*.onrender.com` 必須通過 —— 這裡不檢查網域長相，只檢查 loopback。
 */
function isLoopbackHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  if (h.endsWith(".localhost")) return true;
  return /^127\./.test(h);
}

/**
 * 驗證一個 production 對外 URL。
 *
 * 「非空字串」不算通過 —— 一個打錯的值（少了 scheme、貼成一段句子）同樣會被
 * 寫進資料列，而且比未設更難察覺。
 *
 * @returns {string|null} 錯誤說明；通過時回 `null`
 */
function describeUrlProblem(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return `is not a valid absolute URL (got ${JSON.stringify(value)})`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `must use http: or https: (got ${JSON.stringify(parsed.protocol)})`;
  }
  if (isLoopbackHost(parsed.hostname)) {
    return (
      `points at a loopback host (${JSON.stringify(parsed.hostname)}). ` +
      "In production this value is persisted into database rows / emailed to users, " +
      "so a localhost value is permanently wrong for everyone but this container."
    );
  }
  return null;
}

/** 一組 URL 變數的 production 檢查。缺漏或不合法都 throw。 */
function assertProductionUrl({ names, purpose }) {
  const canonical = names[0];
  const aliasNote =
    names.length > 1 ? ` (or its documented alias${names.length > 2 ? "es" : ""} ${names.slice(1).join(" / ")})` : "";

  const found = readFirstConfigured(names);
  if (!found) {
    throw new Error(
      `${canonical} is not set${aliasNote}. Refusing to start in production. ` +
        `${purpose} Without it the process would silently fall back to a localhost URL.`
    );
  }

  const problem = describeUrlProblem(found.value);
  if (problem) {
    // 有些說明本身以句號結尾，去掉再接，避免出現 ".." 這種讀起來像壞掉的訊息。
    throw new Error(
      `${found.name} ${problem.replace(/\.$/, "")}. Refusing to start in production. ${purpose}`
    );
  }

  return found;
}

/**
 * `JWT_EXPIRES_IN` 的格式檢查。
 *
 * **不自己寫 regex** —— 合法的期限字串由 `jsonwebtoken`（內部用 `ms`）定義，
 * 自己猜一套規則遲早會與函式庫不一致。這裡直接用一個拋棄式 secret 簽一個空 payload，
 * 讓函式庫自己判斷；那是唯一與 runtime 完全同義的檢查。
 *
 * 語意（依 canonical 契約，不自行發明）：
 *   - 未設         → 通過。`utils/jwt.js` 使用**已載明的預設值** `"7d"`
 *   - 設了但空白   → **拒絕**。有人設了它卻留空，是設定錯誤而不是「想用預設」
 *   - 設了且合法   → 通過
 *   - 設了但不合法 → 拒絕（原本要到**第一次登入**才 throw）
 */
function assertJwtExpiresIn() {
  const raw = process.env.JWT_EXPIRES_IN;
  if (raw === undefined || raw === null) return { configured: false };

  if (trimmed(raw) === "") {
    throw new Error(
      "JWT_EXPIRES_IN is set but blank. Refusing to start. Either remove it entirely " +
        '(the documented default "7d" then applies) or give it a valid duration such as "7d".'
    );
  }

  try {
    // 期限格式是唯一受測目標，因此 secret 用拋棄值，與真正的 JWT_SECRET 無關。
    jwt.sign({}, "jwt-expires-in-format-probe", { expiresIn: String(raw) });
  } catch (err) {
    throw new Error(
      `JWT_EXPIRES_IN is not a valid duration (got ${JSON.stringify(String(raw))}): ${err.message}. ` +
        "Refusing to start. Previously this only failed on the first login attempt."
    );
  }

  return { configured: true };
}

/**
 * `PRE-12` 的啟動契約。**在 `app.listen()` 之前呼叫，失敗即拒絕啟動。**
 *
 * 刻意沒有 try/catch —— 呼叫端不得把它降級成警告。
 *
 * @returns {{production: boolean, checked: string[]}}
 */
function assertProductionConfigContract() {
  const checked = [];

  // 格式檢查與 localhost 回退無關，所有環境都做。
  assertJwtExpiresIn();
  checked.push("JWT_EXPIRES_IN");

  if (!isProduction()) {
    return { production: false, checked };
  }

  const backend = assertProductionUrl({
    names: BACKEND_URL_VARS,
    purpose:
      "It is the base URL persisted into materials.cover_image_url / material_images.image_url / " +
      "demo_video_url and used to build material download links.",
  });
  checked.push(backend.name);

  const web = assertProductionUrl({
    names: WEB_URL_VARS,
    purpose: "It is the base URL for every link inside transactional email.",
  });
  checked.push(web.name);

  return { production: true, checked };
}

module.exports = {
  assertProductionConfigContract,
  // 測試用；production code 不應直接呼叫這些。
  assertJwtExpiresIn,
  assertProductionUrl,
  describeUrlProblem,
  isLoopbackHost,
  isProduction,
  BACKEND_URL_VARS,
  WEB_URL_VARS,
};
