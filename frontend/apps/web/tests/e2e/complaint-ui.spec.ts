import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 買家與 Admin 的消費申訴 UI —— `P1-09` Gate 3 / Wave 2 #10。
 *
 * ## 這一支鎖的是什麼
 *
 * Wave 2 #6 已經把 complaint backend 做完並測過（`Backend/tests/consumerComplaint.db.test.js`），
 * 但**平台上沒有任何 UI 能提出或處理申訴**。這裡鎖的是
 * 「user-facing flow 存在，而且打到 canonical API」——
 * backend 的商業規則（狀態機、擁有權、SLA）由 db test 與 HTTP 驗證覆蓋，不在此重測。
 *
 * ## 為什麼所有未列出的端點都 404
 *
 * 讓「頁面靠別的資料湊出畫面」或「前端自己算法定期限」直接失敗，而不是靜靜地過。
 *
 * 對應規格：`docs/mvp_rules.md` §12.10。
 */

const COMPLAINT_ID = "cc_e2e_001";
const ORDER_ID = "ord_e2e_001";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

/** 只 mock 明確列出的路徑；其餘一律 404。 */
async function mockApi(page: Page, handlers: Handlers) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/backend\//, "") + (url.search || "");
    const bare = url.pathname.replace(/^\/api\/backend\//, "");
    const key = `${request.method()} ${bare}`;
    const keyWithQuery = `${request.method()} ${path}`;
    const handler = handlers[keyWithQuery] ?? handlers[key];
    if (handler) return handler(route);
    return route.fulfill({
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ message: `unmocked: ${key}` }),
    });
  });
}

const json = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

const BUYER_COMPLAINT = {
  id: COMPLAINT_ID,
  buyer_id: "usr_parent_e2e",
  order_id: ORDER_ID,
  order_item_id: null,
  complaint_type: "payment",
  subject: "已匯款但訂單仍顯示未付款",
  statement: "我在 8/20 15:32 匯款 480 元。",
  status: "responded",
  submitted_at: "2026-08-20T02:00:00Z",
  responded_at: "2026-08-21T02:00:00Z",
  statutory_due_at: "2026-09-04T15:59:59.999Z",
  resolution_summary: null,
  related_remedy_case_id: null,
  overdue: false,
  daysUntilDue: 8,
};

