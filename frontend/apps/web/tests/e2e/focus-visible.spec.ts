import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * `A11Y-01` —— keyboard focus 可辨識性的回歸護欄。
 *
 * ## 這支測試證明什麼
 *
 * 兩件**行為**層面的事，不是 class 字串：
 *
 *   1. 用鍵盤走到某個控制項時，**畫得出來的焦點指示存在**（outline 有實際寬度）。
 *   2. 用滑鼠點同一個控制項時，**不會留下多餘的持久焦點框**。
 *
 * ## 為什麼不斷言 Tailwind class
 *
 * `expect(className).toContain("focus-visible:ring-2")` 這種寫法在 token 改名的當下就會紅，
 * 但它**從來沒有真的驗證過使用者看不看得見焦點** —— 它只證明字串還在。
 * 這裡改讀 `getComputedStyle` 的實際 outline 寬度：換 token、換顏色、
 * 從 `ring` 改成 `outline` 都不會弄壞它，而「焦點指示消失」則一定會被抓到。
 *
 * ## 為什麼一定要用真的 Tab，而不是 `locator.focus()`
 *
 * `:focus-visible` 由**瀏覽器的 modality heuristic** 決定，而 `element.focus()` 是
 * 程式化聚焦 —— 它不會把瀏覽器切到 keyboard modality，因此對 `<button>` 這類控制項
 * 不保證觸發 `:focus-visible`。用 `locator.focus()` 寫出來的測試會在「焦點指示其實壞了」
 * 的情況下照樣通過。所以這裡一律送出真正的 `Tab` 鍵，讓瀏覽器自己判斷。
 *
 * ## 涵蓋範圍
 *
 * `/materials` 是**公開**路由，且同時渲染本輪改動的三個控制項
 * （`ExplorePage` 的「篩選」按鈕、`SortDropdown`、`AgeFilter` 的排序 select），
 * 因此不需要登入或 API mock 就能同時覆蓋「page-level 自訂控制項」與「原生 select」。
 */

/** 讀出實際畫出來的 outline 寬度（px）。`outline-style: none` 或 0 代表沒有可見的焦點指示。 */
async function outlineWidthPx(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    if (style.outlineStyle === "none") return 0;
    return Number.parseFloat(style.outlineWidth) || 0;
  });
}

/**
 * 送出真正的 `Tab` 直到目標拿到焦點。
 *
 * 回傳是否成功 —— 呼叫端負責斷言，這樣失敗訊息才會落在有意義的那一行。
 */
async function tabUntilFocused(page: Page, target: Locator, maxTabs = 40): Promise<boolean> {
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return true;
  }
  return false;
}

test.describe("A11Y-01 — keyboard focus stays perceptible", () => {
  test("keyboard focus paints a visible outline on a page-level control", async ({ page }) => {
    await page.goto("/materials");

    const button = page.getByRole("button", { name: "篩選" }).first();
    await expect(button).toBeVisible();

    // 從頁面起點開始送出真正的 Tab，讓瀏覽器進入 keyboard modality。
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    expect(await tabUntilFocused(page, button), "Tab 應能走到「篩選」按鈕").toBe(true);
    await expect(button).toBeFocused();

    expect(
      await outlineWidthPx(button),
      "以鍵盤聚焦的控制項必須畫出可見的 outline"
    ).toBeGreaterThan(0);
  });

  /**
   * 指標操作**必須是這一輪測試中的第一次互動**，而且要在自己的 test（＝自己的 page）裡。
   *
   * Chrome 的 `:focus-visible` modality 是**有黏性**的：一旦使用者用過鍵盤，
   * 之後的點擊仍可能被判定為 focus-visible。把指標情境和鍵盤情境寫在同一個 page 裡，
   * 測到的就不是「滑鼠使用者看到什麼」，而是「先用鍵盤再用滑鼠的人看到什麼」。
   * （2026-08-30 實測：同一頁先 Tab 再 click → outline 2px；全新頁面純點擊 → outline 0，
   * `matches(":focus-visible")` 為 false。產品行為是對的，先前的寫法才是錯的。）
   */
  test("a pointer click leaves no keyboard focus ring behind", async ({ page }) => {
    await page.goto("/materials");

    const button = page.getByRole("button", { name: "篩選" }).first();
    await expect(button).toBeVisible();

    await button.click();

    // 點擊後按鈕仍是 `document.activeElement`（這是正確的、也是必要的）……
    await expect(button).toBeFocused();
    // ……但 `:focus-visible` 不該成立：使用者是用指標操作的，不需要鍵盤導航指示。
    expect(
      await outlineWidthPx(button),
      "以指標點擊的控制項不應留下鍵盤焦點框"
    ).toBe(0);
  });

  test("the sort select keeps a perceptible keyboard focus indicator", async ({ page }) => {
    await page.goto("/materials");

    /*
     * `SortDropdown` 是原生 `<select>`，本輪與按鈕一起收斂。
     * 原生控制項最容易出事的寫法是「`outline-none` 之後沒有補任何替代指示」——
     * 這一條就是釘住那件事不再發生。
     *
     * **這裡刻意沒有對應的「點擊後不該有框」斷言。** `<select>` 與文字輸入框一樣，
     * 是「接下來就要用鍵盤操作」的 widget，因此瀏覽器在**點擊時也會**讓 `:focus-visible` 成立
     * （2026-08-30 實測：純點擊 select → outline 2px）。那是規範行為，不是缺陷；
     * 對它斷言「點擊後沒有框」等於把測試寫成與瀏覽器規範相反。
     */
    const select = page.getByRole("combobox", { name: "排序" }).first();
    await expect(select).toBeVisible();

    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    expect(await tabUntilFocused(page, select), "Tab 應能走到排序 select").toBe(true);
    await expect(select).toBeFocused();

    expect(
      await outlineWidthPx(select),
      "以鍵盤聚焦的 select 必須畫出可見的 outline"
    ).toBeGreaterThan(0);
  });
});
