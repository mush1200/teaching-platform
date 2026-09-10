import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `Wave UI-5` 的回歸護欄 —— `UI-CONS-16`（確認）／`UI-CONS-19`（loading）／`UI-CONS-14`（導覽 active）。
 *
 * 一樣的原則：**斷言行為與語意，不斷言 class 字串**。
 * 導覽的部分測的是「同一個訊號在四個導覽都成立」的**關係**（active 與 inactive 之間
 * 底色／字重確實不同、且 active 的表達不只有顏色），不是把整串 class 拍快照。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

const ROW = {
  id: "mat_ui5",
  title: "UI-5 契約教材",
  status: "pending_review",
  creator_email: "creator-e2e@example.com",
  open_report_count: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

async function mockAdmin(page: Page) {
  await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_admin", role: "admin", email: "admin-e2e@example.com" } })
  );
  await page.route("**/api/backend/admin/materials**", (route) =>
    json(route, {
      items: [ROW],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      statusCounts: { total: 1, pending_review: 1, published: 0, unpublished: 0 },
    })
  );
  await page.route("**/api/backend/materials/mat_ui5**", (route) =>
    json(route, { ...ROW, description: "x", contents: [], detail_images: [], material_features: [] })
  );
}

async function openReviewPanel(page: Page) {
  await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
  await page.getByTestId("material-review-open").first().click();
  await expect(page.getByTestId("material-approve")).toBeVisible();
}

test.describe("UI-CONS-16 — ConfirmAction", () => {
  test("展開不送出；確認才送出，且只送一次", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    let approvals = 0;
    await page.route("**/api/backend/admin/materials/*/approve", async (route) => {
      approvals += 1;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await json(route, { material: { ...ROW, status: "published" } });
    });

    await openReviewPanel(page);
    await page.getByTestId("material-approve").click();
    await expect(page.getByTestId("material-approve-panel")).toBeVisible();
    expect(approvals, "展開確認面板不得送出請求").toBe(0);

    const confirm = page.getByTestId("material-approve-confirm");
    await confirm.click();
    await expect(confirm).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();
    await confirm.click({ force: true }).catch(() => {});
    expect(approvals, "送出中不得產生第二個請求").toBe(1);
  });

  test("取消會關閉面板、不送出，並把焦點送回觸發鈕", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    let approvals = 0;
    await page.route("**/api/backend/admin/materials/*/approve", (route) => {
      approvals += 1;
      return json(route, { material: ROW });
    });

    await openReviewPanel(page);
    await page.getByTestId("material-approve").click();
    await page.getByTestId("material-approve-cancel").click();

    await expect(page.getByTestId("material-approve-panel")).toHaveCount(0);
    await expect(page.getByTestId("material-approve")).toBeFocused();
    expect(approvals, "取消不得送出任何請求").toBe(0);
  });

  test("展開時焦點落在確認鈕；Escape 關閉並把焦點送回觸發鈕", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await openReviewPanel(page);

    await page.getByTestId("material-approve").click();
    await expect(page.getByTestId("material-approve-confirm")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("material-approve-panel")).toHaveCount(0);
    await expect(page.getByTestId("material-approve")).toBeFocused();
  });

  test("面板可以純鍵盤操作", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    let approvals = 0;
    await page.route("**/api/backend/admin/materials/*/approve", (route) => {
      approvals += 1;
      return json(route, { material: { ...ROW, status: "published" } });
    });

    await openReviewPanel(page);
    /* 焦點移到觸發鈕後全程用鍵盤：Enter 展開 → 焦點自動在確認鈕 → Enter 送出。 */
    await page.getByTestId("material-approve").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("material-approve-confirm")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => approvals).toBe(1);
  });

  /**
   * 負向控制：證明「只送一次」的斷言真的抓得到重複送出。
   * 直接對同一個端點連打兩次，計數必須變成 2 —— 否則上面的 `toBe(1)` 是假綠。
   */
  test("重複送出偵測本身有效", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    let approvals = 0;
    await page.route("**/api/backend/admin/materials/*/approve", (route) => {
      approvals += 1;
      return json(route, { material: ROW });
    });

    await openReviewPanel(page);
    await page.evaluate(async () => {
      await fetch("/api/backend/admin/materials/mat_ui5/approve", { method: "POST" });
      await fetch("/api/backend/admin/materials/mat_ui5/approve", { method: "POST" });
    });
    expect(approvals, "量測手法必須看得見兩次請求").toBe(2);
  });
});

