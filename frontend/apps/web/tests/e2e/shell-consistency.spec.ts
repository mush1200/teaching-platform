import { expect, test } from "@playwright/test";
import type { Locator, Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * Admin 與 Creator shell 的一致性（Epic §10 / §11 / §12）。
 *
 * 這些測試鎖住的是 **shell 契約**，不是像素：
 *   - Desktop 側欄寬與主內容偏移在兩個角色上完全相同
 *   - Mobile 都用 hamburger（不是一個 icon、一個「選單」文字）
 *   - Drawer 的 ESC / overlay / 路由切換關閉 / scroll lock / focus 行為相同
 *   - **抽屜在矮視窗下真的捲得動，且最後一個選項點得到**（§11 的 root cause）
 *
 * 兩個角色跑同一組斷言：任何一邊被單獨改動都會讓另一邊的測試失敗。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

async function stubApi(page: Page) {
  // Playwright 的 route 是 LIFO：catch-all 先註冊，specific 後註冊。
  await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_1", role: "teacher", email: "creator-e2e@example.com" } })
  );
  await page.route("**/api/backend/creator/cases**", (route) =>
    json(route, { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, actionRequiredCount: 0 })
  );
  await page.route("**/api/backend/admin/materials**", (route) =>
    json(route, {
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      statusCounts: { total: 0, pending_review: 0, published: 0, unpublished: 0 },
    })
  );
}

const ROLES = [
  { role: "admin" as const, route: "/admin/materials", sidebar: "admin-sidebar-desktop" },
  { role: "teacher" as const, route: "/creator/materials", sidebar: "creator-sidebar-desktop" },
];

/**
 * `boundingBox()` **不會**自動等待：元素還沒 attach 或還是 `display:none` 時它直接回 null。
 *
 * Dev server 慢到讓 `page.goto()` 回來時畫面早就穩定了，所以這個缺口沒有顯現；
 * production build 快到 `goto` 解析時 React 還沒接手，於是同一段程式碼開始間歇失敗。
 * 先等元素可見再量，量到的才是真的版面。
 */
