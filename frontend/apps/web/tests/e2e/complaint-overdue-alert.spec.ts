import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 逾期申訴告警 —— `P1-09` Gate 3 / Wave 2 #11。
 *
 * ## 這一支鎖的是什麼
 *
 * Wave 2 #10 讓 Admin **能夠**看申訴，但要先想到去看。
 * 本輪加的是「不用想到也會被告知」：dashboard attention surface。
 *
 * 三條不變條件：
 *
 *   1. **告警數字與 deep link 的集合來自同一個 backend 判準** ——
 *      dashboard 說幾件，點進去就是幾件。
 *   2. **沒有逾期就不顯示告警** —— 常駐一個「0 件逾期」只會鈍化它。
 *   3. **前端不做任何日期比較** —— 只渲染 backend 的 `overdue` / `daysUntilDue`。
 *      本檔刻意給「期限已過但 `overdue=false`」的 terminal fixture，
 *      如果前端偷偷自己比日期，那一條就會失敗。
 *
 * 對應規格：`docs/mvp_rules.md` §12.10.6b。
 */

const OVERDUE_ID = "cc_od_001";
const TERMINAL_ID = "cc_od_002";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

async function mockApi(page: Page, handlers: Handlers) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const bare = url.pathname.replace(/^\/api\/backend\//, "");
    const withQuery = bare + (url.search || "");
    const handler = handlers[`${request.method()} ${withQuery}`] ?? handlers[`${request.method()} ${bare}`];
    if (handler) return handler(route);
    return route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    });
  });
}

const json = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

function summary(overdueComplaintsCount: number) {
  return {
    periodFrom: "2026-07-29",
    periodTo: "2026-08-27",
    periodTimezone: "Asia/Taipei",
    periodPreset: "30d",
    periodRevenueAmount: 0,
    newOrdersCount: 0,
    newUsersCount: 0,
    newMaterialsCount: 0,
    newReviewsCount: 0,
    previousPeriodFrom: "2026-06-29",
    previousPeriodTo: "2026-07-28",
    previousPeriodRevenueAmount: 0,
    previousNewOrdersCount: 0,
    previousNewUsersCount: 0,
    previousNewMaterialsCount: 0,
    previousNewReviewsCount: 0,
    revenueDeltaPercent: null,
    newOrdersDeltaPercent: null,
    newUsersDeltaPercent: null,
    newMaterialsDeltaPercent: null,
    newReviewsDeltaPercent: null,
    materialsCount: 0,
    ordersCount: 0,
    revenueAmount: 0,
    reviewsCount: 0,
    usersCount: 0,
    pendingProofsCount: 0,
    pendingReportsCount: 0,
    actionableReportsCount: 0,
    overdueComplaintsCount,
    wowReviewDeltaPercent: null,
  };
}

const trends = { revenue: [], newUsers: [], granularity: "day", periodTimezone: "Asia/Taipei" };

/** 已逾期且仍需處理 —— backend 判定 `overdue: true`。 */
const OVERDUE_ROW = {
  id: OVERDUE_ID,
  buyer_id: "usr_b1",
  order_id: "ord_od_1",
  complaint_type: "payment",
  subject: "已匯款但訂單仍顯示未付款",
  statement: "8/10 已匯款。",
  status: "under_review",
  submitted_at: "2026-08-10T02:00:00Z",
  statutory_due_at: "2026-08-25T15:59:59.999Z",
  resolution_summary: null,
  related_remedy_case_id: null,
  overdue: true,
  daysUntilDue: -2,
};

/**
 * **期限早就過了，但 backend 判定 `overdue: false`**（已 resolved）。
 *
 * 這是本檔最重要的 fixture：如果前端偷偷用 `Date.now() > statutory_due_at`
 * 自己判斷，這一筆就會被誤標成逾期，測試會失敗。
 */
const TERMINAL_ROW = {
  ...OVERDUE_ROW,
  id: TERMINAL_ID,
  subject: "已處理完成的舊申訴",
  status: "resolved",
  statutory_due_at: "2026-08-01T15:59:59.999Z",
  resolution_summary: "已於 8/2 完成處理並回覆。",
  overdue: false,
  daysUntilDue: -26,
};