test.describe("UI-CONS-19 — loading contract", () => {
  test("送出中：aria-busy、真的 disabled、且只有一個請求", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    let approvals = 0;
    await page.route("**/api/backend/admin/materials/*/approve", async (route) => {
      approvals += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await json(route, { material: { ...ROW, status: "published" } });
    });

    await openReviewPanel(page);
    await page.getByTestId("material-approve").click();
    const confirm = page.getByTestId("material-approve-confirm");
    await confirm.click();

    await expect(confirm).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();
    /* 文案仍必須讀得到 —— loading 不得把可及名稱換成空字串或只剩 spinner。 */
    expect((await confirm.innerText()).trim().length).toBeGreaterThan(0);
    await expect.poll(() => approvals).toBe(1);
  });
});

test.describe("UI-CONS-14 — 導覽 active 視覺語意", () => {
  /** 回傳 active 與某個 inactive 項目的 computed 樣式，供比較用。 */
  async function activeVsInactive(page: Page, navSelector: string) {
    return page.evaluate((sel) => {
      const root = document.querySelector(sel);
      if (!root) return null;
      const links = Array.from(root.querySelectorAll<HTMLElement>("a"));
      const active = links.find((el) => el.getAttribute("aria-current") === "page");
      const inactive = links.find((el) => el.getAttribute("aria-current") !== "page");
      if (!active || !inactive) return null;
      const read = (el: HTMLElement) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, weight: s.fontWeight };
      };
      return { active: read(active), inactive: read(inactive), count: links.filter((el) => el.getAttribute("aria-current") === "page").length };
    }, navSelector);
  }

  test("買家底欄：active 不只靠顏色，且恰好一個 aria-current", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: "底部導覽" });
    await expect(nav).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

    const m = await activeVsInactive(page, "nav[aria-label='底部導覽']");
    expect(m, "底欄必須同時有 active 與 inactive 項目").not.toBeNull();
    expect(m!.active.color, "active 前景色必須與 inactive 不同").not.toBe(m!.inactive.color);
    /*
      `UI-CONS-14` 的重點：修正前 active **只有換文字色**。
      底色與字重至少要有一項也不同，active 才不是只靠顏色表達。
    */
    const backsDiffer = m!.active.bg !== m!.inactive.bg;
    const weightsDiffer = m!.active.weight !== m!.inactive.weight;
    expect(backsDiffer || weightsDiffer, "active 不得只以顏色表達").toBe(true);
  });

  test("Admin 側欄：active 有底色與字重，且恰好一個 aria-current", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });

    const m = await activeVsInactive(page, "aside");
    expect(m, "Admin 側欄必須同時有 active 與 inactive 項目").not.toBeNull();
    expect(m!.count, "只能有一個目前所在").toBe(1);
    expect(m!.active.bg).not.toBe(m!.inactive.bg);
    expect(m!.active.weight).not.toBe(m!.inactive.weight);
  });

  test("換路由時 active 會跟著移動", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    const first = await page.locator('aside [aria-current="page"]').getAttribute("href");

    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.locator('aside [aria-current="page"]')).toHaveCount(1);
    const second = await page.locator('aside [aria-current="page"]').getAttribute("href");

    expect(second, "換路由後 active 必須跟著換").not.toBe(first);
  });
});
