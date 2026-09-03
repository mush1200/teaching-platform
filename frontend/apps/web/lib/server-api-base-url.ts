/**
 * Server-side 的 Backend base URL（`PRE-12`）。
 *
 * ## 為什麼要有這一份
 *
 * 先前有**五個各自獨立**的 `process.env.API_BASE_URL ?? "http://localhost:3000"`。
 * 在 production 少設一個變數時，它們會**各自安靜地**指向本機的 3000 埠 ——
 * 整站的 server 端 API 呼叫全部失效，而且沒有任何錯誤指出原因。
 * 五份回退等於五個各自出錯的地方，因此收斂成一份。
 *
 * ## 只在 production 收緊
 *
 * 本機開發與測試**維持 localhost 回退**：那是開發者每天在用的路徑
 * （`playwright.config.ts` 也會為 e2e 明確注入這個變數）。
 * 判準是 `NODE_ENV === "production"`，與 Backend 的
 * `config/productionUrlContract.js` 一致。
 *
 * ## 這是 server-only
 *
 * `API_BASE_URL` **不是** `NEXT_PUBLIC_*`，因此不會進到瀏覽器 bundle ——
 * 瀏覽器一律走同源的 `/api/backend/*` proxy。不要在 client component 匯入本檔。
 */

const DEV_FALLBACK = "http://localhost:3000";

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  if (h.endsWith(".localhost")) return true;
  return /^127\./.test(h);
}

/**
 * 取得 Backend base URL（不含結尾斜線）。
 *
 * production 下缺漏或不合法即 **throw** —— 靜默回退 localhost 會讓整站看起來
 * 「只是壞了」，卻查不到原因。
 */
export function getServerApiBaseUrl(): string {
  const raw = (process.env.API_BASE_URL ?? "").trim();
  const isProduction = (process.env.NODE_ENV ?? "").toLowerCase() === "production";

  if (!isProduction) {
    return (raw || DEV_FALLBACK).replace(/\/$/, "");
  }

  if (!raw) {
    throw new Error(
      "API_BASE_URL is not set. Refusing to serve in production: every server-side call " +
        "to the backend would silently fall back to localhost and fail for all users."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`API_BASE_URL is not a valid absolute URL (got ${JSON.stringify(raw)}).`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`API_BASE_URL must use http: or https: (got ${JSON.stringify(parsed.protocol)}).`);
  }
  if (isLoopbackHost(parsed.hostname)) {
    throw new Error(
      `API_BASE_URL points at a loopback host (${JSON.stringify(parsed.hostname)}). ` +
        "In production the backend is a separate service, so localhost can never be correct."
    );
  }

  return raw.replace(/\/$/, "");
}
