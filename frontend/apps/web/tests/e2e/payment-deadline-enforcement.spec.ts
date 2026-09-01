import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 付款期限 enforcement 的 UI —— `P1-09` Wave 2 #12（Option A + A2）。
 *
 * ## 這一支鎖的是什麼
 *
 * enforcement 的**安全邊界在 backend**（`orderService.uploadProof()`），
 * 這裡鎖的是「UI 不與 backend canonical truth 打架」：
 *
 *   1. 被擋住時**不呈現按了必定 409 的控制項**。
 *   2. **前端不自行比日期** —— 本檔刻意提供「期限已過但
 *      `payment_submission_allowed: true`」的 A2 fixture；若前端偷偷用
 *      `Date.now() > payment_due_at` 判斷，那條測試就會失敗。
 *   3. UI **不創造** backend 不存在的訂單狀態（沒有 `expired`，也不寫「訂單已取消」）。
 *
 * 對應規格：`docs/mvp_rules.md` §12.3a.3。
 */

const ORDER_ID = "ord_pde_001";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

async function mockApi(page: Page, handlers: Handlers) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const bare = url.pathname.replace(/^\/api\/backend\//, "");
    const handler = handlers[`${request.method()} ${bare}`];
    if (handler) return handler(route);
    return route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ items: [] }),
    });
  });
}

const json = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

/**
 * `paymentSubmissionAllowed` 由 backend 決定 —— fixture 刻意讓它與 `payment_due_at`
 * **脫鉤**，才能證明前端沒有自己比日期。
 */
function order({
  allowed,
  expired,
  progress = "pending",
}: {
  allowed: boolean;
  expired: boolean;
  progress?: string;
}) {
  return {
    id: ORDER_ID,
    status: "pending_payment",
    total_amount: 480,
    created_at: "2026-08-01T02:00:00Z",
    // 期限固定在過去或未來，但 allowed 獨立控制。
    payment_due_at: expired ? "2026-08-08T15:59:59.999Z" : "2027-01-01T15:59:59.999Z",
    payment_submission_allowed: allowed,
    payment_deadline_expired: expired,
    order_progress_state: progress,
  };
}

const detail = (o: unknown) => ({ order: o, items: [] });

