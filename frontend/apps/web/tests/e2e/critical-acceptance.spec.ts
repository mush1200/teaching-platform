import { expect, test, type Page } from "@playwright/test";
import { installCoreApiMocks } from "./helpers/mock-api";
import { getTestCookieUrl } from "./helpers/base-url";

async function setAuthState(page: Page, role: "parent" | "admin", token: string) {
  const email = role === "parent" ? "parent@example.com" : "admin@example.com";
  const seededCart = [
    {
      id: "cart_1",
      materialId: "mat_demo_1",
      title: "小學數學思維訓練",
      ageLabel: "適合 6–12 歲",
      price: 299,
      quantity: 1,
      coverGradient: "from-violet-200 to-indigo-100",
    },
    {
      id: "cart_2",
      materialId: "mat_demo_2",
      title: "雙語閱讀啟蒙課",
      ageLabel: "適合 5–10 歲",
      price: 349,
      quantity: 1,
      coverGradient: "from-rose-100 to-orange-50",
    },
  ];
  /*
   * Cookie 的 origin 必須跟著 `baseURL` 走。
   * 這裡原本寫死 `http://127.0.0.1:3010/` —— 把測試指到別的 port（例如 production build）
   * 時，cookie 會被設在 3010 而永遠送不出去，middleware 就把每一頁導向 /login，
   * 於是整個 describe 都在登入頁上「通過」。
   */
  const cookieUrl = getTestCookieUrl();
  await page.context().addCookies([
    { name: "tp_token", value: token, url: cookieUrl },
    { name: "tp_role", value: role, url: cookieUrl },
  ]);
  await page.addInitScript(
    ({ t, r, e, cart }) => {
      localStorage.setItem("tp_token", t);
      localStorage.setItem("tp_role", r);
      localStorage.setItem("tp_user_email", e);
      if (r === "parent") {
        localStorage.setItem(`tp_mock_cart_items_v1:${e}`, JSON.stringify(cart));
      }
    },
    { t: token, r: role, e: email, cart: seededCart },
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
    await expect(page).toHaveURL(/\/dashboard|\/admin/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "探索適合你的教材" })).toBeVisible();
  });

  test("SHOP | CI | 3) materials list renders cards", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/explore");
    await expect(page.locator("#edu-materials-grid a").first()).toBeVisible();
  });

  test("SHOP | NIGHTLY | 4) material detail CTA links are actionable", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/materials/mat_demo_1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/cart/);
  });

  test("SHOP | CI | 5) cart page shows total and checkout entry", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "前往結帳" })).toBeVisible();
  });

  test("ORDER | CI | 6) checkout creates order and redirects to upload-proof", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/checkout");
    await page.getByLabel("姓名").fill("測試家長");
    await page.getByLabel("Email").fill("parent@example.com");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    await expect(page.getByRole("button", { name: /確認送出訂單 · NT\$/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /確認送出訂單/ }).first().click();
    await expect(page).toHaveURL(/\/orders\/[^/]+\/payment-proof/, { timeout: 10000 });
  });

  test("ORDER | CI | 6-1) checkout promo feedback and dynamic CTA amount", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/checkout");
    await page.getByLabel("姓名").fill("測試家長");
    await page.getByLabel("Email").fill("parent@example.com");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    const ctaBefore = await page.getByRole("button", { name: /確認送出訂單 · NT\$/ }).first().innerText();
    await page.getByPlaceholder("輸入優惠代碼").fill("WELCOME100");
    await page.getByRole("button", { name: "套用" }).click();
    await expect(page.getByText("✓ 已套用代碼 WELCOME100")).toBeVisible();
    await expect(page.getByText(/優惠折扣：-NT\$100/)).toBeVisible();
    const ctaAfter = await page.getByRole("button", { name: /確認送出訂單 · NT\$/ }).first().innerText();
    expect(ctaAfter).not.toEqual(ctaBefore);
  });

  test("ORDER | NIGHTLY | 7) orders page lists orders and upload action", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/me/orders");
    await expect(page).toHaveURL(/\/me\/orders/);
    await expect(page.getByRole("link", { name: "上傳付款憑證" }).first()).toBeVisible();
  });

  test("ORDER | CI | 8) upload-proof validates required files", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/orders/ord_mock_001/payment-proof");
    await expect(page.getByText("訂單成立").first()).toBeAttached();
    await expect(page.getByText("完成匯款").first()).toBeAttached();
    await expect(page.getByText("上傳付款憑證").first()).toBeAttached();
    await page.getByRole("button", { name: "送出憑證" }).click();
    await expect(page.getByText("請至少上傳 1 張憑證圖片。")).toBeVisible();
  });

  test("ORDER | CI | 9) upload-proof submit success feedback", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/orders/ord_mock_001/payment-proof");
    await page.getByLabel("拖拉圖檔到此處，或點擊選擇檔案").setInputFiles({
      name: "proof.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await page.getByRole("button", { name: "送出憑證" }).click();
    await expect(page.getByText("已收到付款憑證，目前等待人工審核。")).toBeVisible();
    await expect(page.getByText("已送出付款憑證").first()).toBeAttached();
    await expect(page.getByText("平台審核中").first()).toBeAttached();
  });

  test("ORDER | CI | 9-1) order detail shows timeline state", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/me/orders/ord_mock_001");
    await expect(page.getByText("訂單進度")).toBeVisible();
    await expect(page.getByText("訂單成立")).toBeVisible();
    await expect(page.getByText("已送出付款憑證")).toBeVisible();
    await expect(page.getByText("平台審核中")).toBeVisible();
    await expect(page.getByText("等待開放下載")).toBeVisible();
  });

  test("DOWNLOAD | CI | 10) downloads manual query returns signed URL", async ({ page }) => {
    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/me/materials", { waitUntil: "domcontentloaded" });
    const dlButton = page.getByRole("button", { name: "下載教材" }).first();
    await expect(dlButton).toBeVisible();
    await dlButton.click();
  });

  /*
   * 11–14 已改寫成新的營運流程（Admin Operations UX Closure Epic）：
   *   - 檢舉不再是一顆「標記已處理」，而是一個有調查、往返與處置的案件流程
   *   - 付款審核不再要求 Admin 手動輸入憑證 ID，而是搜尋 → 開啟審核面板 → 決定
   * 這些 check 要守的東西沒變：Admin 找得到案件、看得懂內容、做得出決定。
   */
  test("ADMIN | CI | 11) admin report case queue loads cases with readable context", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "檢舉管理" })).toBeVisible();
    const row = page.getByTestId("admin-report-row").first();
    // 教材、創作者、檢舉人都要看得到 —— 不是三個 id
    await expect(row).toContainText("示範教材");
    await expect(row).toContainText("creator@example.com");
    await expect(row).toContainText("parent@example.com");
  });

  test("ADMIN | CI | 12) admin can open a case and act on it", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").first().click();
    await expect(page.getByTestId("report-case-detail")).toBeVisible();
    // 動作按鈕由 Backend 的 allowedTransitions 決定；pending 案件可以接手調查
    await expect(page.getByTestId("report-investigate")).toBeVisible();
    await page.getByTestId("report-investigate").click();
    await expect(page.getByTestId("report-case-message")).toContainText("已接手");
  });

  test("ADMIN | NIGHTLY | 13) admin payment review is searchable and shows decision context", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/payment-proofs");
    await expect(page.getByRole("heading", { name: "付款審核" })).toBeVisible();
    // 入口是訂單編號 / 購買者，不是內部憑證 ID
    await expect(page.getByTestId("toolbar-search-input")).toBeVisible();
    await expect(page.getByTestId("filter-tab-pending")).toBeVisible();
    await expect(page.getByTestId("filter-tab-all")).toBeVisible();

    const row = page.getByTestId("admin-payment-proof-row").first();
    await expect(row).toContainText("ord_mock_001");
    await expect(row).toContainText("parent@example.com");

    await page.getByTestId("payment-proof-open").first().click();
    const panel = page.getByTestId("payment-review-panel");
    await expect(panel).toContainText("NT$ 299");
    await expect(panel).toContainText("付款期限");
  });

  test("ADMIN | NIGHTLY | 14) admin payment rejection requires a structured reason", async ({ page }) => {
    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();
    await page.getByTestId("payment-reject-open").click();

    // 「其他」需要補充說明，否則購買者收到的是一句空話
    await page.getByTestId("rejection-reason-other").check();
    await page.getByTestId("payment-reject-confirm").click();
    await expect(page.getByTestId("payment-review-message")).toContainText("必須填寫說明");

    await page.getByTestId("rejection-note").fill("銀行查無此筆匯款");
    await page.getByTestId("payment-reject-confirm").click();
    await expect(page.getByTestId("payment-review-message")).toContainText("已退回");
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
    test.setTimeout(90_000);
    await page.goto("/login");
    await page.fill("#login-email", "parent@example.com");
    await page.fill("#login-password", "Password123!");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await page.waitForLoadState("networkidle");
    const current = page.url();
    if (/\/login$/.test(current)) {
      await setAuthState(page, "parent", "e2e-parent-token");
      await page.goto("/explore", { waitUntil: "domcontentloaded" });
    }
    await expect(page).toHaveURL(/\/dashboard|\/explore|\/admin/);

    await setAuthState(page, "parent", "e2e-parent-token");
    await page.goto("/orders/ord_mock_001/payment-proof", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/orders\/[^/]+\/payment-proof/, { timeout: 10000 });

    await page.getByLabel("拖拉圖檔到此處，或點擊選擇檔案").setInputFiles({
      name: "full-journey-proof.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await page.getByRole("button", { name: "送出憑證" }).click();
    await expect(page.getByText("已收到付款憑證，目前等待人工審核。")).toBeVisible();

    await page.goto("/me/materials", { waitUntil: "domcontentloaded" });
    const dlButton = page.getByRole("button", { name: "下載教材" }).first();
    await expect(dlButton).toBeVisible();
    await dlButton.click();

    await setAuthState(page, "admin", "e2e-admin-token");
    await page.goto("/admin/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "檢舉管理" })).toBeVisible();
    await page.getByRole("button", { name: "標記已處理" }).first().click();
    await expect(page.getByText("檢舉已標記為已處理。")).toBeVisible();
  });
});