test.describe("buyer complaint UI", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "parent", { token: "e2e-parent-token", email: "parent@example.com" });
  });

  test("訂單詳情提供申訴入口，並帶著正確的訂單 context", async ({ page }) => {
    await mockApi(page, {
      [`GET me/orders/${ORDER_ID}`]: (route) =>
        json(route, {
          order: {
            id: ORDER_ID,
            status: "pending_payment",
            total_amount: 480,
            payment_due_at: "2026-09-02T15:59:59.999Z",
          },
          items: [],
        }),
    });
    await page.goto(`/me/orders/${ORDER_ID}`);

    const link = page.getByTestId("order-complaint-link");
    await expect(link).toBeVisible();
    // **入口必須帶 orderId** —— 那是「從正確的交易 context 發起申訴」。
    await expect(link).toHaveAttribute("href", `/me/complaints/new?orderId=${ORDER_ID}`);
  });

  test("清單空白時顯示 empty state，而不是空白畫面", async ({ page }) => {
    await mockApi(page, { "GET me/complaints": (route) => json(route, { items: [] }) });
    await page.goto("/me/complaints");
    await expect(page.getByTestId("my-complaints-page")).toBeVisible();
    await expect(page.getByText("目前沒有申訴")).toBeVisible();
    await expect(page.getByTestId("new-complaint-link")).toBeVisible();
  });

  test("清單載入失敗時顯示 error state", async ({ page }) => {
    await mockApi(page, {
      "GET me/complaints": (route) => json(route, { message: "server error" }, 500),
    });
    await page.goto("/me/complaints");
    await expect(page.getByText("無法載入申訴")).toBeVisible();
  });

  test("提出申訴會把 canonical 欄位送到 POST /me/complaints", async ({ page }) => {
    let received: Record<string, unknown> | null = null;
    await mockApi(page, {
      "POST me/complaints": (route) => {
        received = route.request().postDataJSON() as Record<string, unknown>;
        return json(route, { complaint: { ...BUYER_COMPLAINT, status: "submitted" } }, 201);
      },
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: { ...BUYER_COMPLAINT, status: "submitted" }, events: [], evidence: [] }),
    });

    await page.goto(`/me/complaints/new?orderId=${ORDER_ID}`);
    await expect(page.getByTestId("complaint-order-context")).toContainText(ORDER_ID);
    await page.getByTestId("complaint-type").selectOption("duplicate_payment");
    await page.getByTestId("complaint-subject").fill("重複扣款");
    await page.getByTestId("complaint-statement").fill("我匯了兩次。");
    await page.getByTestId("complaint-submit").click();

    await expect.poll(() => received).not.toBeNull();
    expect(received).toMatchObject({
      orderId: ORDER_ID,
      complaintType: "duplicate_payment",
      subject: "重複扣款",
      statement: "我匯了兩次。",
    });
    // **前端不得送 buyerId** —— 那一律由 backend 從 token 帶入。
    expect(received).not.toHaveProperty("buyerId");
  });

  test("必填欄位缺漏時不打 API，直接顯示錯誤", async ({ page }) => {
    let called = false;
    await mockApi(page, {
      "POST me/complaints": (route) => {
        called = true;
        return json(route, {}, 201);
      },
    });
    await page.goto("/me/complaints/new");
    await page.getByTestId("complaint-submit").click();
    await expect(page.getByTestId("complaint-error")).toContainText("主旨");
    expect(called).toBe(false);
  });

  test("詳情顯示 backend 的狀態與歷程，且不含內部註記", async ({ page }) => {
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, {
          complaint: BUYER_COMPLAINT,
          // backend 已用 forBuyer 濾掉 internal_note；前端原樣渲染。
          events: [
            { id: "ev1", event_type: "submitted", message: "我在 8/20 匯款。", created_at: "2026-08-20T02:00:00Z" },
            { id: "ev2", event_type: "response_to_buyer", message: "已查明並回覆。", created_at: "2026-08-21T02:00:00Z" },
          ],
          evidence: [
            { id: "evd1", complaint_id: COMPLAINT_ID, uploaded_by: "usr_parent_e2e", has_file: false, external_reference: "台銀 A1234", created_at: "2026-08-20T03:00:00Z" },
          ],
        }),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await expect(page.getByTestId("complaint-detail-page")).toBeVisible();
    await expect(page.getByTestId("status-pill").first()).toContainText("已回覆");
    await expect(page.getByTestId("complaint-events")).toContainText("已查明並回覆。");
    await expect(page.getByTestId("complaint-evidence")).toContainText("台銀 A1234");
    await expect(page.getByText("內部註記")).toHaveCount(0);
  });

  test("非本人的申訴顯示明確的無權檢視，而不是空白或假資料", async ({ page }) => {
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) => json(route, { message: "forbidden" }, 403),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await expect(page.getByTestId("complaint-forbidden")).toBeVisible();
    await expect(page.getByText("無權檢視這筆申訴")).toBeVisible();
  });

  test("結案後不顯示補件表單（backend 會拒絕，UI 不呈現必定失敗的控制項）", async ({ page }) => {
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, {
          complaint: { ...BUYER_COMPLAINT, status: "closed", resolution_summary: "已完成處理。" },
          events: [],
          evidence: [],
        }),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await expect(page.getByTestId("complaint-closed-notice")).toBeVisible();
    await expect(page.getByTestId("evidence-submit")).toHaveCount(0);
    await expect(page.getByTestId("complaint-resolution")).toContainText("已完成處理。");
  });

  test("補充證據會打到 POST /me/complaints/:id/evidence", async ({ page }) => {
    let called = false;
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: BUYER_COMPLAINT, events: [], evidence: [] }),
      [`POST me/complaints/${COMPLAINT_ID}/evidence`]: (route) => {
        called = true;
        return json(route, { evidence: { id: "evd2" } }, 201);
      },
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await page.getByTestId("evidence-reference").fill("郵局 8/21 轉出 480 元");
    await page.getByTestId("evidence-submit").click();
    await expect.poll(() => called).toBe(true);
  });
});