test.describe("admin overdue complaint alert", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { token: "e2e-admin-token", email: "admin@example.com" });
  });

  test("有逾期時 dashboard 顯示告警，數字來自 backend", async ({ page }) => {
    await mockApi(page, {
      "GET admin/dashboard/summary": (route) => json(route, summary(3)),
      "GET admin/dashboard/trends": (route) => json(route, trends),
    });
    await page.goto("/admin");

    const alert = page.getByTestId("overdue-complaints-alert");
    await expect(alert).toBeVisible();
    await expect(page.getByTestId("overdue-complaints-count")).toHaveText("3");
    await expect(alert).toContainText("十五日");
  });

  test("沒有逾期時**不顯示假警告**", async ({ page }) => {
    await mockApi(page, {
      "GET admin/dashboard/summary": (route) => json(route, summary(0)),
      "GET admin/dashboard/trends": (route) => json(route, trends),
    });
    await page.goto("/admin");
    await expect(page.getByTestId("admin-task-overview").or(page.locator("main"))).toBeVisible();
    await expect(page.getByTestId("overdue-complaints-alert")).toHaveCount(0);
  });

  test("點擊告警進入 overdue filtered queue", async ({ page }) => {
    await mockApi(page, {
      "GET admin/dashboard/summary": (route) => json(route, summary(1)),
      "GET admin/dashboard/trends": (route) => json(route, trends),
      "GET admin/complaints?overdue=1": (route) => json(route, { items: [OVERDUE_ROW] }),
      "GET admin/complaints": (route) => json(route, { items: [OVERDUE_ROW, TERMINAL_ROW] }),
    });
    await page.goto("/admin");
    await page.getByTestId("overdue-complaints-cta").click();

    await expect(page).toHaveURL(/\/admin\/complaints\?status=overdue/);
    await expect(page.getByTestId("admin-complaint-row")).toHaveCount(1);
    await expect(page.getByTestId("admin-complaint-row").first()).toContainText("已逾法定期限");
  });

  test("overdue queue 只顯示 backend 判定 overdue 的案件", async ({ page }) => {
    let requestedQuery = "";
    await mockApi(page, {
      "GET admin/complaints?overdue=1": (route) => {
        requestedQuery = new URL(route.request().url()).search;
        return json(route, { items: [OVERDUE_ROW] });
      },
    });
    await page.goto("/admin/complaints?status=overdue");
    await expect(page.getByTestId("admin-complaint-row")).toHaveCount(1);
    // **必須是 backend filter** —— 前端不得撈全部再自己過濾。
    expect(requestedQuery).toBe("?overdue=1");
    await expect(page.getByTestId("admin-complaint-row").first()).not.toContainText("已處理完成的舊申訴");
  });

  test("badge 與 deadline 正確；已逾期天數來自 backend", async ({ page }) => {
    await mockApi(page, {
      "GET admin/complaints?overdue=1": (route) => json(route, { items: [OVERDUE_ROW] }),
    });
    await page.goto("/admin/complaints?status=overdue");
    const deadline = page.getByTestId("complaint-deadline").first();
    await expect(deadline).toContainText("2026/08/25");
    await expect(deadline).toContainText("已逾期 2 天");
  });

  test("terminal complaint 期限雖已過，但不呈現 active overdue（前端不自行比日期）", async ({ page }) => {
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [TERMINAL_ROW] }),
      [`GET admin/complaints/${TERMINAL_ID}`]: (route) =>
        json(route, { complaint: TERMINAL_ROW, events: [], evidence: [] }),
    });
    await page.goto(`/admin/complaints?id=${TERMINAL_ID}`);

    // 先確認詳情真的渲染了 —— 否則下面的 `toHaveCount(0)` 會是空洞地通過。
    const detail = page.getByTestId("admin-complaint-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("已於 8/2 完成處理並回覆。");
    // 列表列不得出現逾期徽章。
    await expect(page.getByTestId("admin-complaint-row").first()).not.toContainText("已逾法定期限");
    // 詳情不得出現逾期橫幅 —— 即使 statutory_due_at 是 2026-08-01。
    await expect(page.getByTestId("complaint-overdue-banner")).toHaveCount(0);
  });

  test("active overdue 的詳情顯示逾期橫幅與法定期限", async ({ page }) => {
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [OVERDUE_ROW] }),
      [`GET admin/complaints/${OVERDUE_ID}`]: (route) =>
        json(route, { complaint: OVERDUE_ROW, events: [], evidence: [] }),
    });
    await page.goto(`/admin/complaints?id=${OVERDUE_ID}`);
    const banner = page.getByTestId("complaint-overdue-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("已逾法定處理期限 2 天");
    await expect(banner).toContainText("2026/08/25");
  });

  test("mobile：告警與 queue 皆無 horizontal overflow，CTA 未被裁切", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page, {
      "GET admin/dashboard/summary": (route) => json(route, summary(2)),
      "GET admin/dashboard/trends": (route) => json(route, trends),
      "GET admin/complaints?overdue=1": (route) => json(route, { items: [OVERDUE_ROW] }),
    });

    await page.goto("/admin");
    await expect(page.getByTestId("overdue-complaints-alert")).toBeVisible();
    const cta = page.getByTestId("overdue-complaints-cta");
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await page.goto("/admin/complaints?status=overdue");
    await expect(page.getByTestId("admin-complaint-row")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
