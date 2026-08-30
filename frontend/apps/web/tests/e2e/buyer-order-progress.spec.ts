import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 買家訂單進度（`order_progress_state`）的 UI regression —— `COR-01`。
 *
 * ## 為什麼這一支用 mock
 *
 * 「最新一筆憑證決定進度」的**推導**已經由 Backend 的 DB test 鎖住
 * （`Backend/tests/buyerOrderProgress.db.test.js`，含 rejected → 重新上傳 → pending）。
 * 這一支要鎖的是**另一半**：給定同一個 canonical state，買家 UI 講的是不是同一個故事。
 *
 * 具體要防的回歸：買家被退件後**已經**重新上傳，卻仍看到「審核未通過」與
 * 「重新上傳付款憑證」的 CTA —— 於是又傳一次，訂單堆出重複憑證。
 *
 * 對應規格：`docs/mvp_rules.md` §5「買家訂單進度」。
 */

type OrderFixture = {
  status: string;
  order_progress_state: string;
  payment_proof_pending_review_count: number;
  payment_proof_uploaded_count: number;
  payment_proof_latest_status: string | null;
  payment_proof_rejected_note?: string | null;
  paid_at?: string | null;
};

const ORDER_ID = "ord_cor01_001";

/**
 * 只 mock 買家訂單的兩支端點，其餘一律 404 —— 讓「頁面偷偷靠別的資料湊出狀態」直接失敗。
 * list 與 detail 刻意由**同一個 fixture** 展開：production 的兩支端點共用同一段 SQL，
 * 測試若允許兩邊給不同值，就測不到「列表與詳情必須一致」這件事。
 */
async function mockBuyerOrder(page: Page, fixture: OrderFixture) {
  const order = {
    id: ORDER_ID,
    user_id: "usr_parent_e2e",
    total_amount: 299,
    total_price: 299,
    payment_mode: "manual_transfer",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    cancelled_at: null,
    paid_at: null,
    payment_proof_rejected_note: null,
    ...fixture,
  };

  await page.route("**/api/backend/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");
    const body = (payload: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

    if (path === "me/orders" || path === "orders/my") return body({ items: [order] });
    if (path === `me/orders/${ORDER_ID}` || path === `orders/${ORDER_ID}`) {
      return body({
        order,
        items: [
          {
            id: "oi_cor01_001",
            order_id: ORDER_ID,
            material_id: "mat_demo_1",
            material_title: "示範教材",
            quantity: 1,
            unit_price: 299,
            subtotal: 299,
          },
        ],
      });
    }
    return body({ message: "not mocked" }, 404);
  });
}

/** 舊憑證被退回、買家**已經**重新上傳 → 最新一筆是 pending。 */
const REUPLOADED: OrderFixture = {
  status: "pending_payment",
  order_progress_state: "reviewing",
  payment_proof_pending_review_count: 1,
  payment_proof_uploaded_count: 2,
  payment_proof_latest_status: "pending",
  payment_proof_rejected_note: "金額不符",
};

/** 憑證被退回、尚未重新上傳 → 最新一筆是 rejected。 */
const REJECTED: OrderFixture = {
  status: "pending_payment",
  order_progress_state: "rejected",
  payment_proof_pending_review_count: 0,
  payment_proof_uploaded_count: 1,
  payment_proof_latest_status: "rejected",
  payment_proof_rejected_note: "金額不符",
};

/** 已核准，且最新一筆是核准當下被 supersede 成 rejected 的兄弟憑證。 */
const APPROVED_WITH_HISTORICAL_REJECTION: OrderFixture = {
  status: "approved",
  order_progress_state: "approved",
  payment_proof_pending_review_count: 0,
  payment_proof_uploaded_count: 2,
  payment_proof_latest_status: "rejected",
  payment_proof_rejected_note: "superseded by approved proof",
  paid_at: "2026-05-02T00:00:00.000Z",
};

test.describe("Buyer order progress — re-upload alignment (COR-01)", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "parent", { token: "e2e-parent-token", email: "parent@example.com" });
  });

  test("re-uploaded proof: list shows 審核中 and never offers 重新上傳", async ({ page }) => {
    await mockBuyerOrder(page, REUPLOADED);
    await page.goto("/me/orders");

    // 徽章要指名道姓：流程圖的步驟標籤也叫「審核中」，泛用的 getByText 會誤中。
    await expect(page.getByTestId("order-status-chip")).toHaveText("審核中");
    await expect(page.getByText("等待審核中")).toBeVisible();

    // 核心 regression：歷史 rejected 不得覆蓋目前的 pending。
    await expect(page.getByText("審核未通過")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "重新上傳付款憑證" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "上傳付款憑證" })).toHaveCount(0);
  });

  test("re-uploaded proof: detail agrees with the list and hides the upload CTA", async ({ page }) => {
    await mockBuyerOrder(page, REUPLOADED);
    await page.goto(`/me/orders/${ORDER_ID}`);

    await expect(page.getByText("平台審核中", { exact: true })).toBeVisible();
    await expect(page.getByText("下一步：平台審核中，完成後會以 Email 與站內通知提醒您。")).toBeVisible();
    await expect(page.getByText("等待審核中")).toBeVisible();

    await expect(page.getByText("下一步：請依退件原因重新上傳憑證。")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /上傳付款憑證/ })).toHaveCount(0);
    await expect(page.getByText("付款憑證未通過")).toHaveCount(0);
  });

  test("still rejected: 審核未通過 with a 重新上傳 CTA", async ({ page }) => {
    await mockBuyerOrder(page, REJECTED);
    await page.goto("/me/orders");

    await expect(page.getByTestId("order-status-chip")).toHaveText("審核未通過");
    await expect(page.getByRole("link", { name: "重新上傳付款憑證" })).toBeVisible();
    await expect(page.getByText("等待審核中")).toHaveCount(0);
  });

  test("still rejected: detail shows the rejection reason and the re-upload CTA", async ({ page }) => {
    await mockBuyerOrder(page, REJECTED);
    await page.goto(`/me/orders/${ORDER_ID}`);

    await expect(page.getByText("付款憑證未通過")).toBeVisible();
    await expect(page.getByText("下一步：請依退件原因重新上傳憑證。")).toBeVisible();
    await expect(page.getByRole("link", { name: "重新上傳付款憑證" })).toBeVisible();
  });

  test("approved order never regresses because of a superseded rejected proof", async ({ page }) => {
    await mockBuyerOrder(page, APPROVED_WITH_HISTORICAL_REJECTION);
    await page.goto("/me/orders");

    // 已核准的訂單落在「歷史訂單」分頁。
    await page.getByRole("tab", { name: /歷史訂單/ }).click();
    await expect(page.getByTestId("order-status-chip")).toHaveText("已完成");
    await expect(page.getByText("審核未通過")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /重新上傳付款憑證/ })).toHaveCount(0);

    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByText("已開放教材下載")).toBeVisible();
    await expect(page.getByText("下一步：可前往我的教材下載已授權教材。")).toBeVisible();
    await expect(page.getByText("付款憑證未通過")).toHaveCount(0);
  });
});
