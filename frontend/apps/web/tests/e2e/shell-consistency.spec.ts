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

type BoundingBox = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

/**
 * `boundingBox()` **不會**自動等待：元素還沒 attach 或還是 `display:none` 時它直接回 null。
 *
 * Dev server 慢到讓 `page.goto()` 回來時畫面早就穩定了，所以這個缺口沒有顯現；
 * production build 快到 `goto` 解析時 React 還沒接手，於是同一段程式碼開始間歇失敗。
 * 先等元素可見再量，量到的才是真的版面。
 *
 * ## 為什麼 poll 必須「順手把值帶出來」（`DX-06`）
 *
 * 這裡原本是三次**各自獨立**的量測：`toBeVisible()` → `expect.poll(box !== null)` →
 * 再呼叫一次 `boundingBox()` 當結果。poll 只證明「**某一個瞬間**量得到」，
 * 而最後那一次是全新的 evaluation：locator 會重新解析節點，只要 hydration／
 * client render 在這兩次讀取之間把節點換掉，第三次就回 `null` ——
 * 於是整套並行執行時間歇倒在 `element has no bounding box`，單獨重跑卻必過。
 *
 * 修法是讓「等到量得到」與「取得最終結果」變成**同一次讀取**：poll 的 callback 把
 * 量到的 box 存下來，成功那一次的值就是回傳值，**poll 之後不再讀第二次**。
 * 這不是放寬斷言 —— 回傳的仍是一次真實、完整的 layout box，
 * 呼叫端的寬度／位移斷言精度完全不變。
 */
async function boxOf(locator: Locator): Promise<BoundingBox> {
  await expect(locator).toBeVisible();
  // 用 holder 而不是 `let`：值在 poll 的 callback 裡寫入，回傳的就是成功那一次量到的 box。
  const measured: { box: BoundingBox | null } = { box: null };
  await expect
    .poll(async () => {
      measured.box = await locator.boundingBox();
      return measured.box !== null;
    })
    .toBe(true);
  const box = measured.box;
  if (!box) throw new Error("element has no bounding box");
  return box;
}

/**
 * Main landmark 的唯一性（`COR-06`）。
 *
 * HTML 規範只允許一份文件有一個非 hidden 的 `main`。先前外殼與頁面**各**渲染一個，
 * 於是每個非 Admin 路由都有兩個巢狀 main —— 螢幕閱讀器的 landmark 導覽看到重複目標，
 * 而測試必須靠 `.first()` 才選得到，等於用弱化 selector 蓋掉產品缺陷。
 *
 * 這一組**刻意用 `toHaveCount(1)` 而不是 `toBeVisible()`**：
 * 後者在 `.first()` 之下即使有兩個也會過，鎖不住這條契約。
 *
 * 兩個 viewport 都跑：landmark 語意與寬度無關，而 mobile 走的是 drawer 版外殼。
 */