test.describe("buyer payment deadline enforcement", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "parent", { token: "e2e-parent-token", email: "parent@example.com" });
  });

  test("期限內：顯示上傳 CTA 與上傳控制項", async ({ page }) => {
    const o = order({ allowed: true, expired: false });
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) => json(route, detail(o)),
      [`GET orders/${ORDER_ID}/payment-proofs`]: (route) => json(route, { proofs: [] }),
      "GET payment/bank-info": (route) => json(route, { bankName: "測試銀行", accountNumber: "000", accountName: "平台" }),
    });

    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByTestId("order-upload-proof-cta")).toBeVisible();
    await expect(page.getByTestId("order-payment-blocked")).toHaveCount(0);

    await page.goto(`/orders/${ORDER_ID}/payment-proof`);
    await expect(page.getByTestId("proof-submit")).toBeVisible();
    await expect(page.getByTestId("proof-dropzone")).toBeVisible();
    await expect(page.getByTestId("payment-deadline-expired")).toHaveCount(0);
  });

  test("逾期且未曾提交：不顯示 CTA，改為真實狀態", async ({ page }) => {
    const o = order({ allowed: false, expired: true });
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) => json(route, detail(o)),
      [`GET orders/${ORDER_ID}/payment-proofs`]: (route) => json(route, { proofs: [] }),
      "GET payment/bank-info": (route) => json(route, { bankName: "測試銀行", accountNumber: "000", accountName: "平台" }),
    });

    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByTestId("order-payment-blocked")).toBeVisible();
    await expect(page.getByTestId("order-upload-proof-cta")).toHaveCount(0);
    await expect(page.getByText("此訂單的付款期限已過")).toBeVisible();
    // **不得寫成「訂單已取消」** —— backend canonical state 仍是 pending_payment。
    await expect(page.getByText("訂單已取消")).toHaveCount(0);
  });

  test("逾期且未曾提交：付款憑證頁不呈現送出控制項", async ({ page }) => {
    const o = order({ allowed: false, expired: true });
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) => json(route, detail(o)),
      [`GET orders/${ORDER_ID}/payment-proofs`]: (route) => json(route, { proofs: [] }),
      "GET payment/bank-info": (route) => json(route, { bankName: "測試銀行", accountNumber: "000", accountName: "平台" }),
    });

    await page.goto(`/orders/${ORDER_ID}/payment-proof`);
    const notice = page.getByTestId("payment-deadline-expired");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("付款期限已過");
    await expect(notice).toContainText("重新建立訂單");
    await expect(page.getByTestId("proof-submit")).toHaveCount(0);
    // 只藏送出鈕不夠 —— 留著 dropzone 等於邀請買家挑一批必定 409 的檔案。
    // 這一條是真實瀏覽器驗證抓到的缺陷（初版仍渲染 dropzone 與 file input）。
    await expect(page.getByTestId("proof-dropzone")).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByText("點擊上傳或拖拉檔案到此")).toHaveCount(0);
  });

  test("**A2**：期限已過但 backend 允許（曾於期限內提交）→ 仍顯示重新上傳", async ({ page }) => {
    // 關鍵 fixture：`payment_due_at` 在過去，但 `payment_submission_allowed: true`。
    // 前端若自行比日期，這一條會失敗。
    const o = order({ allowed: true, expired: true, progress: "rejected" });
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) => json(route, detail(o)),
      [`GET orders/${ORDER_ID}/payment-proofs`]: (route) => json(route, { proofs: [] }),
      "GET payment/bank-info": (route) => json(route, { bankName: "測試銀行", accountNumber: "000", accountName: "平台" }),
    });

    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByTestId("order-upload-proof-cta")).toBeVisible();
    await expect(page.getByTestId("order-upload-proof-cta")).toContainText("重新上傳");
    await expect(page.getByTestId("order-payment-blocked")).toHaveCount(0);

    await page.goto(`/orders/${ORDER_ID}/payment-proof`);
    await expect(page.getByTestId("proof-submit")).toBeVisible();
    await expect(page.getByTestId("proof-dropzone")).toBeVisible();
    await expect(page.getByTestId("payment-deadline-expired")).toHaveCount(0);
  });

  test("reload 後狀態一致（不是 client-side 暫存）", async ({ page }) => {
    const o = order({ allowed: false, expired: true });
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) => json(route, detail(o)),
      [`GET orders/${ORDER_ID}/payment-proofs`]: (route) => json(route, { proofs: [] }),
      "GET payment/bank-info": (route) => json(route, { bankName: "測試銀行", accountNumber: "000", accountName: "平台" }),
    });
    await page.goto(`/orders/${ORDER_ID}/payment-proof`);
    await expect(page.getByTestId("payment-deadline-expired")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("payment-deadline-expired")).toBeVisible();
    await expect(page.getByTestId("proof-submit")).toHaveCount(0);
  });

  test("mobile：被擋狀態無 horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const o = order({ allowed: false, expired: true });
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) => json(route, detail(o)),
      [`GET orders/${ORDER_ID}/payment-proofs`]: (route) => json(route, { proofs: [] }),
      "GET payment/bank-info": (route) => json(route, { bankName: "測試銀行", accountNumber: "000", accountName: "平台" }),
    });
    await page.goto(`/orders/${ORDER_ID}/payment-proof`);
    await expect(page.getByTestId("payment-deadline-expired")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByTestId("order-payment-blocked")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

test.describe("admin payment deadline visibility", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { token: "e2e-admin-token", email: "admin@example.com" });
  });

  const proofRow = (allowed: boolean, expired: boolean) => ({
    id: "prf_pde_001",
    order_id: ORDER_ID,
    user_id: "usr_b1",
    buyer_email: "buyer@example.com",
    order_status: "pending_payment",
    order_total_amount: 480,
    order_payment_mode: "manual_transfer",
    order_created_at: "2026-08-01T02:00:00Z",
    order_payment_due_at: expired ? "2026-08-08T15:59:59.999Z" : "2027-01-01T15:59:59.999Z",
    order_review_due_at: null,
    order_payment_info_submitted_at: null,
    order_payment_received_at: null,
    order_payment_deadline_expired: expired,
    order_payment_submission_allowed: allowed,
    review_status: "pending",
    proof_file_available: true,
    proof_storage_status: "private",
    proof_file_path: `/orders/${ORDER_ID}/payment-proofs/prf_pde_001/file`,
    original_filename: "p.png",
    proof_size_bytes: 100,
    uploaded_at: "2026-08-05T02:00:00Z",
    order_proof_count: 1,
  });

  const mockAdmin = (page: Page, allowed: boolean, expired: boolean) =>
    mockApi(page, {
      "GET admin/payment-proofs": (route) =>
        json(route, {
          items: [proofRow(allowed, expired)],
          counts: { pending: 1, approved: 0, rejected: 0 },
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
      "GET admin/payment-proofs/prf_pde_001": (route) =>
        json(route, { proof: proofRow(allowed, expired), orderItems: [], otherProofs: [] }),
    });

  test("Admin 看得出買家已無法補件", async ({ page }) => {
    await mockAdmin(page, false, true);
    // 詳情由點選佇列列開啟（`selectedId` 是 component state，不是 query param）。
    await page.goto("/admin/payment-proofs?status=pending");
    await page.getByTestId("payment-proof-open").first().click();
    await expect(page.getByTestId("payment-review-panel")).toBeVisible();
    const blocked = page.getByTestId("admin-submission-blocked");
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText("付款期限已過且未曾於期限內提交");
  });

  test("**A2**：期限已過但買家仍可補件，Admin 必須看到「可以」", async ({ page }) => {
    await mockAdmin(page, true, true);
    // 詳情由點選佇列列開啟（`selectedId` 是 component state，不是 query param）。
    await page.goto("/admin/payment-proofs?status=pending");
    await page.getByTestId("payment-proof-open").first().click();
    await expect(page.getByTestId("payment-review-panel")).toBeVisible();
    const ok = page.getByTestId("admin-submission-allowed");
    await expect(ok).toBeVisible();
    await expect(ok).toContainText("仍可重傳");
    await expect(page.getByTestId("admin-submission-blocked")).toHaveCount(0);
  });

  test("期限未到：顯示可以，且不加上 A2 註記", async ({ page }) => {
    await mockAdmin(page, true, false);
    // 詳情由點選佇列列開啟（`selectedId` 是 component state，不是 query param）。
    await page.goto("/admin/payment-proofs?status=pending");
    await page.getByTestId("payment-proof-open").first().click();
    await expect(page.getByTestId("payment-review-panel")).toBeVisible();
    const ok = page.getByTestId("admin-submission-allowed");
    await expect(ok).toBeVisible();
    await expect(ok).not.toContainText("仍可重傳");
  });
});
