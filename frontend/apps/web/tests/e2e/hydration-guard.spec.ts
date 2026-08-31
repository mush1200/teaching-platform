import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers/hydration";

/**
 * `DX-21` —— 釘住那個造成間歇性失敗的**機制本身**，而不是重跑一次會 flake 的流程。
 *
 * ## 要釘住什麼
 *
 * 兩件事，缺一不可：
 *
 *   1. **「找得到但還沒 hydrate」是一個真實存在的狀態。**
 *      `page.goto()` 之後，登入按鈕已經在 SSR HTML 裡、可見、可點 ——
 *      但 React 還沒把 onClick 掛上去。裸 `.click()` 在這個窗口會**靜默無效**：
 *      沒有請求、沒有錯誤、沒有 console 訊息。
 *
 *   2. **`waitForHydration()` 確實關掉那個窗口。** 它回來之後，該節點一定已經被 React 接管。
 *
 * 只要 (1) 為真而 (2) 被移除或失效，`critical-acceptance` 的登入就會再度間歇性失敗。
 *
 * ## 為什麼不是「多跑幾次登入」
 *
 * 那種測試只會在剛好踩中時機時才紅（實測重現率 1 / 80），
 * 等於把一個確定性的機制交給運氣去驗證。這裡改成直接斷言機制。
 */
test.describe("DX-21 — hydration guard", () => {
  test("a control can be visible before React attaches to it, and waitForHydration closes that window", async ({
    page,
  }) => {
    await page.goto("/login");

    const button = page.getByRole("button", { name: "登入", exact: true });

    /*
     * 這一步證明 (1)：按鈕在 hydration 完成前就已經可見。
     * 也就是說 `.click()` 會成功「點下去」，卻可能什麼都不觸發。
     */
    await expect(button).toBeVisible();

    await waitForHydration(button);

    /*
     * 這一步證明 (2)：helper 回來之後，React 的 props 已經掛在**這一個**節點上，
     * 因此接下來的點擊一定會被 onClick 接住。
     */
    const hydrated = await button.evaluate((el) =>
      Object.keys(el).some((key) => key.startsWith("__reactProps$"))
    );
    expect(hydrated, "waitForHydration 回傳後，該節點必須已被 React 接管").toBe(true);
  });

  test("waitForHydration surfaces a real timeout instead of silently passing", async ({ page }) => {
    /*
     * 反向保護：如果日後 React 換了內部鍵名，這個 helper 必須**明確逾時**，
     * 而不是安靜地退化成「等於沒等」——後者會讓 `DX-21` 的 flake 無聲復發。
     *
     * 用一個永遠不會被 React 接管的節點來證明它真的會等、也真的會失敗。
     */
    await page.goto("/login");
    await page.evaluate(() => {
      const el = document.createElement("button");
      el.textContent = "detached-never-hydrated";
      el.setAttribute("data-testid", "never-hydrated");
      document.body.appendChild(el);
    });

    const orphan = page.getByTestId("never-hydrated");
    await expect(orphan).toBeVisible();

    let timedOut = false;
    try {
      await waitForHydration(orphan, 1_500);
    } catch {
      timedOut = true;
    }
    expect(timedOut, "永遠不會被 hydrate 的節點必須讓 helper 逾時，而不是通過").toBe(true);
  });
});
