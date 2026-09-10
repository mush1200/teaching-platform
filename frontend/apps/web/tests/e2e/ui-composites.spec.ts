import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * Wave UI-3 composite 契約護欄（`UI-CONS-10` / `UI-CONS-11` / `UI-CONS-12`）。
 *
 * 與 UI-1／UI-2 的護欄一樣：**斷言行為與語意，不斷言 class 字串**。
 * 換 token、改配色、改排版都不該讓這些紅；但「核准送出兩次」「狀態文案被收斂掉」
 * 「分頁的目前頁沒有進 accessibility tree」這類回歸一定會紅。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

const ROW = {
  id: "mat_ui3",
  title: "UI-3 契約教材",
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
  await page.route("**/api/backend/materials/mat_ui3**", (route) =>
    json(route, { ...ROW, description: "x", contents: [], detail_images: [], material_features: [] })
  );
}

test.describe("UI-CONS-12 — canonical tone vocabulary reaches the UI", () => {
  test("admin material queue renders a StatusPill with role-aware copy", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });

    const pill = page.getByTestId("status-pill").first();
    await expect(pill).toBeVisible();
    // Admin 視角的 pending_review 文案是「待審核」（Creator 視角是「審核中」）。
    // 收斂 tone 值域**不得**改動任何角色文案 —— 這一條就是釘住那件事。
    await expect(pill).toHaveText("待審核");
  });
});

test.describe("UI-CONS-12 / UI-CONS-08 — MaterialReviewPanel 核准動作", () => {
  test("approve is a canonical Button: loading, aria-busy, and no double submit", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    let approvals = 0;
    await page.route("**/api/backend/admin/materials/*/approve", async (route) => {
      approvals += 1;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await json(route, { material: { ...ROW, status: "published" } });
    });

    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    await page.getByTestId("material-review-open").first().click();

    const trigger = page.getByTestId("material-approve");
    await expect(trigger).toBeVisible();
    // 遷移後仍必須是原生 button（語意不能被包裝掉）
    expect(await trigger.evaluate((el) => el.tagName)).toBe("BUTTON");

    /*
      `UI-CONS-16`（Wave UI-5）：核准改為兩段式，送出鎖因此落在**確認鈕**上。
      這裡順帶釘住「展開確認面板本身不得送出任何請求」—— 那正是加確認的意義。
    */
    await trigger.click();
    expect(approvals, "只展開確認面板不得送出請求").toBe(0);

    const confirm = page.getByTestId("material-approve-confirm");
    await expect(confirm).toBeVisible();
    expect(await confirm.evaluate((el) => el.tagName)).toBe("BUTTON");

    await confirm.click();
    await expect(confirm).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();
    await confirm.click({ force: true }).catch(() => {});
    expect(approvals, "loading 期間不得產生第二個核准請求").toBe(1);
  });

  test("request-changes stays a distinct action next to approve", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    await page.getByTestId("material-review-open").first().click();

    await expect(page.getByTestId("material-approve")).toHaveText("核准上架");
    await expect(page.getByTestId("material-request-changes-open")).toHaveText("退回修改");
  });
});

test.describe("UI-CONS-11 — Pagination 收斂為單一實作", () => {
  test("admin list uses the canonical pagination with an accessible current page", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/auth/me", (route) =>
      json(route, { user: { id: "usr_admin", role: "admin", email: "admin-e2e@example.com" } })
    );
    await page.route("**/api/backend/admin/materials**", (route) =>
      json(route, {
        items: Array.from({ length: 20 }, (_, i) => ({ ...ROW, id: `mat_${i}`, title: `教材 ${i}` })),
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
        statusCounts: { total: 100, pending_review: 100, published: 0, unpublished: 0 },
      })
    );
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });

    const pagination = page.getByTestId("pagination").first();
    await expect(pagination).toBeVisible();
    /*
      目前頁必須進 accessibility tree。舊的 `parent/PaginationBar` 只有上一頁／下一頁，
      根本沒有「我在第幾頁」這個資訊 —— 這一條就是收斂到 ds/Pagination 換到的東西。
    */
    await expect(pagination.locator('[aria-current="page"]')).toHaveCount(1);
    // 第 1 頁時「上一頁」必須是真的 disabled，而不是只有視覺變淡
    await expect(page.getByTestId("pagination-prev").first()).toBeDisabled();
  });
});
