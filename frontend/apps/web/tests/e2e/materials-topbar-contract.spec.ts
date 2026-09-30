import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * `/materials` 頂欄 —— `UI-REV-E` 方案 B（Owner 決定，2026-09-30）的回歸契約。
 *
 * ## 方案 B 是什麼
 *
 * 保留路由自己的購物導向頂欄（品牌／搜尋／購物車），外殼（`RoleShell`）在此路由**不**渲染
 * 行動版 `MobileNavBar`。選單鈕開啟的是**外殼的** canonical 抽屜，而不是頁面自帶的第二份抽屜。
 *
 * ## 這一支鎖的是什麼
 *
 * 1. **只有一條頂欄**（390／768／1440），且它不蓋住內容。
 * 2. **關鍵目的地一個都沒少**：首頁、教材列表、登入、註冊、聯絡平台（`PRE-14`）、購物車、搜尋。
 *    < 1024 從抽屜、≥ 1024 從常駐側欄。先前路由自帶的抽屜缺「註冊」與「聯絡平台」。
 * 3. **沒有 dead control**：搜尋鈕先前沒有 handler；現在它展開搜尋列並寫入 `ExplorePage`
 *    本來就讀取的 `?search=`，清單請求真的帶上該參數。≥ 1024 抽屜不存在，選單鈕必須隱藏。
 *
 * 測的是 computed 幾何、accessible name 與實際導覽結果，不是 class 字串。
 */

const PUBLIC_DESTINATIONS: Array<[string, string]> = [
  ["首頁", "/"],
  ["教材列表", "/materials"],
  ["登入", "/login"],
  ["註冊", "/register"],
  ["聯絡平台", "/support"],
];

const WIDTHS = [
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
];

/** 只攔清單本身，並記錄清單請求的 query（驗證搜尋真的送出）。 */
async function mockMaterialsList(page: Page) {
  const listQueries: string[] = [];
  await page.route("**/api/backend/materials**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/api/backend/materials")) return route.fallback();
    listQueries.push(url.search);
    return route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        items: [
          { id: "mat_l1", title: "語言教材 L1", price: 100, status: "published", category: "language" },
          { id: "mat_m1", title: "數學教材 M1", price: 150, status: "published", category: "math" },
        ],
      }),
    });
  });
  return listQueries;
}

async function visibleHeaders(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("header"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      })
  );
}

test.describe("/materials 頂欄（UI-REV-E 方案 B）", () => {
  for (const { w, h } of WIDTHS) {
    test(`${w}px：只有一條頂欄、關鍵入口都可達`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await mockMaterialsList(page);
      await page.goto("/materials");
      // 先確認頁面真的在外殼內渲染完成 —— 否則「只有一條」可能是「一條都沒有」時的假綠。
      await expect(page.locator("main").getByText("語言教材 L1")).toBeVisible();

      const headers = await visibleHeaders(page);
      expect(headers, "exactly one visible top bar").toHaveLength(1);
      const firstCard = await page.locator("main").getByText("語言教材 L1").boundingBox();
      expect(firstCard!.y, "top bar must not overlap content").toBeGreaterThanOrEqual(headers[0].bottom);

      const header = page.locator("header").filter({ visible: true });
      await expect(header.getByRole("link", { name: "購物車" })).toHaveAttribute("href", "/cart");
      await expect(header.getByRole("link", { name: "EduMarket" })).toHaveAttribute("href", "/materials");
      await expect(header.getByRole("button", { name: "搜尋教材" })).toBeVisible();

      const trigger = page.getByTestId("nav-drawer-trigger").filter({ visible: true });
      if (w < 1024) {
        await expect(trigger).toHaveCount(1);
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await trigger.click();
        const panel = page.getByTestId("nav-drawer-panel");
        await expect(panel).toBeVisible();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        for (const [name, href] of PUBLIC_DESTINATIONS) {
          await expect(panel.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
        }
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect(trigger).toBeFocused();
      } else {
        // ≥ 1024 抽屜不存在：觸發鈕若還在就是點了沒反應的 dead control。
        await expect(trigger).toHaveCount(0);
        const aside = page.getByTestId("role-sidebar-desktop");
        await expect(aside).toBeVisible();
        for (const [name, href] of PUBLIC_DESTINATIONS) {
          await expect(aside.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
        }
      }
    });
  }

  test("搜尋鈕不是 dead control：展開搜尋列並送出 ?search=", async ({ page }) => {
    const listQueries = await mockMaterialsList(page);
    await page.goto("/materials");
    await expect(page.locator("main").getByText("語言教材 L1")).toBeVisible();

    const button = page.locator("header").filter({ visible: true }).getByRole("button", { name: "搜尋教材" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");

    const input = page.getByRole("searchbox", { name: "搜尋教材" });
    await expect(input).toBeFocused();
    await input.fill("數學");
    await input.press("Enter");

    await expect(page).toHaveURL(/[?&]search=%E6%95%B8%E5%AD%B8/);
    await expect.poll(() => listQueries.some((q) => new URLSearchParams(q).get("search") === "數學")).toBe(true);
    // 送出後收起，焦點不留在已消失的輸入框
    await expect(page.getByRole("searchbox", { name: "搜尋教材" })).toHaveCount(0);
  });
});
