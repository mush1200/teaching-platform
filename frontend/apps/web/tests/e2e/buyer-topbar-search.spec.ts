import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";

/**
 * `UI-REV-F` —— 買家頂欄搜尋不是 no-op（2026-09-30）。
 *
 * ## 缺陷
 *
 * `components/dashboard/Topbar.tsx` 把關鍵字寫進目前路徑的 `?q=`，但買家頁面**沒有任何地方讀 `q`**
 * （`/explore` 的 `ExplorePage` 讀 `?search=`）：網址變了、清單不變，看起來就是壞掉的搜尋。
 *
 * ## 這一支鎖的是什麼
 *
 * 1. 在 `/explore` 送出 → 網址用 canonical `?search=`、清單請求帶 `search`、畫面只剩相符的教材。
 * 2. 在 `/dashboard`（沒有搜尋結果區）送出 → **導向** `/explore?search=…`，而且「上一頁」回到 `/dashboard`。
 * 3. 空字串：`/explore` 清除關鍵字並恢復完整清單；`/dashboard` 不導向。
 *
 * 清單 mock 依 `search` 參數真的過濾 —— 如果產品端送的是 `q`，第 1 條會因為畫面仍有兩筆而紅
 * （negative control 已實測）。
 */

const ITEMS = [
  { id: "mat_math", title: "數學加減法練習單", price: 120, status: "published", category: "math" },
  { id: "mat_lang", title: "注音符號綜合練習", price: 90, status: "published", category: "language" },
];

async function mockBuyerShell(page: Page) {
  const listSearches: Array<string | null> = [];
  await signInAs(page, "parent");
  await installShellBootstrapMocks(page);
  await page.route("**/api/backend/materials**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/api/backend/materials")) return route.fallback();
    const search = url.searchParams.get("search");
    listSearches.push(search);
    const items = search ? ITEMS.filter((m) => m.title.includes(search)) : ITEMS;
    return route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } }),
    });
  });
  return listSearches;
}

const searchBox = (page: Page) => page.getByRole("searchbox", { name: "搜尋教材" });
const main = (page: Page) => page.locator("main");

test.describe("買家頂欄搜尋（UI-REV-F）", () => {
  test("在 /explore 送出：寫入 ?search=、清單請求帶 search、只剩相符結果", async ({ page }) => {
    const listSearches = await mockBuyerShell(page);
    await page.goto("/explore");
    await expect(main(page).getByText("數學加減法練習單")).toBeVisible();
    await expect(main(page).getByText("注音符號綜合練習")).toBeVisible();

    await searchBox(page).fill("數學");
    await searchBox(page).press("Enter");

    await expect(page).toHaveURL(/\/explore\?search=%E6%95%B8%E5%AD%B8$/);
    await expect.poll(() => listSearches.includes("數學")).toBe(true);
    await expect(main(page).getByText("數學加減法練習單")).toBeVisible();
    await expect(main(page).getByText("注音符號綜合練習")).toHaveCount(0);
    // 重新整理後輸入框仍顯示目前的關鍵字（狀態來自網址，不是元件記憶）
    await page.reload();
    await expect(searchBox(page)).toHaveValue("數學");

    // 空字串：清除關鍵字、恢復完整清單
    await searchBox(page).fill("");
    await searchBox(page).press("Enter");
    await expect(page).toHaveURL(/\/explore$/);
    await expect(main(page).getByText("注音符號綜合練習")).toBeVisible();
  });

  test("在 /dashboard 送出：導向 /explore?search=，上一頁回到 /dashboard", async ({ page }) => {
    await mockBuyerShell(page);
    await page.goto("/dashboard");
    await expect(searchBox(page)).toBeVisible();

    // 空字串不導向
    await searchBox(page).press("Enter");
    await expect(page).toHaveURL(/\/dashboard$/);

    await searchBox(page).fill("注音");
    await searchBox(page).press("Enter");
    await expect(page).toHaveURL(/\/explore\?search=%E6%B3%A8%E9%9F%B3$/);
    await expect(main(page).getByText("注音符號綜合練習")).toBeVisible();
    await expect(main(page).getByText("數學加減法練習單")).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue("注音");

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/explore\?search=%E6%B3%A8%E9%9F%B3$/);
  });
});
