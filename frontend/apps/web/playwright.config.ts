import { defineConfig, devices } from "@playwright/test";
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
 *   npm run build && E2E_SERVER=production npx playwright test
 */
const isProductionServer = process.env.E2E_SERVER === "production";

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
  webServer: {
    // production 需要先 `npm run build`；`next start` 不會自己編譯。
    command: isProductionServer ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180 * 1000,
  },
});
