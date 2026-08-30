import { expect, test, type Page } from "@playwright/test";
import { installCoreApiMocks } from "./helpers/mock-api";
import { getTestCookieUrl } from "./helpers/base-url";

/*
 * `P1-07` 回歸：結帳流程中**任何擋住使用者繼續的原因，都必須在他目前所在的 step 看得見**。
 *
 * 修復前，`msg` 這個共用 state 只在 `step === 3` 的區塊裡被渲染，但寫入它的地方遍布
 * 三個 step（Step 1 必填驗證、優惠碼、`placeOrder()` 的前置檢查）。
 * 於是在 Step 1 按「下一步」而驗證不通過時，畫面**完全沒有反應** ——
 * 訊息被設好了，只是沒有任何地方顯示它。那是購買漏斗第一關的無聲死路。
 *
 * 這支 spec 鎖的是「看得見」這件事本身，不是特定文案。
 */

const CART = [
  {
    id: "cart_1",
    materialId: "mat_demo_1",
    title: "小學數學思維訓練",
    ageLabel: "適合 6–12 歲",
    price: 299,
    quantity: 1,
    coverGradient: "from-violet-200 to-indigo-100",
  },
];

async function signInAsBuyer(page: Page) {
  const cookieUrl = getTestCookieUrl();
  await page.context().addCookies([
    { name: "tp_token", value: "e2e-parent-token", url: cookieUrl },
    { name: "tp_role", value: "parent", url: cookieUrl },
  ]);
  await page.addInitScript(
    ({ cart }) => {
      localStorage.setItem("tp_token", "e2e-parent-token");
      localStorage.setItem("tp_role", "parent");
      localStorage.setItem("tp_user_email", "parent@example.com");
      localStorage.setItem(`tp_mock_cart_items_v1:parent@example.com`, JSON.stringify(cart));
    },
    { cart: CART },
  );
}

test.describe("Checkout feedback is visible on the step that produced it (P1-07)", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreApiMocks(page);
    await signInAsBuyer(page);
  });

  test("Step 1: a blocked 下一步 explains itself and keeps the user on Step 1", async ({ page }) => {
    await page.goto("/checkout");

    // 什麼都不填就前進
    await page.getByRole("button", { name: "下一步" }).click();

    const feedback = page.getByTestId("checkout-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toHaveAttribute("role", "alert");
    // 停在 Step 1，不得靜默前進
    await expect(page.getByText("Step 1 帳單資訊")).toBeVisible();

    // 修正一部分之後，訊息要跟著換成下一個真正的問題，而不是停在舊的
    await page.getByLabel("姓名").fill("測試買家");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "下一步" }).click();
    await expect(feedback).toBeVisible();
    await expect(page.getByText("Step 1 帳單資訊")).toBeVisible();

    // 全部修好 → 前進，且訊息**消失**（不得把已修好的問題帶到下一步）
    await page.getByLabel("Email").fill("buyer@example.com");
    await page.getByRole("button", { name: "下一步" }).click();
    await expect(page.getByText("Step 2 付款方式")).toBeVisible();
    await expect(page.getByTestId("checkout-feedback")).toHaveCount(0);
  });

  test("Step 2: an unusable payment account blocks the step and says why, without creating an order", async ({
    page,
  }) => {
    /*
     * 收款帳戶未設定（`P1-01` 的 fail-safe）。人工轉帳是唯一金流方式，
     * 沒有匯款目標就沒有任何能完成的付款路徑 —— 讓訂單先成立只會製造
     * 一張沒人能結掉的 `pending_payment`。
     */
    await page.route("**/api/backend/payment/bank-info", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ configured: false }),
      }),
    );

    let orderAttempted = false;
    await page.route("**/api/backend/orders", (route) => {
      if (route.request().method() === "POST") orderAttempted = true;
      return route.fallback();
    });

    await page.goto("/checkout");
    await page.getByLabel("姓名").fill("測試買家");
    await page.getByLabel("Email").fill("buyer@example.com");
    await page.getByRole("button", { name: "下一步" }).click();

    await expect(page.getByText("Step 2 付款方式")).toBeVisible();
    // 原因看得見，而不是只有一顆變灰的按鈕
    await expect(page.getByTestId("checkout-step2-blocked")).toBeVisible();
    await expect(page.getByTestId("bank-info-unavailable")).toBeVisible();
    // 停在 Step 2
    await expect(page.getByRole("button", { name: "下一步" })).toBeDisabled();
    await expect(page.getByText("Step 3 審核確認")).toHaveCount(0);
    expect(orderAttempted).toBe(false);
  });

  test("Step 3: a failed order creation still surfaces its reason", async ({ page }) => {
    await page.route("**/api/backend/orders", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 409,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ message: "此教材目前沒有可供下載的教材檔案，已暫停販售。" }),
      });
    });

    await page.goto("/checkout");
    await page.getByLabel("姓名").fill("測試買家");
    await page.getByLabel("Email").fill("buyer@example.com");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    await expect(page.getByText("Step 3 審核確認")).toBeVisible();

    await page.getByRole("button", { name: /確認送出訂單/ }).first().click();

    const feedback = page.getByTestId("checkout-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("暫停販售");
    // 失敗不得把使用者送走
    await expect(page).toHaveURL(/\/checkout/);
  });
});
