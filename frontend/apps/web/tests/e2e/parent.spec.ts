import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";
import { PARENT_ROUTES } from "./helpers/routes";

/**
 * 購物車目前顯示的總金額。
 *
 * 金額字串在頁面多處出現（小計／總金額／手機底欄），因此必須指名其中一個；
 * 而且兩種版面**不一樣**：desktop 是側欄摘要的 `<dl>`（`lg:block`），
 * mobile 是固定底欄（`lg:hidden`）。`lg` 斷點為 1024。
 */
function totalAmount(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 0) < 1024;
  return isMobile
    ? page.locator("span").filter({ hasText: /^NT\$/ }).last()
    : page.getByRole("definition").filter({ hasText: /^NT\$/ }).last();
}

test.describe("Parent Flow Pages", () => {
  /*
   * 這裡原本只寫 localStorage。`middleware.ts` 讀的是 `tp_token` / `tp_role`
   * **cookie**，而 `PARENT_ROUTES` 全部落在 `LOGIN_REQUIRED_PREFIXES` 底下，
   * 於是每一頁都被導到 `/login?redirect=…`，測到的從來不是目標頁面
   * （失敗訊號就是 `locator("main")` 找不到 —— 當時登入頁沒有 `<main>`；
   * `COR-06` 之後 `/login` 也有了 landmark，但這裡要驗的仍是「有真的登入」）。
   * canonical 的做法是 `helpers/auth.ts` 的 `signInAs()`，cookie 與 localStorage 一起寫。
   */
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "parent");
    /*
     * Buyer 外殼會探 `orders/my`（`DX-04` 的 session 探測）。沒有 mock 時假 token
     * 會換回真 401，整組測試其實是在 `/login` 上跑 —— 而登入頁自 `COR-06` 起也有
     * `main` landmark，所以「main 可見」這種斷言會安靜地通過。
     */
    await installShellBootstrapMocks(page);
  });

  test("cart and checkout workflow skeleton", async ({ page }) => {
    await test.step("cart page visible", async () => {
      /*
       * 數量與勾選都是 client 端計算（`app/cart/page.tsx` 的 `subtotal`）。
       * 固定成兩筆單價明確的資料，金額才可預期：100 × 1 ＋ 250 × 1 = 350。
       */
      await page.route("**/api/backend/cart", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            items: [
              { id: "ci_a", material_id: "mat_a", title: "教材 A", quantity: 1, price: 100 },
              { id: "ci_b", material_id: "mat_b", title: "教材 B", quantity: 1, price: 250 },
            ],
          }),
        }),
      );
      await page.goto("/cart");
      await expect(page.getByRole("main")).toBeVisible();
      // 金額在小計／總金額／手機底欄都會出現，因此鎖定「總金額」那一項的值
      await expect(totalAmount(page)).toHaveText("NT$350");
    });

    await test.step("加減數量會改變小計", async () => {
      // 教材 A +1 → 100×2 + 250 = 450
      await page.getByRole("button", { name: "增加數量" }).first().click();
      await expect(totalAmount(page)).toHaveText("NT$450");

      // 再減回來 → 350
      await page.getByRole("button", { name: "減少數量" }).first().click();
      await expect(totalAmount(page)).toHaveText("NT$350");
    });

    await test.step("取消勾選會把該筆移出結帳金額", async () => {
      await page.getByLabel("選取 教材 B").uncheck();
      // 只剩教材 A：100
      await expect(totalAmount(page)).toHaveText("NT$100");
    });

    await test.step("checkout page visible", async () => {
      await page.goto("/checkout");
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 「結帳後導向上傳憑證」已由 `critical-acceptance.spec.ts` 的
       * 「ORDER | CI | 6) checkout creates order and redirects to upload-proof」覆蓋，
       * 這裡不重複測；下面補的是它沒測到的**空購物車分支**。
       */
    });

    await test.step("空購物車時說明原因，而不是給一顆按不動的送出鍵", async () => {
      await page.route("**/api/backend/cart", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ items: [] }),
        }),
      );
      await page.goto("/checkout", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("購物車目前是空的")).toBeVisible();
    });
  });

  test("orders and upload proof workflow skeleton", async ({ page }) => {
    await test.step("orders list page", async () => {
      await page.goto("/me/orders");
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 訂單狀態文案與金額已由 `buyer-order-progress.spec.ts` 的五支測試覆蓋
       * （審核中／審核未通過／已完成，以及退件原因與 CTA 的搭配）——
       * 那份是 `COR-01` 的 canonical regression，比這裡的 skeleton 強得多，不重複測。
       */
    });

    await test.step("upload-proof page", async () => {
      await page.goto("/orders/ord_mock_001/payment-proof");
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 送出成功的提示已由 `critical-acceptance.spec.ts`
       * 「ORDER | CI | 9) upload-proof submit success feedback」覆蓋。
       * 這裡補它沒測到的**client 端驗證**分支：一張都沒選就送出。
       */
      await page.getByRole("button", { name: /送出|上傳/ }).first().click();
      await expect(page.getByText("請至少上傳 1 張憑證圖片。")).toBeVisible();
    });
  });

  test("downloads and my-reviews skeleton", async ({ page }) => {
    await test.step("downloads page", async () => {
      await page.goto("/me/materials");
      await expect(page.getByRole("main")).toBeVisible();
    });

    await test.step("下載會去要 signed URL，取不到時說得出原因", async () => {
      /*
       * 原 TODO 寫「assert link appears」與「manual material id lookup」——
       * **兩個前提都已不成立**：signed URL 是用程式化的 anchor 直接觸發下載，
       * 畫面上不會留下連結；這一頁也沒有手動輸入 id 的控制項。因此不補假 UI，
       * 改為驗真正的契約：按鈕會去要 `download/<id>`，而失敗時要說得出原因。
       */
      await page.route("**/api/backend/me/materials", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            items: [
              {
                materialId: "mat_dl_1",
                title: "已購買教材",
                coverImageUrl: null,
                materialUpdatedAt: "2026-05-01T00:00:00Z",
                purchasedAt: "2026-04-20T00:00:00Z",
                authorName: "creator",
              },
            ],
          }),
        }),
      );
      const downloadCalls: string[] = [];
      await page.route("**/api/backend/download/**", (route) => {
        downloadCalls.push(new URL(route.request().url()).pathname);
        // 沒有 signedUrl → UI 必須顯示可讀的失敗訊息，而不是靜默
        return route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({}),
        });
      });

      await page.goto("/me/materials", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "下載教材" }).first().click();

      await expect(page.getByText("下載連結取得失敗，請稍後再試。")).toBeVisible();
      expect(downloadCalls.some((p) => p.includes("mat_dl_1"))).toBe(true);
    });

    await test.step("my-reviews page", async () => {
      await page.goto("/my-reviews");
      await expect(page.getByRole("main")).toBeVisible();
    });

    await test.step("沒有回饋時顯示空狀態，並指出下一步", async () => {
      await page.route("**/api/backend/me/reviews", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ items: [] }),
        }),
      );
      await page.goto("/my-reviews");
      await expect(page.getByText("尚無教學回饋")).toBeVisible();
      await expect(page.getByText("前往我的教材即可為已購買的教材分享教學回饋。")).toBeVisible();
    });
  });

  test("all parent routes reachable", async ({ page }) => {
    for (const route of PARENT_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
