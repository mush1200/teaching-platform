import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `Wave UI-4A` 的回歸護欄 —— `UI-CONS-13`（typography scale 未收斂）。
 *
 * ## 這裡鎖住的是「瀏覽器算出來的字級」，不是 class 字串
 *
 * 全部用 `getComputedStyle`。因此換 utility 名稱、換 token 名稱、
 * 把 `text-h2` 換成等值的 `text-2xl font-bold` 都**不會誤紅**；
 * 只有「頁面標題實際變成別的字級」才會紅。這正是本輪要保護的東西 ——
 * `UI-CONS-13` 的問題從來不是「有人沒用 token」，而是**同一個語意層級
 * 在不同頁面長得不一樣**。
 *
 * canonical application page title ＝ `text-h2` ＝ 1.5rem / 2rem / 700
 * ＝ 24px / 32px / 700。定義在 `tailwind.config.ts` 的 `fontSize`，
 * 由 `components/ds/PageHeader` 這個唯一入口渲染。
 */

const PAGE_TITLE = { fontSize: "24px", lineHeight: "32px", fontWeight: "700" };

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

async function stubApi(page: Page) {
  // LIFO：catch-all 先註冊，specific 後註冊。
  await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_1", role: "parent", email: "parent-e2e@example.com" } })
  );
  await page.route("**/api/backend/orders**", (route) =>
    json(route, { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })
  );
}

/** 回傳 h1 實際算出來的字體三元組。 */
async function h1Typography(page: Page) {
  return page.getByRole("heading", { level: 1 }).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight };
  });
}

test.describe("UI-CONS-13 — application page title 只有一個字級", () => {
  /**
   * 這兩頁在 `Wave UI-4A` 之前是各自寫死的 `<h1 className="text-2xl font-bold ...">`，
   * 現在都由 `PageHeader` 渲染。它們必須算出**同一組**字體值。
   */
  for (const route of ["/favorites", "/my-reviews"]) {
    test(`${route} 的頁面標題採用 canonical page-title 字級`, async ({ page }) => {
      await signInAs(page, "parent", { email: "parent-e2e@example.com" });
      await stubApi(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(await h1Typography(page), `${route} 的 h1`).toEqual(PAGE_TITLE);
    });
  }

  /**
   * `/me/orders/:id` 的 `<h1>` 長在 `Card` 裡，是本輪 `STEP 5` 用
   * typography-only normalization（`text-lg` → `text-h2`）收斂的那一類。
   * 它必須跟 `PageHeader` 算出同一組值 —— 不然「收斂」只是換了寫法。
   */
  test("卡片內的買家頁面標題與 PageHeader 同字級", async ({ page }) => {
    await signInAs(page, "parent", { email: "parent-e2e@example.com" });
    await stubApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/me/orders/ord_typography_probe", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await h1Typography(page), "/me/orders/:id 的 h1").toEqual(PAGE_TITLE);
  });
});

test.describe("UI-CONS-13 — 被移除的 h1 字級沒有復活", () => {
  /**
   * `text-h1`（2rem/2.5rem/700）在 `Wave UI-4A` 被移除：實測 consumer ＝ 0，
   * 而且它描述的字級在產品裡不存在（canonical page title 是 24px 而非 32px）。
   *
   * 這個測試成對斷言，避免「因為什麼都沒量到所以綠燈」：
   *   - `text-h1` 必須算不出 32px（Tailwind JIT 不會產生沒人用的 class）。
   *   - `text-h2` 必須真的算得出 24px —— 證明量測手法本身有效。
   */
  test("text-h1 已不再產生 32px，且 text-h2 仍然有效", async ({ page }) => {
    await stubApi(page);
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(() => {
      const read = (cls: string) => {
        const el = document.createElement("div");
        el.className = cls;
        el.textContent = "probe";
        document.body.appendChild(el);
        const s = getComputedStyle(el);
        const out = { fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight };
        el.remove();
        return out;
      };
      return { h1: read("text-h1"), h2: read("text-h2") };
    });

    expect(probe.h2, "text-h2 必須仍是 canonical page title 字級（量測手法的正向控制）").toEqual({
      fontSize: "24px",
      lineHeight: "32px",
      fontWeight: "700",
    });
    expect(probe.h1.fontSize, "text-h1 不得再解析成 32px").not.toBe("32px");
  });
});
