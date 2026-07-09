import { expect, test } from "@playwright/test";
import { PUBLIC_ROUTES } from "./helpers/routes";

test.describe("Public Pages", () => {
  test("home page redirects by role and shows entry links", async ({ page }) => {
    await test.step("guest sees homepage links", async () => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "教材列表" })).toBeVisible();
      await expect(page.getByRole("link", { name: "購物車" })).toBeVisible();
      // TODO(assert): also verify homepage hero copy and brand badge.
    });

    await test.step("teacher role auto-redirect check", async () => {
      await page.addInitScript(() => {
        localStorage.setItem("tp_token", "e2e_teacher_token");
        localStorage.setItem("tp_role", "teacher");
      });
      await page.goto("/");
      await expect(page).toHaveURL(/\/teacher\/materials/);
      // TODO(assert): verify parent role redirects to /materials as well.
    });
  });

  test("auth pages render validation surfaces", async ({ page }) => {
    await test.step("login page elements", async () => {
      await page.goto("/login");
      await expect(page.getByRole("button", { name: /登入|login/i })).toBeVisible();
      // TODO(assert): submit empty form and verify validation messages.
      // TODO(assert): mock 401 response and verify error banner.
    });

    await test.step("register page elements", async () => {
      await page.goto("/register");
      await expect(page.getByRole("button", { name: /註冊|register/i })).toBeVisible();
      // TODO(assert): submit invalid payload and verify field-level errors.
      // TODO(assert): mock success and assert redirect path.
    });
  });

  test("materials and detail pages render core functionality", async ({ page }) => {
    await test.step("materials list", async () => {
      await page.goto("/materials");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): verify card list count with mocked dataset.
      // TODO(assert): verify category/filter interaction.
    });

    await test.step("material detail and report entry", async () => {
      await page.goto("/materials/mat_mock_001");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): click add-to-cart and assert success feedback.
      // TODO(assert): submit report form and assert POST /reports behavior.
    });

    await test.step("material reviews", async () => {
      await page.goto("/materials/mat_mock_001/reviews");
      await expect(page.locator("main")).toBeVisible();
      // TODO(assert): validate rating summary values and review rows.
      // TODO(assert): check empty state by mocking empty response.
    });
  });

  test("seeded material detail page shows conversion-focused sections", async ({ page }) => {
    await page.goto("/materials/mat_detail_seed_1", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "主題圖卡：超市購物配對" })).toBeVisible();
    await expect(page.getByText("教材包含")).toBeVisible();
    await expect(page.getByText("📦 34 張圖卡")).toBeVisible();
    await expect(page.getByText("⏱ 約 2 堂課")).toBeVisible();
    await expect(page.getByText("👧 4-8 歲")).toBeVisible();
    await expect(page.getByText("🎲 配對遊戲 / 搶答活動")).toBeVisible();

    await expect(page.getByText("教材特色").first()).toBeVisible();
    await expect(page.getByText("配對遊戲").first()).toBeVisible();
    await expect(page.getByText("語言表達").first()).toBeVisible();

    await expect(page.getByRole("button", { name: "加入購物車" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "立即購買" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "查看全部回饋" }).first()).toBeVisible();

    await expect(page.getByText("創作者與家長回饋")).toBeVisible();
    await expect(page.getByText("依最新排序")).toBeVisible();
  });

  test("status pages are reachable", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route === "/" ? "/$" : route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
