import { expect, test } from "@playwright/test";
import { PARENT_ROUTES } from "./helpers/routes";

test.describe("Parent Flow Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tp_token", "e2e_parent_token");
      localStorage.setItem("tp_role", "parent");
      localStorage.setItem("tp_user_email", "parent-e2e@example.com");
    });
  });

  test("cart and checkout workflow skeleton", async ({ page }) => {
    await test.step("cart page visible", async () => {
      await page.goto("/cart");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): quantity increase/decrease updates subtotal.
      // TODO(assert): selecting items updates checkout amount.
    });

    await test.step("checkout page visible", async () => {
      await page.goto("/checkout");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): click checkout and assert redirect to upload-proof.
      // TODO(assert): verify empty cart message path.
    });
  });

  test("orders and upload proof workflow skeleton", async ({ page }) => {
    await test.step("orders list page", async () => {
      await page.goto("/me/orders");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): verify order status text and amount formatting.
    });

    await test.step("upload-proof page", async () => {
      await page.goto("/orders/ord_mock_001/payment-proof");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): submit proof url/file and validate success prompt.
      // TODO(assert): mock API 400 and assert readable error.
    });
  });

  test("downloads and my-reviews skeleton", async ({ page }) => {
    await test.step("downloads page", async () => {
      await page.goto("/me/materials");
      await expect(page.locator("main, section")).toBeVisible();
      // TODO(assert): request signed URL and assert link appears.
      // TODO(assert): manual material id lookup shows response.
    });

    await test.step("my-reviews page", async () => {
      await page.goto("/my-reviews");
      await expect(page.locator("main, section")).toBeVisible();
      // TODO(assert): verify review card fields and material detail link.
      // TODO(assert): mock empty list and assert empty state.
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