test.describe("admin complaint UI", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { token: "e2e-admin-token", email: "admin@example.com" });
  });

  const ADMIN_ROW = { ...BUYER_COMPLAINT, status: "submitted", overdue: true, daysUntilDue: -2 };

  test("佇列顯示 backend 的逾期旗標與法定期限（前端不自行推算）", async ({ page }) => {
    await mockApi(page, {
      "GET admin/complaints?status=submitted": (route) => json(route, { items: [ADMIN_ROW] }),
      "GET admin/complaints": (route) => json(route, { items: [ADMIN_ROW] }),
    });
    await page.goto("/admin/complaints?status=submitted");
    await expect(page.getByTestId("admin-complaints-page")).toBeVisible();
    const row = page.getByTestId("admin-complaint-row").first();
    await expect(row).toContainText("已逾法定期限");
    await expect(row).toContainText("已逾期 2 天");
  });

  test("空佇列顯示 empty state", async ({ page }) => {
    await mockApi(page, { "GET admin/complaints": (route) => json(route, { items: [] }) });
    await page.goto("/admin/complaints");
    await expect(page.getByText("沒有符合條件的申訴")).toBeVisible();
  });

  test("詳情顯示內部註記（買家看不到的那一份）", async ({ page }) => {
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [ADMIN_ROW] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, {
          complaint: ADMIN_ROW,
          events: [
            { id: "ev1", event_type: "internal_note", message: "先查銀行對帳單。", created_at: "2026-08-20T05:00:00Z" },
          ],
          evidence: [],
        }),
    });
    await page.goto(`/admin/complaints?id=${COMPLAINT_ID}`);
    await expect(page.getByTestId("admin-complaint-events")).toContainText("先查銀行對帳單。");
    await expect(page.getByTestId("admin-complaint-events")).toContainText("買家看不到");
  });

  test("只顯示 backend 允許的轉移，並把處理送到 transition 端點", async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [ADMIN_ROW] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: ADMIN_ROW, events: [], evidence: [] }),
      [`POST admin/complaints/${COMPLAINT_ID}/transition`]: (route) => {
        payload = route.request().postDataJSON() as Record<string, unknown>;
        return json(route, { complaint: ADMIN_ROW });
      },
    });
    await page.goto(`/admin/complaints?id=${COMPLAINT_ID}`);

    // `submitted` 的合法轉移只有 under_review / closed（與 backend TRANSITIONS 一致）。
    const select = page.getByTestId("complaint-transition-status");
    await expect(select.locator("option")).toHaveCount(3); // 含「請選擇…」
    await select.selectOption("under_review");
    await page.getByTestId("complaint-transition-message").fill("已受理，開始調查。");
    await page.getByTestId("complaint-transition-submit").click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toMatchObject({
      status: "under_review",
      message: "已受理，開始調查。",
      visibleToBuyer: true,
    });
  });

  test("結案需要處理結果；未填時不打 API", async ({ page }) => {
    let called = false;
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [ADMIN_ROW] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: ADMIN_ROW, events: [], evidence: [] }),
      [`POST admin/complaints/${COMPLAINT_ID}/transition`]: (route) => {
        called = true;
        return json(route, {});
      },
    });
    await page.goto(`/admin/complaints?id=${COMPLAINT_ID}`);
    await page.getByTestId("complaint-transition-status").selectOption("closed");
    await page.getByTestId("complaint-transition-message").fill("結案");
    await page.getByTestId("complaint-transition-submit").click();
    await expect(page.getByTestId("complaint-action-feedback")).toContainText("處理結果");
    expect(called).toBe(false);
  });

  test("終態不顯示處理表單", async ({ page }) => {
    const closed = { ...ADMIN_ROW, status: "closed", overdue: false };
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [closed] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: closed, events: [], evidence: [] }),
    });
    await page.goto(`/admin/complaints?id=${COMPLAINT_ID}`);
    await expect(page.getByTestId("admin-complaint-terminal")).toBeVisible();
    await expect(page.getByTestId("admin-complaint-actions")).toHaveCount(0);
  });
});
