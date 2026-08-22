import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { TEACHER_ROUTES } from "./helpers/routes";

test.describe("Teacher Pages", () => {
  // cookie + localStorage 都要設；只設 localStorage 會被 middleware 導向 /login，
  // 這些測試就會在登入頁上通過，實際上什麼都沒驗到。
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "teacher", { email: "teacher-e2e@example.com" });
  });

  test("teacher material list skeleton", async ({ page }) => {
    await page.goto("/teacher/materials");
    await test.step("list page visible", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      // 側欄捷徑與頁面 CTA 都叫「新增教材」（正常設計），因此限定在 main 內。
      await expect(page.getByRole("main").getByRole("link", { name: "新增教材" })).toBeVisible();
      // TODO(assert): verify status filter affects rows.
      // TODO(assert): verify pagination updates the list.
    });
  });

  test("teacher create material skeleton", async ({ page }) => {
    await page.goto("/teacher/materials/new");
    await test.step("form fields and required validation", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("button", { name: /建立教材|建立中/i })).toBeVisible();
      // TODO(assert): submit empty form and validate required errors.
      // TODO(assert): accept IP declaration gate before submit.
    });
  });

  test("teacher edit material skeleton", async ({ page }) => {
    // 這頁必須先成功取得教材才會渲染表單；沒有 mock 時只會看到 ErrorState。
    await page.route("**/api/backend/materials/mat_mock_001", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          id: "mat_mock_001",
          title: "示範教材",
          price: 199,
          status: "published",
          file_key: "files/demo.pdf",
          teaching_methods: ["遊戲活動"],
          material_features: ["PDF教材"],
          contents: [],
          detail_images: [],
        }),
      }),
    );
    await page.goto("/teacher/materials/mat_mock_001/edit");
    await test.step("edit form and save action", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("button", { name: /儲存變更|儲存中/i })).toBeVisible();
      // TODO(assert): mutate one field, save, and assert success message.
      // TODO(assert): mock 400/500 update response and assert fallback text.
    });
  });

  test("all teacher routes reachable", async ({ page }) => {
    // 多條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    for (const route of TEACHER_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        // `middleware.ts` 會把 legacy 的 /teacher/* 正規化成 /creator/*（308），這是刻意行為；
        // 斷言要接受正規化後的網址。
        const canonical = route.replace(/^\/teacher/, "/creator");
        await expect(page).toHaveURL(new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
