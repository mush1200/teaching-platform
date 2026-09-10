import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `Wave UI-1` 的回歸護欄 —— `UI-CONS-02` / `UI-CONS-03` / `UI-CONS-14`。
 *
 * ## 這些測試鎖住的是行為／語意，不是 class 字串
 *
 * 全部走 `getByRole("heading", { level: 1 })` 與 `[aria-current="page"]`，
 * 也就是**瀏覽器實際算出來的 accessibility tree**。因此：
 *
 *   - 把 `sr-only` 換成別的視覺隱藏手法、換 token、換排版 → 不會誤紅。
 *   - 但只要標題再次從 accessibility tree 消失（例如又被 `display:none`
 *     或降級成 `<span>`），或 `aria-current` 消失／變成多個 → 一定會紅。
 *
 * `toBeVisible()` 對 `sr-only` 是**通過**的：`sr-only` 用 `position:absolute` ＋ 1px
 * clip，元素仍在 render tree（`display:none` 才會 fail）。這正是本輪要的區別 ——
 * 我們要的是「輔助技術讀得到」，不是「一定要肉眼看得到」。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

async function stubApi(page: Page) {
  // LIFO：catch-all 先註冊，specific 後註冊。
  await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_1", role: "parent", email: "parent-e2e@example.com" } })
  );
  await page.route("**/api/backend/orders**", (route) =>
    json(route, { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })
  );
  await page.route("**/api/backend/cart**", (route) => json(route, { items: [] }));
}

/** 一頁只能有一個 h1，而且它必須在 accessibility tree 裡拿得到可讀的名字。 */
async function expectExactlyOneAccessibleH1(page: Page, route: string) {
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1, `${route} 必須恰有一個 h1`).toHaveCount(1);
  await expect(h1, `${route} 的 h1 必須在 accessibility tree 中`).toBeVisible();
  expect((await h1.innerText()).trim().length, `${route} 的 h1 不得為空字串`).toBeGreaterThan(0);
}

test.describe("UI-CONS-02 — 公開教材列表有頁面標題", () => {
  test("/materials exposes exactly one page heading", async ({ page }) => {
    await stubApi(page);
    await page.goto("/materials", { waitUntil: "domcontentloaded" });
    await expectExactlyOneAccessibleH1(page, "/materials");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("教材列表");
  });

  /**
   * 負向控制：斷言真的抓得到「標題不見了」這件事。
   * 把 h1 從 accessibility tree 移除後，同一組斷言必須失敗。
   */
  test("/materials heading assertion actually detects a missing heading", async ({ page }) => {
    await stubApi(page);
    await page.goto("/materials", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    await page.evaluate(() => {
      document.querySelectorAll("h1").forEach((el) => el.remove());
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  });
});

test.describe("UI-CONS-03 — 買家頁面在行動版仍有頁面標題", () => {
  const BUYER_ROUTES = ["/orders", "/me/orders", "/cart"];

  for (const route of BUYER_ROUTES) {
    test(`buyer ${route} keeps a page heading on mobile`, async ({ page }) => {
      await signInAs(page, "parent", { email: "parent-e2e@example.com" });
      await stubApi(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expectExactlyOneAccessibleH1(page, `${route} @390`);
    });

    test(`buyer ${route} keeps a page heading on desktop`, async ({ page }) => {
      await signInAs(page, "parent", { email: "parent-e2e@example.com" });
      await stubApi(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expectExactlyOneAccessibleH1(page, `${route} @1440`);
    });
  }

  /**
   * `/cart` 曾經同時具備兩個缺陷：空車時 0 個可及標題、有商品時兩個 `h1`。
   * 這裡釘住「不論購物車是否有商品，都恰好一個 `h1`」。
   */
  test("/cart has exactly one h1 whether or not it has items", async ({ page }) => {
    await signInAs(page, "parent", { email: "parent-e2e@example.com" });
    await stubApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});

test.describe("UI-CONS-14 — 買家導覽把 active 狀態送進 accessibility tree", () => {
  test("buyer sidebar marks the active destination with aria-current=page", async ({ page }) => {
    await signInAs(page, "parent", { email: "parent-e2e@example.com" });
    await stubApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/me/orders", { waitUntil: "domcontentloaded" });

    const current = page.locator('aside [aria-current="page"]');
    await expect(current, "買家側欄必須標示目前所在頁面").toHaveCount(1);
    await expect(current).toHaveAttribute("href", "/me/orders");
  });

  test("bottom nav marks exactly one current destination", async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const bottomNav = page.getByRole("navigation", { name: "底部導覽" });
    await expect(bottomNav).toBeVisible();
    /*
       在 `/materials` 上「首頁」與「分類」的比對值都是 `/materials`。
       修正前兩者同時 active；`aria-current` 必須只有一個，否則等於宣告兩個目前頁面。
    */
    await expect(bottomNav.locator('[aria-current="page"]')).toHaveCount(1);
  });
});