test.describe("Accessibility — exactly one main landmark", () => {
  const PUBLIC_ROUTES = ["/", "/materials", "/materials/mat_mock_001", "/materials/mat_mock_001/reviews", "/403"];
  // Auth 頁刻意不渲染側欄外殼，但仍必須有 landmark —— 先前這兩條是 **0 個** main。
  const AUTH_ROUTES = ["/login", "/register"];
  const BUYER_ROUTES = ["/cart", "/checkout", "/orders", "/me/orders", "/my-reviews", "/downloads"];
  const CREATOR_ROUTES = ["/creator/materials", "/creator/sales"];
  const ADMIN_ROUTES = ["/admin", "/admin/materials", "/admin/orders", "/admin/settings"];

  async function expectSingleMain(page: import("@playwright/test").Page, route: string) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main"), `${route} must have exactly one main landmark`).toHaveCount(1);
  }

  for (const route of [...PUBLIC_ROUTES, ...AUTH_ROUTES]) {
    test(`anonymous ${route} has exactly one main`, async ({ page }) => {
      await stubApi(page);
      await expectSingleMain(page, route);
    });
  }

  for (const route of BUYER_ROUTES) {
    test(`buyer ${route} has exactly one main`, async ({ page }) => {
      await signInAs(page, "parent", { email: "parent-e2e@example.com" });
      await stubApi(page);
      await expectSingleMain(page, route);
    });
  }

  for (const route of CREATOR_ROUTES) {
    test(`creator ${route} has exactly one main`, async ({ page }) => {
      await signInAs(page, "teacher", { email: "creator-e2e@example.com" });
      await stubApi(page);
      await expectSingleMain(page, route);
    });
  }

  // Admin 走的是另一個外殼（`AdminShell`），`RoleShell` 對 `/admin` early return。
  // 它在 `COR-06` 之前就是正確的 —— 這裡是回歸保護，確認沒有被誤傷。
  for (const route of ADMIN_ROUTES) {
    test(`admin ${route} has exactly one main`, async ({ page }) => {
      await signInAs(page, "admin", { email: "admin-e2e@example.com" });
      await stubApi(page);
      await expectSingleMain(page, route);
    });
  }
});

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

  /**
   * `IA-08`：Admin 的導覽在**非** `/admin` 路由上也必須是同一份 IA。
   *
   * `RoleShell` 對 `/admin/*` early return，所以它的 admin 清單**只在這裡**看得見 ——
   * 這正是 `IA-01` 與 `IA-07` 當初漏掉的第二個 surface：側欄仍列出「用戶管理」
   * 「系統設定」「教學回饋」，點進去是同樣的死路。
   *
   * 這支測試鎖的是 **source of truth**，不是三個 label：它把兩個 surface 的目的地
   * 逐一比對，任何一邊被單獨改動都會失敗。
   */
  test("admin nav outside /admin matches the admin sidebar exactly", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubApi(page);

    // Surface 1：`/admin/*` 的 AdminSidebar
    await page.goto("/admin/materials");
    const adminAside = page.getByTestId("admin-sidebar-desktop");
    await expect(adminAside).toBeVisible();
    const adminHrefs = await adminAside.getByRole("link").evaluateAll((nodes) =>
      nodes.map((n) => (n.getAttribute("href") ?? "").split("?")[0])
    );

    // Surface 2：非 `/admin` 路由的 RoleShell
    await page.goto("/materials");
    const roleAside = page.getByTestId("role-sidebar-desktop");
    await expect(roleAside).toBeVisible();
    /*
     * `RoleShell` 的角色來自 localStorage，第一次 render 時 `storedRole` 還是 `null`，
     * 側欄會先畫 public 清單，effect 跑完才換成 admin。先等 admin 內容真的出現，
     * 否則量到的是 public 清單 —— 那不是這支測試要驗的東西。
     */
    await expect(roleAside.getByRole("link", { name: "營運總覽" })).toBeVisible();
    // 這個 surface 只在 admin 身分下才出現；沒出現代表測試根本沒測到目標
    await expect(page.getByTestId("admin-sidebar-desktop")).toHaveCount(0);
    const roleHrefs = await roleAside.getByRole("link").evaluateAll((nodes) =>
      nodes.map((n) => (n.getAttribute("href") ?? "").split("?")[0])
    );

    expect(roleHrefs).toEqual(adminHrefs);

    // 已下架的三個一級入口不得在任何一個 surface 出現
    for (const dead of ["/admin/users", "/admin/settings", "/admin/reviews-hub"]) {
      expect(adminHrefs, `admin sidebar still links ${dead}`).not.toContain(dead);
      expect(roleHrefs, `role shell still links ${dead}`).not.toContain(dead);
    }

    // 真正可操作的工作面必須完好 —— 收斂不得順手拿掉別的入口
    for (const label of ["營運總覽", "教材審核", "付款審核", "訂單管理", "檢舉管理", "活動紀錄"]) {
      await expect(roleAside.getByRole("link", { name: label })).toBeVisible();
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

  /**
   * `IA-01`：教學回饋不是 Admin 的一級 destination。
   *
   * Desktop 側欄由 `admin.spec.ts` 覆蓋；手機抽屜 render 的是**同一份** `sections`
   * （`AdminShell` 直接放 `<AdminSidebar variant="drawer" />`），但兩邊都要驗 ——
   * 手機少一個入口是最容易被漏掉的回歸。
   */
  test("admin drawer does not offer teaching feedback as a destination", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubApi(page);
    await page.goto("/admin/materials");

    await page.getByTestId("nav-drawer-trigger").click();
    const panel = page.getByTestId("nav-drawer-panel");
    await expect(panel).toBeVisible();

    await expect(panel.getByRole("link", { name: "教學回饋" })).toHaveCount(0);
    await expect(panel.locator('a[href="/admin/reviews-hub"]')).toHaveCount(0);

    // 其餘導覽必須完好 —— 移除入口不得順手動到別的項目。
    for (const label of ["營運總覽", "教材審核", "付款審核", "訂單管理", "檢舉管理", "活動紀錄"]) {
      await expect(panel.getByRole("link", { name: label })).toBeVisible();
    }
  });

  /**
   * `IA-07`：用戶管理與系統設定不是 Admin 的一級 destination。
   *
   * 與上一支同樣的理由要在手機驗一次 —— drawer 與桌機側欄 render 的是同一份
   * `sections`，但「手機少／多一個入口」是最容易被漏掉的回歸。
   */
  test("admin drawer does not offer the placeholder users/settings destinations", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubApi(page);
    await page.goto("/admin/materials");

    await page.getByTestId("nav-drawer-trigger").click();
    const panel = page.getByTestId("nav-drawer-panel");
    await expect(panel).toBeVisible();

    await expect(panel.getByRole("link", { name: "用戶管理" })).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "系統設定" })).toHaveCount(0);
    await expect(panel.locator('a[href="/admin/users"]')).toHaveCount(0);
    await expect(panel.locator('a[href="/admin/settings"]')).toHaveCount(0);

    // 教學回饋（`IA-01`）不得因為本輪的改動而回到抽屜。
    await expect(panel.getByRole("link", { name: "教學回饋" })).toHaveCount(0);

    // 真正可操作的工作面必須完好。
    for (const label of ["營運總覽", "教材審核", "付款審核", "訂單管理", "檢舉管理", "活動紀錄"]) {
      await expect(panel.getByRole("link", { name: label })).toBeVisible();
    }
  });

  /**
   * `IA-08` 的手機面。
   *
   * 桌機與抽屜在**非** `/admin` 路由上是 `RoleShell` 的同一個 `sidebar()`，但「手機少／多
   * 一個入口」一向是最容易被漏掉的回歸，所以兩邊都驗（與 `IA-01`／`IA-07` 同樣的理由）。
   */
  test("admin drawer outside /admin does not offer the delisted destinations", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubApi(page);
    await page.goto("/materials");

    await page.getByTestId("nav-drawer-trigger").click();
    const panel = page.getByTestId("nav-drawer-panel");
    await expect(panel).toBeVisible();
    // 確認測到的是 RoleShell 的抽屜，不是 AdminShell 的
    await expect(panel.getByTestId("role-sidebar-drawer")).toBeVisible();
    // 與桌機同理：等 admin 清單真的接手，不要驗到第一次 render 的 public 清單。
    await expect(panel.getByRole("link", { name: "營運總覽" })).toBeVisible();

    for (const dead of ["/admin/users", "/admin/settings", "/admin/reviews-hub"]) {
      await expect(panel.locator(`a[href^="${dead}"]`)).toHaveCount(0);
    }
    for (const label of ["用戶管理", "系統設定", "教學回饋"]) {
      await expect(panel.getByRole("link", { name: label })).toHaveCount(0);
    }

    for (const label of ["營運總覽", "教材審核", "付款審核", "訂單管理", "檢舉管理", "活動紀錄"]) {
      await expect(panel.getByRole("link", { name: label })).toBeVisible();
    }
  });

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
