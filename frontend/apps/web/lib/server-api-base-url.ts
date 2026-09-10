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
 * E2E harness 專用的 loopback 例外（`DX-23`）—— **只鬆綁 loopback 這一項**。
 *
 * ## 為什麼需要它
 *
 * `E2E_SERVER=production` 走 `next start`，而 `next start` 就是 `NODE_ENV=production`。
 * 同時 `playwright.config.ts` 為了修 IPv6 `ECONNREFUSED ::1:3000`（`DX-19`）而注入
 * `API_BASE_URL=http://127.0.0.1:3000`。兩者**各自都正確**，但湊在一起必然衝突：
 * 凡經過 `/api/backend/*`、`/api/auth/*` 的 server 端呼叫一律 500。
 *
 * 這是 **harness 組態的衝突，不是產品缺陷**。正確的處置是讓 harness 明示地宣告
 * 「我是隔離測試，不是部署」，而**不是**放寬 production 的判準。
 *
 * ## 為什麼不是把 guard 改弱
 *
 * `PRE-12` 的 loopback 拒絕是安全需求：真實部署若指向自己，整站 server 端呼叫會
 * 全數失敗，而且是**安靜地**失敗。那個不變條件必須原樣保留 —— 見下方三道限制。
 *
 * ## 三道限制，使它無法在真實 production 生效
 *
 * 1. **只認 `"1"` 這個精確值**，其餘（含 `"true"`／`"yes"`／空字串）一律不生效。
 * 2. **只鬆綁 loopback 一項**。未設定、非絕對 URL、非 http(s) 仍然照樣 throw ——
 *    它不是「跳過驗證」，是「這一台 loopback backend 是被認可的」。
 * 3. **`render.yaml` 不宣告這個變數**，由 `production-url-guard.spec.ts` 的
 *    source-scan 測試釘住；部署環境因此無從繼承它。
 *
 * 變數名刻意冗長且以 `E2E_` 起頭（與 `E2E_SERVER`／`E2E_REUSE_BACKEND`／
 * `E2E_TARGET_DB` 同一套慣例），且**由 `playwright.config.ts` 自己注入**，
 * 開發者不需要、也不應該手動設定它。
 *
 * **不得**把它一般化為 `ALLOW_LOOPBACK` 之類的廣義開關。
 */
function isE2EHarnessLoopbackSanctioned(): boolean {
  return process.env.E2E_ALLOW_LOOPBACK_API_BASE_URL === "1";
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
  if (isLoopbackHost(parsed.hostname) && !isE2EHarnessLoopbackSanctioned()) {
    throw new Error(
      `API_BASE_URL points at a loopback host (${JSON.stringify(parsed.hostname)}). ` +
        "In production the backend is a separate service, so localhost can never be correct."
    );
  }

  return raw.replace(/\/$/, "");
}
