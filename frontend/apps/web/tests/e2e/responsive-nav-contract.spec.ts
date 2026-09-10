import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `Wave UI-6` 的回歸護欄 —— `UI-CONS-05`（斷點）／`UI-CONS-06`（寬度來源）／
 * `UI-CONS-23`（買家抽屜）／`UI-CONS-18`（導覽觸控目標）。
 *
 * ## 契約
 *
 * ```text
 * < 1024  →  沒有常駐 authenticated sidebar；必須有 drawer 觸發鈕；內容左偏移 = 0
 * >= 1024 →  常駐 sidebar 出現；內容左偏移 = 側欄寬度
 * ```
 *
 * 三個角色**同一個斷點**。買家原本是 `md`（768），因此 768–1023 會多出一條 240px
 * 的常駐側欄，而同寬度下 Admin／Creator 早就是 drawer 模式 —— 這裡就是釘住那件事。
 *
 * 測的是 computed 幾何與 accessibility 屬性，不是 class 字串：換 token、改配色、
 * 改 icon 都不該讓這些紅。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

async function stubApi(page: Page, role: string) {
  await page.route("**/api/backend/**", (route) =>
    json(route, { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })
  );
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_1", role, email: `${role}-e2e@example.com` } })
  );
}

type Surface = {
  name: string;
  role: "admin" | "teacher" | "parent";
  route: string;
  sidebarTestId: string;
};

const SURFACES: Surface[] = [
  { name: "Admin", role: "admin", route: "/admin/materials", sidebarTestId: "admin-sidebar-desktop" },
  { name: "Creator", role: "teacher", route: "/teacher/materials", sidebarTestId: "creator-sidebar-desktop" },
  { name: "Buyer", role: "parent", route: "/me/orders", sidebarTestId: "buyer-sidebar-desktop" },
];

/** 常駐側欄是否真的佔著版面，以及主內容的左緣在哪裡。 */
async function shellGeometry(page: Page, sidebarTestId: string) {
  return page.evaluate((testId) => {
    const aside = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    const main = document.querySelector("main");
    const visible = (el: HTMLElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };
    return {
      sidebarVisible: visible(aside),
      sidebarWidth: aside && visible(aside) ? Math.round(aside.getBoundingClientRect().width) : 0,
      mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
      overflowX:
        document.documentElement.scrollWidth > document.documentElement.clientWidth
          ? document.documentElement.scrollWidth - document.documentElement.clientWidth
          : 0,
    };
  }, sidebarTestId);
}

async function open(page: Page, s: Surface, width: number) {
  await signInAs(page, s.role, { email: `${s.role}-e2e@example.com` });
  await stubApi(page, s.role);
  await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
  await page.goto(s.route, { waitUntil: "domcontentloaded" });
  /* 等 hydration 完成 —— 太早點 hamburger 會是 no-op，測試會誤紅。 */
  await page.waitForTimeout(1200);
}

test.describe("UI-CONS-05 — authenticated persistent sidebar 斷點 = lg / 1024", () => {
  for (const width of [768, 1023]) {
    for (const s of SURFACES) {
      test(`${s.name} @${width}：沒有常駐側欄，且有 drawer 觸發鈕`, async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await open(page, s, width);

        const g = await shellGeometry(page, s.sidebarTestId);
        expect(g.sidebarVisible, `${s.name} @${width} 不得有常駐側欄`).toBe(false);
        /* `UI-CONS-05` 的另一半：不得留下「看不見卻仍佔寬度」的偏移。 */
        expect(g.mainLeft, `${s.name} @${width} 主內容不得有側欄偏移`).toBe(0);
        expect(g.overflowX, `${s.name} @${width} 不得有水平溢出`).toBe(0);
        await expect(page.getByTestId("nav-drawer-trigger").first()).toBeVisible();

        await context.close();
      });
    }
  }

  for (const width of [1024, 1280, 1440]) {
    for (const s of SURFACES) {
      test(`${s.name} @${width}：常駐側欄出現，內容跟著偏移`, async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await open(page, s, width);

        const g = await shellGeometry(page, s.sidebarTestId);
        expect(g.sidebarVisible, `${s.name} @${width} 必須有常駐側欄`).toBe(true);
        expect(g.mainLeft, `${s.name} @${width} 主內容左緣必須等於側欄寬度`).toBe(g.sidebarWidth);
        expect(g.overflowX, `${s.name} @${width} 不得有水平溢出`).toBe(0);

        await context.close();
      });
    }
  }
});

