import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * Wave UI-2 primitive 契約護欄（`UI-CONS-04` / `UI-CONS-08` / `UI-CONS-09` / `UI-CONS-19`）。
 *
 * ## 這些測試斷言行為與語意，不是 class 字串
 *
 * 全部走 accessibility tree 與 computed style（`aria-invalid`、`aria-describedby`、
 * `aria-busy`、`disabled`、實際 box size），因此換 token、改配色、換排版都不會誤紅；
 * 但只要「loading 沒有真的鎖住按鈕」「錯誤沒有連到欄位」這類**行為**回歸，一定會紅。
 *
 * ## 為什麼用真實頁面而不是 unit render
 *
 * repo 沒有 component-test runner（沒有 jsdom / RTL 設定），新增一套只為了這幾個斷言
 * 會擴大到 `UI-CONS-09` 以外的基礎建設決定。這裡改用既有的 Playwright harness，
 * 在**真的渲染出這些 primitive 的頁面**上驗證 —— 而且那本來就是更接近使用者的證據。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

const MATERIAL_ROW = {
  id: "mat_ui2",
  title: "UI-2 契約教材",
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
      items: [MATERIAL_ROW],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      statusCounts: { total: 1, pending_review: 1, published: 0, unpublished: 0 },
    })
  );
  await page.route("**/api/backend/materials/mat_ui2**", (route) =>
    json(route, { ...MATERIAL_ROW, description: "x", contents: [], detail_images: [], material_features: [] })
  );
}

async function openReviewPanel(page: Page) {
  await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  await mockAdmin(page);
  await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
  await page.getByTestId("material-review-open").first().click();
  await page.getByTestId("material-request-changes-open").click();
}

test.describe("UI-CONS-04 — FormField 把驗證錯誤接上欄位", () => {
  test("no error → the control must NOT claim to be invalid", async ({ page }) => {
    await openReviewPanel(page);
    const note = page.getByTestId("material-reason-note");
    await expect(note).toBeVisible();
    // 還沒送出 → 不得有 aria-invalid（假陽性比沒有標記更糟）
    expect(await note.getAttribute("aria-invalid")).toBeNull();
  });

  test("label is programmatically associated with the control", async ({ page }) => {
    await openReviewPanel(page);
    const note = page.getByTestId("material-reason-note");
    const id = await note.getAttribute("id");
    expect(id, "FormField 必須給控制項一個 id").toBeTruthy();
    await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  });

  test("error → aria-invalid=true and aria-describedby points at the message", async ({ page }) => {
    await openReviewPanel(page);
    await page.getByTestId("material-reason-note").fill("太短");
    await page.getByTestId("material-request-changes-confirm").click();

    const note = page.getByTestId("material-reason-note");
    await expect(note).toHaveAttribute("aria-invalid", "true");
    const describedBy = await note.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // 每一個 id 都必須真的存在（指向不存在的節點等於沒有關聯）
    for (const token of describedBy!.split(/\s+/)) {
      await expect(page.locator(`#${token}`)).toHaveCount(1);
    }
  });

  test("ids are unique — no duplicate id in the document", async ({ page }) => {
    await openReviewPanel(page);
    const dupes = await page.evaluate(() => {
      const seen = new Map<string, number>();
      document.querySelectorAll("[id]").forEach((el) => seen.set(el.id, (seen.get(el.id) ?? 0) + 1));
      return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(dupes, "duplicate id 會讓 aria-describedby 指到錯的節點").toEqual([]);
  });
});

test.describe("UI-CONS-08 / UI-CONS-19 — Button loading 契約", () => {
  test("loading disables the control, exposes aria-busy, and blocks double-submit", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);

    // 讓退回請求停在 in-flight，才觀察得到 loading 狀態
    let posts = 0;
    await page.route("**/api/backend/admin/materials/*/request-changes", async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ material: { ...MATERIAL_ROW, status: "changes_requested" } }),
      });
    });

    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    await page.getByTestId("material-review-open").first().click();
    await page.getByTestId("material-request-changes-open").click();
    await page.getByTestId("material-reason-note").fill("封面圖片解析度不足，請重新上傳清晰的版本。");

    const confirm = page.getByTestId("material-request-changes-confirm");
    await confirm.click();

    // 1) loading 期間必須同時是 aria-busy 與真的 disabled
    await expect(confirm).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();

    // 2) 真的 disabled ⇒ 第二次點擊不可能再送出一個請求（force 繞過 actionability 檢查）
    await confirm.click({ force: true }).catch(() => {});
    expect(posts, "loading 期間不得產生第二個請求").toBe(1);
  });

  test("submit button is a real <button> and keeps contextual copy", async ({ page }) => {
    await openReviewPanel(page);
    const confirm = page.getByTestId("material-request-changes-confirm");
    // canonical Button 仍然是原生 button（語意不能被包裝掉）
    expect(await confirm.evaluate((el) => el.tagName)).toBe("BUTTON");
    await expect(confirm).toHaveText("確認退回");
  });
});

test.describe("UI-CONS-09 — Select / Textarea primitive", () => {
  test("Select renders a native select and keeps its options", async ({ page }) => {
    await openReviewPanel(page);
    const select = page.getByTestId("material-reason-select");
    expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
    expect(await select.evaluate((el) => (el as HTMLSelectElement).options.length)).toBeGreaterThan(1);
  });

  test("Select and Textarea share one focus recipe (visible outline on keyboard focus)", async ({ page }) => {
    await openReviewPanel(page);
    for (const id of ["material-reason-select", "material-reason-note"]) {
      const el = page.getByTestId(id);
      await el.focus();
      const width = await el.evaluate((node) => {
        const s = getComputedStyle(node);
        return s.outlineStyle === "none" ? 0 : Number.parseFloat(s.outlineWidth) || 0;
      });
      expect(width, `${id} 聚焦時必須畫得出 outline`).toBeGreaterThan(0);
    }
  });
});
