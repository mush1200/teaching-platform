import { defineConfig, devices } from "@playwright/test";
import { BACKEND_PREREQUISITE } from "./tests/e2e/helpers/backend-prerequisite";
import { getTestBaseUrl } from "./tests/e2e/helpers/base-url";

const baseURL = getTestBaseUrl();
const port = Number(new URL(baseURL).port || 3010);

/**
 * `E2E_SERVER=production` 讓整套測試跑在 `next start`（production build）上，
 * 而不是 `next dev`。
 *
 * 差別不只是速度：dev server 的路由是 on-demand 編譯的，冷路由第一次導覽在一般開發機上
 * 就要 5–30 秒，會產生一堆與程式無關的偽失敗。production build 沒有這個階段，
 * 因此 **acceptance threshold 也不該為了 dev 而永久放寬** —— 見下方 timeout 設定。
 *
 *   npm run verify:web && E2E_SERVER=production npx playwright test
 */
const isProductionServer = process.env.E2E_SERVER === "production";

/**
 * Production E2E 的建置產物目錄必須與**驗收 build 寫進去的那一個**一致（`DX-05`）。
 *
 * `verify:web`（`frontend/scripts/verify-web.mjs`）預設把 build 寫到 `.next-verify`，
 * 讓驗收不會弄壞另一個 session 在 3010 執行中的 `next dev`（那個 dev server 用 `.next`）。
 * 這裡若不跟著設，`next start` 會回頭去讀 `.next` —— 也就是 dev 的產物 ——
 * 於是要嘛啟動失敗、要嘛測到的根本不是剛驗收過的那份 build。
 *
 * 兩邊共用同一個環境變數與同一個預設值；呼叫端已設定時**尊重呼叫端**。
 * dev server 模式（未設 `E2E_SERVER`）完全不受影響，仍用預設的 `.next`。
 */
const DEFAULT_VERIFY_DIST_DIR = ".next-verify";
if (isProductionServer && !process.env.NEXT_DIST_DIR?.trim()) {
  process.env.NEXT_DIST_DIR = DEFAULT_VERIFY_DIST_DIR;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  /*
   * Production server 用 Playwright 預設值（test 30s / expect 5s）—— 那是真正的
   * acceptance threshold，不得因為 dev server 慢就調鬆。
   *
   * Dev server 才放寬：路由 on-demand 編譯，冷啟動的第一次導覽可以超過 30 秒
   * （實測 `GET /creator/sales 200 in 27578ms`）。`admin.spec.ts` 早就為此在個別 test
   * 加了 `test.setTimeout(120_000)`；這裡把同一件事收斂成一個有條件的預設值，
   * 而不是散落在各 test 的繃帶。
   */
  timeout: isProductionServer ? 30_000 : 60_000,
  expect: { timeout: isProductionServer ? 5_000 : 15_000 },
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"], browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
  ],
  /*
   * `DX-19` —— live-backend 前置條件的驗證層。
   *
   * Playwright 1.59 先啟動 `webServer`、**再**跑 `globalSetup`（2026-08-30 以拋棄式
   * config 實測確認），因此這裡可以放心假設兩個 server 都已就緒，只負責「驗證並誠實報錯」。
   */
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: [
    /*
     * `DX-19` —— backend 由 harness 自己管生命週期。
     *
     * 在這之前 backend :3000 是**人工**前置條件，於是 backend 沒開時會出現兩種
     * 都無法自我解釋的結果（實測紀錄見 `tests/e2e/global-setup.ts` 檔頭）：
     * `api-proxy` 報 "Expected: 200 / Received: 500" 的假紅燈，
     * 以及 `legal-publication-security` 四條 public route 全綠的**假綠燈**。
     *
     * ## 資料庫安全（`CLAUDE.md` §7）
     *
     * `PGDATABASE` 在 spawn 時**寫死**注入測試資料庫，因此正確性**由建構保證** ——
     * 不依賴任何人記得 `export PGDATABASE`。`Backend/config/db.js` 未設 `DATABASE_URL`
     * 時使用 `PG*` 變數，而 dotenv 不覆寫已存在的環境變數，所以這裡的值優先於 `Backend/.env`。
     *
     * ## 為什麼預設**不**重用既有 backend
     *
     * 開發者常態會在 3000 跑 `npm run dev`（nodemon，連**開發**資料庫）。
     * 若預設 `reuseExistingServer: true`，整套 E2E 會安靜地打在開發資料庫上並寫入資料。
     * 需要重用時以 `E2E_REUSE_BACKEND=1` 明確表態，`global-setup.ts` 會同時印出
     * 「無法從外部證明對方連的是哪個資料庫」的警告。
     */
    {
      command: "node Backend/index.js",
      cwd: BACKEND_PREREQUISITE.repoRoot,
      url: `${BACKEND_PREREQUISITE.baseUrl}/health`,
      reuseExistingServer: BACKEND_PREREQUISITE.reused,
      timeout: 60 * 1000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PGDATABASE: BACKEND_PREREQUISITE.expectedDb,
        PORT: String(new URL(BACKEND_PREREQUISITE.baseUrl).port || 3000),
      },
    },
    {
      // production 需要先 `npm run build`；`next start` 不會自己編譯。
      command: isProductionServer ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 180 * 1000,
      /*
       * 前端的 server-side fetch（`/materials/:id`、四條 legal route）要打到
       * 上面那台 backend。不指定時 `API_BASE_URL` 會落到預設的 `http://localhost:3000`，
       * 在只有 IPv6 loopback 解析的環境下會變成 `ECONNREFUSED ::1:3000`（實測見 `DX-19`）。
       */
      env: {
        API_BASE_URL: BACKEND_PREREQUISITE.baseUrl,
        /*
         * `PRE-14` —— 讓 harness 起的 web server 有一個**已設定**的客服信箱，
         * 使 `/support` 的「configured」分支在真實瀏覽器裡被走到。
         *
         * `.test` 是保留 TLD，不可能寄達 —— 這裡要的是 render 行為，不是收信。
         * 它也刻意**不在** `lib/support-contact.ts` 的佔位值黑名單裡，否則會被
         * 當成未設定而測不到這個分支。
         *
         * `reuseExistingServer: true`：若 3010 已有別人起的 server，這個值不會生效。
         * 因此 `support-entry.spec.ts` 的瀏覽器斷言寫成「mailto 與『尚未設定』
         * 恰好出現一個」，兩種環境都成立；env 的分支正確性另由純函式測試涵蓋。
         */
        NEXT_PUBLIC_SUPPORT_EMAIL: "support@teaching-platform.test",
      },
    },
  ],
});
