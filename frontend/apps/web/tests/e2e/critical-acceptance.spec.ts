import { expect, test, type Page } from "@playwright/test";
import { installCoreApiMocks } from "./helpers/mock-api";

async function setAuthState(page: Page, role: "parent" | "admin", token: string) {
  await page.context().addCookies([
    { name: "tp_token", value: token, url: "http://127.0.0.1:3010/" },
    { name: "tp_role", value: role, url: "http://127.0.0.1:3010/" },
  ]);
  await page.addInitScript(
    ({ t, r }) => {
      localStorage.setItem("tp_token", t);
      localStorage.setItem("tp_role", r);
    },
    { t: token, r: role },
  );
}

test.describe("Critical Acceptance E2E (16 checks)", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreApiMocks(page);
  });

  test("AUTH | CI | 1) login validation shows required message", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page.getByText("Email 格式不正確")).toBeVisible();
  });

  test("AUTH | CI | 2) login success stores auth and redirects", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#login-email", "parent@example.com");
    await page.fill("#login-password", "Password123!");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page).toHaveURL(/\/materials/);
    await expect(page.getByRole("heading", { name: "精選教材" })).toBeVisible();
  });

  test("SHOP | CI | 3) materials list renders cards", async ({ page }) => {
    await page.goto("/materials");
    await expect(page.getByRole("heading", { name: "精選教材" })).toBeVisible();
    await expect(page.locator("#edu-materials-grid a").first()).toBeVisible();
  });

  test("SHOP | NIGHTLY | 4) material detail CTA links are actionable", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/materials/mat_demo_1");
    const addToCartLink = page.getByRole("link", { name: "加入購物車" }).first();
    await expect(addToCartLink).toBeVisible();
    await expect(addToCartLink).toHaveAttribute("href", "/cart");
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/cart/);
  });

  test("SHOP | CI | 5) cart page shows total and checkout entry", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/cart");
    await expect(page.getByRole("button", { name: "前往結帳" })).toBeVisible();
    await expect(page.getByText("總計")).toBeVisible();
  });

  test("ORDER | CI | 6) checkout creates order and redirects to upload-proof", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/checkout");
    await page.getByRole("button", { name: "成立訂單" }).click();
    await expect(page.getByText("訂單已建立，請上傳付款憑證。")).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/ord_mock_[^/]+\/upload-proof/, { timeout: 10000 });
  });

  test("ORDER | NIGHTLY | 7) orders page lists orders and upload action", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "訂單列表" })).toBeVisible();
    await expect(page.getByRole("button", { name: "上傳付款憑證" }).first()).toBeVisible();
  });

  test("ORDER | CI | 8) upload-proof validates invalid URL", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/orders/ord_mock_001/upload-proof");
    await page.fill("#proof-url", "not-a-url");
    await page.getByRole("button", { name: "送出憑證" }).click();
    await expect(page.getByText("請輸入有效的憑證網址（http/https）")).toBeVisible();
  });

  test("ORDER | CI | 9) upload-proof submit success feedback", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/orders/ord_mock_001/upload-proof");
    await page.fill("#proof-url", "https://example.com/proof.png");
    await page.getByRole("button", { name: "送出憑證" }).click();
    await expect(page.getByText("已送出憑證，請等待管理員審核。")).toBeVisible();
  });

  test("DOWNLOAD | CI | 10) downloads manual query returns signed URL", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/downloads");
    await page.fill("#manual-mid", "mat_demo_1");
    await page.getByRole("button", { name: "查詢下載連結" }).click();
    await expect(page.getByRole("link", { name: "開啟下載" })).toBeVisible();
  });

  test("ADMIN | CI | 11) admin reports list loads report rows", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "檢舉管理" })).toBeVisible();
    await expect(page.getByText("檢舉 rep_001")).toBeVisible();
  });

  test("ADMIN | CI | 12) admin reports can mark reviewed", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/reports");
    await page.getByRole("button", { name: "標記已處理" }).first().click();
    await expect(page.getByText("檢舉已標記為已處理。")).toBeVisible();
  });

  test("ADMIN | NIGHTLY | 13) admin payment proofs list + filter controls visible", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/payment-proofs");
    await expect(page.getByRole("heading", { name: "付款憑證審核" })).toBeVisible();
    await expect(page.getByText("憑證 ID：proof_001")).toBeVisible();
    await expect(page.getByRole("button", { name: "待審" })).toBeVisible();
    await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
  });

  test("ADMIN | NIGHTLY | 14) admin payment proofs reject requires note", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/payment-proofs");
    await page.fill("#proof-id", "proof_001");
    await page.getByRole("button", { name: "拒絕憑證" }).click();
    await expect(page.getByText("拒絕時需填寫原因。")).toBeVisible();
  });

  test("ADMIN | NIGHTLY | 15) admin material reports mark reviewed and show feedback", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/materials/mat_mock_001/reports");
    await expect(page.getByRole("heading", { name: "教材檢舉紀錄" })).toBeVisible();
    await expect(page.getByText("檢舉 rep_101")).toBeVisible();
    await page.getByRole("button", { name: "標記已處理" }).first().click();
    await expect(page.getByText("檢舉已標記為已處理。")).toBeVisible();
  });

  test("JOURNEY | NIGHTLY | 16) full flow end-to-end (login -> shop -> checkout -> upload -> download -> admin review)", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#login-email", "parent@example.com");
    await page.fill("#login-password", "Password123!");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await page.waitForLoadState("networkidle");
    if ((await page.url()).endsWith("/")) {
      await page.goto("/materials");
    }
    await expect(page).toHaveURL(/\/materials/);

    await page.goto("/materials/mat_demo_1");
    await page.getByRole("link", { name: "加入購物車" }).click();
    await expect(page).toHaveURL(/\/cart/);

    await page.getByRole("button", { name: "前往結帳" }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.getByRole("button", { name: "成立訂單" }).click();
    await expect(page).toHaveURL(/\/orders\/ord_mock_[^/]+\/upload-proof/, { timeout: 10000 });

    await page.fill("#proof-url", "https://example.com/full-journey-proof.png");
    await page.getByRole("button", { name: "送出憑證" }).click();
    await expect(page.getByText("已送出憑證，請等待管理員審核。")).toBeVisible();

    await page.goto("/downloads");
    await page.fill("#manual-mid", "mat_demo_1");
    await page.getByRole("button", { name: "查詢下載連結" }).click();
    await expect(page.getByRole("link", { name: "開啟下載" }).first()).toBeVisible();

    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "檢舉管理" })).toBeVisible();
    await page.getByRole("button", { name: "標記已處理" }).first().click();
    await expect(page.getByText("檢舉已標記為已處理。")).toBeVisible();
  });
});
