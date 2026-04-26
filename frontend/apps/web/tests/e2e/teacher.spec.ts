import { expect, test } from "@playwright/test";
import { TEACHER_ROUTES } from "./helpers/routes";

test.describe("Teacher Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tp_token", "e2e_teacher_token");
      localStorage.setItem("tp_role", "teacher");
      localStorage.setItem("tp_user_email", "teacher-e2e@example.com");
    });
  });

  test("teacher material list skeleton", async ({ page }) => {
    await page.goto("/teacher/materials");
    await test.step("list page visible", async () => {
      await expect(page.locator("main, section")).toBeVisible();
      await expect(page.getByRole("link", { name: "新增教材" })).toBeVisible();
      // TODO(assert): verify status filter affects rows.
      // TODO(assert): verify pagination updates the list.
    });
  });

  test("teacher create material skeleton", async ({ page }) => {
    await page.goto("/teacher/materials/new");
    await test.step("form fields and required validation", async () => {
      await expect(page.locator("main, section")).toBeVisible();
      await expect(page.getByRole("button", { name: /建立教材|建立中/i })).toBeVisible();
      // TODO(assert): submit empty form and validate required errors.
      // TODO(assert): accept IP declaration gate before submit.
    });
  });

  test("teacher edit material skeleton", async ({ page }) => {
    await page.goto("/teacher/materials/mat_mock_001/edit");
    await test.step("edit form and save action", async () => {
      await expect(page.locator("main, section")).toBeVisible();
      await expect(page.getByRole("button", { name: /儲存變更|儲存中/i })).toBeVisible();
      // TODO(assert): mutate one field, save, and assert success message.
      // TODO(assert): mock 400/500 update response and assert fallback text.
    });
  });

  test("all teacher routes reachable", async ({ page }) => {
    for (const route of TEACHER_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
