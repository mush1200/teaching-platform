import { expect, type Locator } from "@playwright/test";

/**
 * `DX-21` —— 等待某個控制項**真的被 React 接上事件處理器**之後再互動。
 *
 * ## 為什麼需要這個
 *
 * `page.goto()` 在 `load` 就 resolve，但 Next 的 client bundle 要更晚才完成 hydration。
 * 在這段空窗裡，SSR 產出的 DOM **已經存在且可見**，於是：
 *
 * ```text
 * locator.click()  → Playwright 找得到按鈕、點得下去、回報成功
 *                  → 但按鈕上還沒有 React 的 onClick
 *                  → 什麼事都沒發生，而且不會有任何錯誤
 * ```
 *
 * 這種失敗**沒有例外、沒有 console error、沒有網路請求** ——
 * 它只會表現成「後面那條斷言等不到預期的結果」，看起來像產品壞了。
 *
 * ## 這不是臆測，是實測出來的
 *
 * `DX-21` 以 instrumented probe 在平行負載下重現 1 / 80，捕捉到的狀態是：
 *
 * ```text
 * loginRequests: 0          ← 連請求都沒發出
 * loginResponseStatus: null
 * roleCookie: null
 * localStorageRole: null
 * successBannerVisible: 0
 * consoleErrors: []         ← 完全無聲
 * ```
 *
 * 並另以探針確認同一顆按鈕在 `goto` 之後確實會經歷
 * `{found: true, hydrated: false}` → `{found: true, hydrated: true}` 兩個階段。
 *
 * ## 為什麼用 `__reactProps$` 而不是等時間
 *
 * 決定「這次點擊會不會有效」的，正是 React 有沒有把 props 掛到**這一個** DOM 節點上。
 * 因此這裡直接等那件事本身，而不是等一個猜出來的毫秒數 ——
 * 沒有 `waitForTimeout`、沒有 retry、沒有放寬 timeout，也不會在快的機器上白等。
 *
 * `__reactProps$…` 是 React 18 的內部鍵，這一點在此是**優點**：
 * 它就是 hydration 是否完成的直接證據。若日後升級 React 導致鍵名改變，
 * 這個 helper 會超時並明確指出原因，而不是靜默退化成舊的間歇性失敗。
 */
export async function waitForHydration(locator: Locator, timeout = 15_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout });

  const handle = await locator.elementHandle({ timeout });
  try {
    await locator.page().waitForFunction(
      (el) => !!el && Object.keys(el).some((key) => key.startsWith("__reactProps$")),
      handle,
      { timeout }
    );
  } finally {
    await handle?.dispose();
  }
}

/**
 * 等 hydration 完成之後再點。
 *
 * **這不是 retry** —— 它不會重送業務動作，只是把「點擊」延到那個點擊真的會被接住的時刻。
 * 失敗仍然照常失敗。
 */
export async function clickWhenHydrated(locator: Locator, timeout = 15_000): Promise<void> {
  await waitForHydration(locator, timeout);
  await locator.click({ timeout });
}
