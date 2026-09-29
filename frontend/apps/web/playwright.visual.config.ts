import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * **Canonical 視覺回歸**（L2，`UI-QA-VISUAL-BASELINE`，2026-09-29）——
 * `npm run test:visual`（在 `frontend/apps/web`，先跑過 `npm run verify:web`）。
 *
 * ## 拓撲
 *
 *   frontend `next start`（production build，`.next-verify`）:3111
 *     → backend `Backend/scripts/ui-review/serve.js`:3100（UI Review 四層 fail-closed 護欄）
 *     → `teaching_platform_ui_review`（deterministic fixture，`npm run ui-review:reset`）
 *
 * frontend 用 3111 而不是 UI Review dev 的 3110，兩者可以並存；backend 的 3100 由 `serve.js`
 * 寫死，本機若已有 UI Review backend 在跑則沿用（同一個資料庫、同一套護欄）。
 *
 * ## 基準只在 Linux 產生
 *
 * `snapshotPathTemplate` 帶 `{platform}`：canonical 基準是 `*-linux.png`，由 GitHub Actions
 * 的 `ui-quality.yml` `visual` job 產生並比對。Windows／macOS 上的截圖**不是**基準 ——
 * spec 預設在非 Linux 平台 skip；`-win32`／`-darwin` 檔已被 `.gitignore` 排除。
 *
 * ## 不自動更新基準
 *
 * `updateSnapshots: "none"`：缺基準或有差異一律失敗。只有顯式設定 `VISUAL_UPDATE=1`
 * （CI 的 `workflow_dispatch` 輸入 `update_visual_baselines`）才會重寫，且須人工審閱後才進版控。
 * 政策見 `docs/ui-quality-system.md` §3。
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const FRONTEND_PORT = 3111;
const BACKEND_URL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{platform}{ext}",
  fullyParallel: true,
  /* 本機與 CI 同為 2：截圖穩定度要在與 CI 相同的並行度下驗證。 */
  workers: 2,
  /* 刻意不重試：不穩定的截圖要讓它紅，而不是被重試蓋掉。 */
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  timeout: 120_000,
  updateSnapshots: process.env.VISUAL_UPDATE === "1" ? "all" : "none",
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      /*
       * 反鋸齒容忍：同一台 Linux runner 上的逐像素差異。任何有意義的版面／色彩／字級變化
       * 都遠大於此（0.2% 的像素）。
       */
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    browserName: "chromium",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    colorScheme: "light",
    deviceScaleFactor: 1,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium-visual" }],
  webServer: [
    {
      command: "node Backend/scripts/ui-review/serve.js",
      cwd: REPO_ROOT,
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npm run start -- --port ${FRONTEND_PORT}`,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || ".next-verify",
        API_BASE_URL: BACKEND_URL,
        /* 與 E2E harness 同一個 opt-in：production build 接 loopback backend（見 `lib/server-api-base-url.ts`）。 */
        E2E_ALLOW_LOOPBACK_API_BASE_URL: "1",
      },
    },
  ],
});
