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
 * 測試要打的 app origin。
 *
 * `PLAYWRIGHT_BASE_URL` 覆寫預設值；port 由 `playwright.config.ts` 的 `webServer`
 * 一起啟動，兩者必須指向同一個地方。
 */
export function getTestBaseUrl(): string {
  const raw = process.env.PLAYWRIGHT_BASE_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : DEFAULT_BASE_URL;
}

/** `addCookies` 需要一個帶結尾斜線的 URL。 */
export function getTestCookieUrl(): string {
  return `${getTestBaseUrl()}/`;
}
