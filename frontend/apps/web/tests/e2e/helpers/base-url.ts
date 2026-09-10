/**
 * E2E 目標 origin 的**唯一來源**。
 *
 * 之前有三個地方各自寫死 `http://127.0.0.1:3010`：`playwright.config.ts`、
 * `helpers/auth.ts`，以及 `critical-acceptance.spec.ts` 的 cookie 設定。
 * 前兩者至少會跟著 `PLAYWRIGHT_BASE_URL` 走，第三個完全寫死 —— 只要把測試指到
 * 別的 port（例如 production build 的 server），cookie 就會被設在 3010 而永遠送不出去，
 * 於是每個需要登入的測試都在登入頁上「通過」。
 *
 * 這個 module 沒有相依，因此 `playwright.config.ts` 與 spec 都可以 import 它。
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:3010";

/**
 * production 模式的預設 port（`DX-23`）。
 *
 * **為什麼不跟 dev 共用 3010：** `E2E_SERVER=production` 必須真的執行
 * `next start`（＝ `NODE_ENV=production`）才有意義。若沿用 3010，會撞上
 * 開發者常態在跑的 `npm run dev:web:3010`，於是只剩兩種結果，兩種都不能接受：
 *
 *   - `reuseExistingServer: true` → 靜默重用那台 **dev** server，
 *     整輪根本沒跑在 production 底下，套件**假綠**（`DX-23` 實測 12/12 假通過）。
 *   - `reuseExistingServer: false` → port 被佔用而直接失敗，
 *     等於要求開發者先停掉 dev server，違反 `DX-05` 立下的前提
 *     （「驗收不需要停掉 dev server」）。
 *
 * 換一個預設 port 同時解決兩者：production 驗收永遠起自己的 server、
 * 永遠真的跑在 production 底下，且完全不碰 3010。
 */
const DEFAULT_PRODUCTION_BASE_URL = "http://127.0.0.1:3011";

/**
 * 測試要打的 app origin。
 *
 * `PLAYWRIGHT_BASE_URL` 覆寫預設值；port 由 `playwright.config.ts` 的 `webServer`
 * 一起啟動，兩者必須指向同一個地方。
 *
 * 未明示指定時：dev 模式用 3010，`E2E_SERVER=production` 用 3011（見上）。
 */
export function getTestBaseUrl(): string {
  const raw = process.env.PLAYWRIGHT_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return process.env.E2E_SERVER === "production" ? DEFAULT_PRODUCTION_BASE_URL : DEFAULT_BASE_URL;
}

/** `addCookies` 需要一個帶結尾斜線的 URL。 */
export function getTestCookieUrl(): string {
  return `${getTestBaseUrl()}/`;
}
