import { expect, test } from "@playwright/test";
import { ADMIN_ROUTES } from "./helpers/routes";

test.describe("Admin Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tp_token", "e2e_admin_token");
      localStorage.setItem("tp_role", "admin");
      localStorage.setItem("tp_user_email", "admin-e2e@example.com");
    });
  });

  test("admin dashboard skeleton", async ({ page }) => {
    await page.goto("/admin");
    await test.step("dashboard widgets visible", async () => {
      await expect(page.locator("main, section")).toBeVisible();
      // TODO(assert): verify KPI cards render expected labels and values.
      // TODO(assert): verify recent order table renders at least one row.
    });
  });

  test("admin material/order/report/payment-proof pages skeleton", async ({ page }) => {
    const routes = ["/admin/materials", "/admin/orders", "/admin/reports", "/admin/payment-proofs"] as const;
    for (const route of routes) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page.locator("main, section")).toBeVisible();
      });
    }
    await test.step("admin list interactions TODOs", async () => {
      // TODO(assert): materials page links to material reports/activity logs.
      // TODO(assert): orders status filter updates list.
      // TODO(assert): reports mark-reviewed button updates row state.
      // TODO(assert): payment-proofs approve/reject action pathways.
    });
  });

  test("admin activity logs and detail skeleton", async ({ page }) => {
    await test.step("activity log list", async () => {
      await page.goto("/admin/activity-logs");
      await expect(page.locator("main, section")).toBeVisible();
      // TODO(assert): actor/action/target filters affect query and list.
      // TODO(assert): pagination controls move page correctly.
    });

    await test.step("activity log detail", async () => {
      await page.goto("/admin/activity-logs/log_mock_001");
      await expect(page.locator("main, section")).toBeVisible();
      // TODO(assert): metadata JSON block renders with expected keys.
      // TODO(assert): related links route to user/material/order logs.
    });
  });

  test("admin scoped activity/report pages skeleton", async ({ page }) => {
    const scopedRoutes = [
      "/admin/users/usr_mock_001/activity-logs",
      "/admin/orders/ord_mock_001/activity-logs",
      "/admin/materials/mat_mock_001/activity-logs",
      "/admin/materials/mat_mock_001/reports",
    ] as const;
    for (const route of scopedRoutes) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page.locator("main, section")).toBeVisible();
      });
    }
    await test.step("scoped page interactions TODOs", async () => {
      // TODO(assert): scoped pages only show records for provided ids.
      // TODO(assert): material reports source switch toggles between two APIs.
      // TODO(assert): mark-reviewed state updates and shows feedback.
    });
  });

  test("admin static pages skeleton", async ({ page }) => {
    const staticRoutes = ["/admin/users", "/admin/settings", "/admin/reviews-hub"] as const;
    for (const route of staticRoutes) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page.locator("main, section")).toBeVisible();
      });
    }
  });

  test("all admin routes reachable", async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