test.describe("UI-CONS-06 — 展開側欄寬度只有一個來源", () => {
  test("三個角色的展開側欄寬度相同", async ({ browser }) => {
    const widths: Array<{ name: string; width: number }> = [];
    for (const s of SURFACES) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await open(page, s, 1440);
      const g = await shellGeometry(page, s.sidebarTestId);
      widths.push({ name: s.name, width: g.sidebarWidth });
      await context.close();
    }
    /* 240 = `tailwind.config.ts` 的 `spacing["layout-sidebar"]`，也是
       `shell-constants.SIDEBAR_WIDTH_EXPANDED_PX` 的值。 */
    for (const w of widths) expect(w.width, `${w.name} 展開側欄寬度`).toBe(240);
  });
});

test.describe("UI-CONS-23 — 買家抽屜使用共用 NavDrawer", () => {
  /**
   * 開啟抽屜。
   *
   * 會重試點擊，是因為**在 hydration 完成前點下去等於沒點** —— 按鈕在 SSR 出來的
   * HTML 裡就存在、也可見，但 React 尚未掛上 handler。平行執行時 dev server 較慢，
   * 固定的 sleep 不可靠。這裡輪詢的是「按鈕真的變成 expanded」這個**產品狀態**，
   * 不是為了掩蓋任何實際缺陷（單獨執行時第一次點擊就會成功）。
   */
  async function openBuyerDrawer(page: Page) {
    const trigger = page.getByTestId("nav-drawer-trigger").first();
    await expect(trigger).toBeVisible();
    await expect
      .poll(async () => {
        if ((await trigger.getAttribute("aria-expanded")) === "true") return true;
        await trigger.click();
        await page.waitForTimeout(250);
        return (await trigger.getAttribute("aria-expanded")) === "true";
      }, { timeout: 15000 })
      .toBe(true);
    await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
  }

  test("是 aria-modal dialog，有可及名稱，且鎖住背景捲動", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await open(page, SURFACES[2], 768);
    await openBuyerDrawer(page);

    const panel = page.getByTestId("nav-drawer-panel");
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
    expect((await panel.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await context.close();
  });

  test("Escape 關閉，並把焦點還給觸發鈕", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await open(page, SURFACES[2], 768);
    await openBuyerDrawer(page);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nav-drawer-panel")).toHaveCount(0);
    await expect(page.getByTestId("nav-drawer-trigger").first()).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

    await context.close();
  });

  test("點遮罩關閉", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await open(page, SURFACES[2], 768);
    await openBuyerDrawer(page);

    await page.getByRole("button", { name: "關閉選單" }).first().click();
    await expect(page.getByTestId("nav-drawer-panel")).toHaveCount(0);

    await context.close();
  });

  test("開啟時焦點被關在面板內（Tab 不會跑到背景）", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await open(page, SURFACES[2], 768);
    await openBuyerDrawer(page);

    /* 連按 Tab，焦點必須始終留在面板裡 —— 面板已宣告 aria-modal="true"。 */
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="nav-drawer-panel"]');
        return Boolean(panel && document.activeElement && panel.contains(document.activeElement));
      });
      expect(inside, `第 ${i + 1} 次 Tab 之後焦點跑出面板`).toBe(true);
    }

    await context.close();
  });

  test("抽屜寬度會隨窄視窗縮小，仍留得下可點的遮罩", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await open(page, SURFACES[2], 390);
    await openBuyerDrawer(page);

    const width = await page
      .getByTestId("nav-drawer-panel")
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));
    /* `min(18rem, 85vw)`：390 × 0.85 = 331.5 → 面板不得佔滿整個視窗。 */
    expect(width).toBeLessThan(390);
    expect(width).toBeGreaterThan(0);

    await context.close();
  });
});

test.describe("UI-CONS-18 — 導覽觸發鈕的觸控目標", () => {
  test("買家頂欄的選單與購物車至少 44×44", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await open(page, SURFACES[2], 768);

    const menu = await page
      .getByTestId("nav-drawer-trigger")
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
    expect(menu.w).toBeGreaterThanOrEqual(44);
    expect(menu.h).toBeGreaterThanOrEqual(44);

    const cart = await page
      .getByRole("link", { name: "購物車" })
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
    expect(cart.w).toBeGreaterThanOrEqual(44);
    expect(cart.h).toBeGreaterThanOrEqual(44);

    await context.close();
  });
});