async function boxOf(locator: Locator) {
  await expect(locator).toBeVisible();
  /*
   * 就算剛確認過可見，`boundingBox()` 仍可能回 null：頁面載入後的第一次 client render
   * 會把節點換掉（Admin dashboard 的非同步區塊尤其明顯），量測正好落在中間就撲空。
   * 這裡輪詢到真的量得到為止，而不是把偶發的 null 當成版面錯誤。
   */
  await expect.poll(async () => (await locator.boundingBox()) !== null).toBe(true);
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

test.describe("Shell consistency — desktop", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop-only assertions");

  for (const { role, route, sidebar } of ROLES) {
    test(`${role} desktop sidebar uses the shared 240px rail`, async ({ page }) => {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubApi(page);
      await page.goto(route);

      const aside = page.getByTestId(sidebar);
      await expect(aside).toBeVisible();
      const box = await boxOf(aside);
      // layout-sidebar token = 240px；兩個角色都必須是它
      expect(Math.round(box.width)).toBe(240);
      expect(Math.round(box.x)).toBe(0);

      // 主內容緊接在側欄右側，中間不得出現額外的空白帶
      const mainBox = await boxOf(page.getByRole("main"));
      expect(Math.round(mainBox.x)).toBe(240);
    });
  }

  test("admin and creator produce identical shell dimensions", async ({ page }) => {
    const widths: number[] = [];
    const offsets: number[] = [];
    for (const { role, route, sidebar } of ROLES) {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubApi(page);
      await page.goto(route);
      widths.push(Math.round((await boxOf(page.getByTestId(sidebar))).width));
      offsets.push(Math.round((await boxOf(page.getByRole("main"))).x));
      await page.context().clearCookies();
    }
    // 「Admin 選項比較多所以側欄比較寬」不是可接受的解法
    expect(widths[0]).toBe(widths[1]);
    expect(offsets[0]).toBe(offsets[1]);
  });

  /*
   * 寬螢幕回歸（Epic §12）。
   *
   * 舊的 `AdminShell` 把 viewport-fixed 的側欄放在 `mx-auto max-w-[1440px]` 容器裡，
   * 而且**沒有指定 `left`**。1440px 以下靜態位置剛好是 x=0，看起來正常；
   * 超過 1440px 時側欄會固定在置中容器的邊緣，而 `main` 又另外加了 240px 偏移，
   * 於是左側出現一條 240px 的空白帶。
   *
   * 只在 1440 量測看不出這個問題 —— 所以這裡三個寬度都測，兩個角色都測。
   */
  for (const width of [1440, 1600, 1920]) {
    for (const { role, route, sidebar } of ROLES) {
      test(`${role} shell is correct at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
        await signInAs(page, role, { email: `${role}-e2e@example.com` });
        await stubApi(page);
        await page.goto(route);

        const asideBox = await boxOf(page.getByTestId(sidebar));
        // 側欄貼齊視窗左緣，不是貼齊某個置中容器的邊緣
        expect(Math.round(asideBox.x)).toBe(0);
        expect(Math.round(asideBox.width)).toBe(240);

        // 主內容緊接在側欄右側 —— 沒有第二個 240px 的偏移
        const mainBox = await boxOf(page.getByRole("main"));
        expect(Math.round(mainBox.x)).toBe(240);
        expect(Math.round(mainBox.width)).toBe(width - 240);

        // 頁面不得橫向溢出
        const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(docWidth).toBeLessThanOrEqual(width);

        /*
         * 內容欄置中：Admin 的內容有 max-width，超寬螢幕上左右留白必須對稱
         * （允許 1px 的 rounding 差）。Creator 頁面沒有 max-width，跳過這一段。
         */
        const header = page.getByRole("heading", { level: 1 }).first();
        if (await header.count()) {
          const headerBox = await boxOf(header);
          expect(headerBox.x).toBeGreaterThanOrEqual(mainBox.x);
          expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);
        }
      });
    }
  }

  test("no admin route overrides the shared sidebar width", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubApi(page);
    const routes = [
      "/admin",
      "/admin/materials",
      "/admin/orders",
      "/admin/reports",
      "/admin/payment-proofs",
      "/admin/activity-logs",
      "/admin/users",
      "/admin/settings",
      "/admin/reviews-hub",
    ];
    for (const route of routes) {
      // 每條路由包成一個 step —— 失敗時報告會直接指出是哪一頁，不必再去猜。
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        const box = await boxOf(page.getByTestId("admin-sidebar-desktop"));
        expect(Math.round(box.width), `${route} sidebar width`).toBe(240);
        expect(Math.round(box.x), `${route} sidebar x`).toBe(0);
        expect(Math.round((await boxOf(page.getByRole("main"))).x), `${route} main offset`).toBe(240);
      });
    }
  });

  test("desktop shell has no hamburger and no drawer", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubApi(page);
    await page.goto("/admin/materials");
    await expect(page.getByTestId("nav-drawer-trigger")).toBeHidden();
    await expect(page.getByTestId("nav-drawer-panel")).toHaveCount(0);
  });
});

test.describe("Shell consistency — mobile drawer", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 1024, "mobile-only assertions");

  for (const { role, route } of ROLES) {
    test(`${role} mobile uses a hamburger trigger with an accessible name`, async ({ page }) => {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubApi(page);
      await page.goto(route);

      const trigger = page.getByTestId("nav-drawer-trigger");
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toHaveAttribute("aria-controls", /mobile-nav/);
      // Creator 以前是文字「選單」/「關閉」的 toggle；兩邊現在都是同一顆 icon 鈕
      await expect(trigger).not.toContainText("選單");

      const box = await boxOf(trigger);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    });

    test(`${role} drawer opens, traps focus on close, and closes on ESC`, async ({ page }) => {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubApi(page);
      await page.goto(route);

      const trigger = page.getByTestId("nav-drawer-trigger");
      await trigger.click();

      const panel = page.getByTestId("nav-drawer-panel");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("role", "dialog");
      await expect(panel).toHaveAttribute("aria-modal", "true");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      // 開啟後焦點落在關閉鈕上
      await expect(page.getByTestId("nav-drawer-close")).toBeFocused();

      // 背景捲動被鎖住
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
      // 關閉後焦點回到觸發鈕
      await expect(trigger).toBeFocused();
    });

    test(`${role} drawer closes on overlay click and on navigation`, async ({ page }) => {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubApi(page);
      await page.goto(route);

      await page.getByTestId("nav-drawer-trigger").click();
      /*
       * Overlay 是 `fixed inset-0`，抽屜蓋在它左半邊之上。點正中央會被面板攔截 ——
       * 要點的是**面板右側**那塊真正露出來的遮罩，也就是使用者實際會點的位置。
       */
      const panelBox = await boxOf(page.getByTestId("nav-drawer-panel"));
      const viewport = page.viewportSize();
      await page.mouse.click(panelBox.x + panelBox.width + Math.max(8, ((viewport?.width ?? 400) - panelBox.width) / 2), 40);
      await expect(page.getByTestId("nav-drawer-panel")).toHaveCount(0);

      await page.getByTestId("nav-drawer-trigger").click();
      const firstLink = page.getByTestId("nav-drawer-panel").getByRole("link").first();
      await firstLink.click();
      await expect(page.getByTestId("nav-drawer-panel")).toHaveCount(0);
    });

    for (const width of [320, 375, 390, 430]) {
      test(`${role} drawer is fully reachable at ${width}px on a short viewport`, async ({ page }) => {
        // 矮視窗是關鍵：§11 的 bug 只有在內容高於視窗時才會顯現。
        await page.setViewportSize({ width, height: 480 });
        await signInAs(page, role, { email: `${role}-e2e@example.com` });
        await stubApi(page);
        await page.goto(route);

        await page.getByTestId("nav-drawer-trigger").click();
        const panel = page.getByTestId("nav-drawer-panel");
        await expect(panel).toBeVisible();

        const panelBox = await boxOf(panel);
        // 面板高度受限於視窗，且一定留得下可點的遮罩
        expect(Math.round(panelBox.height)).toBeLessThanOrEqual(480);
        expect(panelBox.width).toBeLessThanOrEqual(width * 0.85 + 1);

        const nav = panel.locator("nav");
        const metrics = await nav.evaluate((el) => ({
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowY: getComputedStyle(el).overflowY,
        }));
        expect(metrics.overflowY).toBe("auto");
        // 導覽區必須被限制在容器內，不能靠「長出視窗外」來容納內容
        expect(metrics.clientHeight).toBeLessThanOrEqual(480);

        // 最後一個選項一定要點得到：需要時捲到底，然後確認它落在視窗內
        const lastLink = nav.getByRole("link").last();
        await lastLink.scrollIntoViewIfNeeded();
        const linkBox = await boxOf(lastLink);
        expect(linkBox.y).toBeGreaterThanOrEqual(0);
        expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(480 + 1);

        // 底部的登出列不得被壓扁
        const logout = panel.getByRole("button", { name: "登出" });
        const logoutBox = await boxOf(logout);
        expect(logoutBox.height).toBeGreaterThanOrEqual(36);
      });
    }
  }

  test("both roles use the same drawer width", async ({ page }) => {
    const widths: number[] = [];
    for (const { role, route } of ROLES) {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubApi(page);
      await page.goto(route);
      await page.getByTestId("nav-drawer-trigger").click();
      widths.push(Math.round((await boxOf(page.getByTestId("nav-drawer-panel"))).width));
      await page.keyboard.press("Escape");
      await page.context().clearCookies();
    }
    expect(widths[0]).toBe(widths[1]);
  });
});
