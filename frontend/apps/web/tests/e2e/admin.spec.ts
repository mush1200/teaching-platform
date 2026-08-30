import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";
import { ADMIN_ROUTES } from "./helpers/routes";

/** KPI / 待處理卡都是 `<article>`，以標籤定位單一張卡。 */
function kpi(page: Page, label: string) {
  return page.locator("article").filter({ hasText: label });
}

/**
 * 每個 preset 回不同的期間數字，讓測試能證明 range 真的傳到 API 而不是前端硬編。
 * `previousRevenue` 同時涵蓋三種 zero-denominator 情境：
 *   30d → 12000 vs 10000 → +20%
 *   7d  →  5000 vs  6000 → -17%（Math.round(-16.67)）
 *   today → 500 vs 0     → null → UI 顯示「前期無資料」
 */
const PERIOD_BY_PRESET: Record<
  string,
  { from: string; to: string; revenue: number; previousRevenue: number; orders: number; deltaPercent: number | null }
> = {
  today: { from: "2026-08-20", to: "2026-08-20", revenue: 500, previousRevenue: 0, orders: 1, deltaPercent: null },
  "7d": { from: "2026-08-14", to: "2026-08-20", revenue: 5000, previousRevenue: 6000, orders: 7, deltaPercent: -17 },
  "30d": { from: "2026-07-22", to: "2026-08-20", revenue: 12000, previousRevenue: 10000, orders: 30, deltaPercent: 20 },
  this_month: { from: "2026-08-01", to: "2026-08-20", revenue: 20000, previousRevenue: 20000, orders: 20, deltaPercent: 0 },
};

const PREVIOUS_BY_PRESET: Record<string, { from: string; to: string }> = {
  today: { from: "2026-08-19", to: "2026-08-19" },
  "7d": { from: "2026-08-07", to: "2026-08-13" },
  "30d": { from: "2026-06-22", to: "2026-07-21" },
  this_month: { from: "2026-07-01", to: "2026-07-20" },
};

function resolvePreset(params: URLSearchParams) {
  const range = params.get("range") ?? "30d";
  const from = params.get("from");
  const to = params.get("to");
  if (range === "custom" && from && to) {
    return {
      range,
      p: { from, to, revenue: 1234, previousRevenue: 1000, orders: 12, deltaPercent: 23 },
      prev: { from: "2026-07-24", to: "2026-08-02" },
    };
  }
  const key = PERIOD_BY_PRESET[range] ? range : "30d";
  return { range: key, p: PERIOD_BY_PRESET[key], prev: PREVIOUS_BY_PRESET[key] };
}

function summaryPayload(params: URLSearchParams) {
  const { range, p, prev } = resolvePreset(params);

  return {
    periodFrom: p.from,
    periodTo: p.to,
    periodTimezone: "Asia/Taipei",
    periodPreset: range,

    // Period metrics
    periodRevenueAmount: p.revenue,
    newOrdersCount: p.orders,
    newUsersCount: 5,
    newMaterialsCount: 4,
    newReviewsCount: 3,

    // Comparison — 由 Backend 算出，前端只顯示
    previousPeriodFrom: prev.from,
    previousPeriodTo: prev.to,
    previousPeriodRevenueAmount: p.previousRevenue,
    previousNewOrdersCount: 10,
    previousNewUsersCount: 5,
    previousNewMaterialsCount: 8,
    previousNewReviewsCount: 0,
    revenueDeltaPercent: p.deltaPercent,
    newOrdersDeltaPercent: -30,
    newUsersDeltaPercent: 0,
    newMaterialsDeltaPercent: -50,
    newReviewsDeltaPercent: null,

    // Snapshot / all-time — 對任何期間都必須是同一組數字
    materialsCount: 12,
    ordersCount: 34,
    revenueAmount: 5600,
    reviewsCount: 7,
    usersCount: 21,
    pendingProofsCount: 3,
    pendingReportsCount: 1,
    // 待辦 = pending(1) + investigating(4)；卡片必須讀這個，不是上面那個
    actionableReportsCount: 5,
    // 逾期申訴告警（Wave 2 #11）。既有 dashboard 測試的預設 fixture 維持 0 ——
    // **沒有逾期就不該出現告警**，這一點由 `complaint-overdue-alert.spec.ts` 正面驗證。
    overdueComplaintsCount: 0,
    wowReviewDeltaPercent: 25,
  };
}

/**
 * 兩期都沒有資料的 summary。
 *
 * Backend 對 `current = 0, previous = 0` 回傳 `deltaPercent = 0` —— 與「5 → 5 真的持平」
 * 拿到同一個值，因此 fixture 要把 `previous*` 一併歸零，UI 才有辦法分辨。
 */
function emptySummaryPayload(params: URLSearchParams) {
  return {
    ...summaryPayload(params),
    periodRevenueAmount: 0,
    newOrdersCount: 0,
    newUsersCount: 0,
    newMaterialsCount: 0,
    newReviewsCount: 0,
    previousPeriodRevenueAmount: 0,
    previousNewOrdersCount: 0,
    previousNewUsersCount: 0,
    previousNewMaterialsCount: 0,
    previousNewReviewsCount: 0,
    revenueDeltaPercent: 0,
    newOrdersDeltaPercent: 0,
    newUsersDeltaPercent: 0,
    newMaterialsDeltaPercent: 0,
    newReviewsDeltaPercent: 0,
  };
}

/** 與 Backend 相同的粒度規則：單日→hour、2–90 天→day、91 天以上→month。 */
function trendsPayload(params: URLSearchParams) {
  const { range, p } = resolvePreset(params);
  const granularity = p.from === p.to ? "hour" : "day";
  const keys =
    granularity === "hour"
      ? Array.from({ length: 24 }, (_, h) => `${p.from}T${String(h).padStart(2, "0")}`)
      : enumerateDays(p.from, p.to);

  // 只有第一個 bucket 有值，其餘補 0 —— 用來驗證 UI 不會把「全 0」當成「無資料」。
  return {
    periodFrom: p.from,
    periodTo: p.to,
    periodTimezone: "Asia/Taipei",
    periodPreset: range,
    granularity,
    revenue: keys.map((key, i) => ({ key, value: i === 0 ? p.revenue : 0 })),
    orders: keys.map((key, i) => ({ key, value: i === 0 ? p.orders : 0 })),
  };
}

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const toEpoch = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  for (let t = toEpoch(from); t <= toEpoch(to); t += 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

type CallCounts = {
  summary: number;
  trends: number;
  materials: number;
  orders: number;
  activityLogs: number;
  /** 每次 `admin/activity-logs` 請求實際帶出去的 `action` 參數（IA-05 的 allowlist）。 */
  activityActions: string[];
  /** 每次 `admin/orders` 請求實際帶出去的 `status` 參數（IA-04 的 attention 篩選）。 */
  orderStatuses: string[];
};

type MockOptions = {
  summaryOk?: boolean;
  trendsOk?: boolean;
  /** 依 preset 延遲回應，用來製造 stale response 情境。 */
  delayByPreset?: Record<string, number>;
  /**
   * 本期與前期**都是 0**（Backend 的 `computeDeltaPercent(0, 0)` 回傳 `0`）。
   * 用來驗證 UI 把「兩期都沒有資料」與「有資料但持平」分開顯示。
   */
  emptyPeriod?: boolean;
  /**
   * 沒有任何需要注意的訂單／活動 —— 這是**好消息**，不是錯誤態。
   * 用來驗證兩張卡的 empty state 說得出「都處理完了」，而不是「查無資料」。
   */
  emptyAttention?: boolean;
};

/**
 * Admin Dashboard 的最小 API fixture。
 *
 * 回傳的計數器可用來斷言「切換期間時只有期間相關端點重新請求」。
 * `summaryOk` / `trendsOk` 可各自失敗，用來驗證兩支 endpoint 的錯誤狀態互不牽連。
 */
/**
 * Dashboard feed 的訂單 fixture。
 *
 * `operational_status` 是 Backend 衍生欄位（`services/adminOrders.service.js`），
 * 與 `orders.status` 刻意不一致 —— 三筆 `pending_payment` 落在三個不同的 operational
 * bucket，正是這個欄位存在的理由。
 */
const ADMIN_ORDER_FEED_FIXTURES = [
  // 時間上最新，但已核准 → 不是「需要注意」的訂單。
  { id: "ord_newest_approved", user_id: "usr_1", status: "approved", operational_status: "approved", total_amount: 999, created_at: "2026-08-20T00:00:00.000Z" },
  { id: "ord_attention_review", user_id: "usr_2", status: "pending_payment", operational_status: "pending_review", total_amount: 200, created_at: "2026-08-19T00:00:00.000Z" },
  { id: "ord_attention_rejected", user_id: "usr_3", status: "pending_payment", operational_status: "payment_rejected", total_amount: 300, created_at: "2026-08-18T00:00:00.000Z" },
  // 球在買家手上（還沒上傳憑證）→ 不是 Admin 的待辦。
  { id: "ord_awaiting", user_id: "usr_4", status: "pending_payment", operational_status: "awaiting_payment", total_amount: 111, created_at: "2026-08-17T00:00:00.000Z" },
] as const;

/** Dashboard feed 的活動 fixture。前兩筆在 allowlist 內，後兩筆是刻意混入的常態事件。 */
const ACTIVITY_FEED_FIXTURES = [
  {
    id: "1",
    action: "payment_proof.rejected",
    actor_role: "admin",
    actor_email: "admin-e2e@example.com",
    target_type: "order",
    target_id: "ord_attention_rejected",
    target_label: "ord_attention_rejected",
    created_at: "2020-01-04T00:00:00.000Z",
  },
  {
    id: "2",
    action: "material.unpublished",
    actor_role: "admin",
    actor_email: "admin-e2e@example.com",
    target_type: "material",
    target_id: "mat_b",
    target_label: "已上架教材",
    created_at: "2020-01-03T00:00:00.000Z",
  },
  {
    id: "3",
    action: "payment_proof.approved",
    actor_role: "admin",
    actor_email: "admin-e2e@example.com",
    target_type: "order",
    target_id: "ord_newest_approved",
    target_label: "ord_newest_approved",
    created_at: "2020-01-02T00:00:00.000Z",
  },
  {
    id: "4",
    action: "cart.added",
    actor_role: "buyer",
    actor_email: "buyer@example.com",
    target_type: "material",
    target_id: "mat_a",
    target_label: "待審教材",
    created_at: "2020-01-01T00:00:00.000Z",
  },
] as const;

async function mockAdminDashboardApis(page: Page, opts: MockOptions = {}): Promise<CallCounts> {
  const { summaryOk = true, trendsOk = true, delayByPreset, emptyPeriod = false, emptyAttention = false } = opts;
  const calls: CallCounts = {
    summary: 0,
    trends: 0,
    materials: 0,
    orders: 0,
    activityLogs: 0,
    activityActions: [],
    orderStatuses: [],
  };

  const json = (route: Route, payload: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

  await page.route("**/api/backend/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");

    if (path === "admin/dashboard/summary" || path === "admin/dashboard/trends") {
      const isTrends = path.endsWith("trends");
      if (isTrends) calls.trends += 1;
      else calls.summary += 1;

      const delay = delayByPreset?.[url.searchParams.get("range") ?? "30d"];
      if (delay) await new Promise((r) => setTimeout(r, delay));

      if (isTrends) {
        if (!trendsOk) return json(route, { message: "server error" }, 500);
        return json(route, trendsPayload(url.searchParams));
      }
      if (!summaryOk) return json(route, { message: "server error" }, 500);
      return json(route, emptyPeriod ? emptySummaryPayload(url.searchParams) : summaryPayload(url.searchParams));
    }

    if (path === "admin/materials") {
      calls.materials += 1;
      /*
       * `GET /admin/materials` 現在是 server-side 分頁，且回傳 `statusCounts`（**全表**計數）。
       * Dashboard 的教材 KPI 讀的是 `statusCounts`，不是 `items` ——
       * 拿一頁的 items 自己 `filter().length` 在教材超過一頁時會算出錯的數字。
       */
      return json(route, {
        items: [
          { id: "mat_a", title: "待審教材", status: "pending_review", created_at: "2026-08-01T00:00:00.000Z" },
          { id: "mat_b", title: "已上架教材", status: "published", created_at: "2026-07-01T00:00:00.000Z" },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        statusCounts: { total: 2, pending_review: 1, published: 1, unpublished: 0 },
      });
    }

    if (path === "admin/orders") {
      calls.orders += 1;
      /*
       * Dashboard 的「需要注意的訂單」（IA-04）用 Backend 既有的 `?status=` 篩選，
       * 篩的是 **operational_status**（`orders.status` + 付款憑證衍生），不是 `orders.status`。
       *
       * fixture 刻意讓兩者不一致：`ord_newest_approved` 是**時間上最新**的一筆，
       * 但它已核准 —— 舊的 latest-N feed 會把它排在第一，attention feed 必須看不到它。
       * 若哪天有人改回「抓全部再前端切前 N 筆」，這一條會立刻失敗。
       */
      const status = url.searchParams.get("status");
      calls.orderStatuses.push(status ?? "");
      const source = emptyAttention ? [] : ADMIN_ORDER_FEED_FIXTURES;
      const items = status ? source.filter((o) => o.operational_status === status) : source;
      return json(route, { items });
    }

    if (path.startsWith("admin/activity-logs")) {
      calls.activityLogs += 1;
      /*
       * 「需要注意的活動」（IA-05）把 allowlist 送給 API（逗號分隔多值）。
       * 這裡照後端的語意過濾：沒帶 `action` 就全部回，帶了就只回這一組。
       * fixture 混入 `payment_proof.approved` 與 `cart.added` 兩筆常態事件，
       * 用來證明 widget 是**經過挑選**的，不是把最新 N 筆照單全收。
       *
       * 所有時間都遠早於「今天」：這一區不受期間控制，不得被任何日期條件濾掉。
       */
      const requested = (url.searchParams.get("action") ?? "").split(",").filter(Boolean);
      calls.activityActions.push(url.searchParams.get("action") ?? "");
      const source = emptyAttention ? [] : ACTIVITY_FEED_FIXTURES;
      const items = requested.length ? source.filter((row) => requested.includes(row.action)) : source;
      return json(route, {
        items,
        pagination: { page: 1, limit: 8, total: items.length, totalPages: 1 },
      });
    }

    return json(route, { items: [] });
  });

  return calls;
}

test.describe("Admin Pages", () => {
  // cookie + localStorage 都要設；只設 localStorage 會被 middleware 導向 /login，
  // 所有 admin 測試就會在登入頁上通過，實際上什麼都沒驗到。
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    // AdminShell 掛載時會打 `auth/me`（`DX-04` 的 session 探測）——
    // 不 mock 它就會落到真實後端、假 token 換回 401，整頁被導向 /login。
    await installShellBootstrapMocks(page);
  });

  test("admin dashboard skeleton", async ({ page }) => {
    await page.goto("/admin");
    await test.step("dashboard widgets visible", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 這一步只驗「頁面有渲染」。更強的斷言已經在本檔其他 test：
       *   - KPI 標籤／數值、比較期、不可用時的呈現 → 「admin dashboard statistics semantics」、
       *     「admin dashboard KPI comparison」、「…shows unavailable KPIs…」
       *   - 待辦清單 → 「dashboard attention orders…」兩支（「最近訂單」已於 `IA-04` 改為
       *     「需要注意的訂單」，依 `operational_status` 篩選，不再是「最近 N 筆」）
       * 這裡不重複測。
       */
    });
  });

  test("admin material/order/report/payment-proof pages skeleton", async ({ page }) => {
    // 多條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    const routes = ["/admin/materials", "/admin/orders", "/admin/reports", "/admin/payment-proofs"] as const;
    for (const route of routes) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page.getByRole("main")).toBeVisible();
      });
    }
    await test.step("admin list interactions（皆已有專屬覆蓋）", async () => {
      /*
       * 這三件事都已經有比這裡更強的專屬測試，不在這支 skeleton 重複：
       *   - 教材頁通往檢舉／活動紀錄 → `admin-operations.spec.ts`
       *     「shows the material's cases and links to the real case queue」、
       *     「case detail leads to the reported material's activity timeline」
       *   - 訂單狀態篩選 → 本檔 describe「Admin Orders operational filter」
       *   - 付款憑證 approve／reject → `admin-operations.spec.ts` 的
       *     「approve posts to the approve endpoint」、「rejection requires a reason…」、
       *     「reason "other" requires a note…」
       *
       * **原本這裡還有一條「reports mark-reviewed button updates row state」** ——
       * 該按鈕已於 2026-08-23 隨檢舉案件 workflow 收斂而移除（legacy `reviewed` 現在是
       * 唯讀終態，見 `docs/mvp_rules.md` §6）。**不得為了這條待補斷言把舊 UI 加回來**；
       * 目前正確的行為由 `admin-operations.spec.ts`
       * 「legacy reviewed cases render as closed, not as broken rows」覆蓋。
       */
    });
  });

  test("admin activity logs and detail skeleton", async ({ page }) => {
    await test.step("activity log list", async () => {
      await page.goto("/admin/activity-logs");
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 篩選（自由文字搜尋、action／actor-role 下拉、日期）已由
       * `admin-operations.spec.ts` 的「primary search is free text…」與
       * 「action and actor-role dropdowns come from the API, and dates filter」覆蓋。
       * **分頁**先前沒有任何覆蓋 —— 下面就地補上。
       */
    });

    await test.step("activity log 分頁：換頁真的送到 API，而且換到的是新內容", async () => {
      const requestedPages: string[] = [];
      await page.route("**/api/backend/admin/activity-logs**", (route) => {
        const url = new URL(route.request().url());
        const pageParam = url.searchParams.get("page") ?? "1";
        requestedPages.push(pageParam);
        return route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            items: [
              {
                id: `log_p${pageParam}`,
                action: "order.created",
                actor_role: "admin",
                actor_email: "admin@example.com",
                target_type: "order",
                target_id: `ord_p${pageParam}`,
                target_label: `第 ${pageParam} 頁的紀錄`,
                created_at: "2026-08-20T03:00:00.000Z",
                meta: {},
              },
            ],
            pagination: { page: Number(pageParam), limit: 20, total: 40, totalPages: 2 },
            filters: { actions: ["order.created"], actorRoles: ["admin"] },
          }),
        });
      });

      await page.goto("/admin/activity-logs");
      await expect(page.getByText("第 1 頁的紀錄")).toBeVisible();

      await page.getByRole("button", { name: "下一頁" }).click();

      // 換頁是 server-side：page=2 必須真的送到 API，且畫面換成第 2 頁的內容
      await expect(page.getByText("第 2 頁的紀錄")).toBeVisible();
      await expect(page.getByText("第 1 頁的紀錄")).toHaveCount(0);
      expect(requestedPages).toContain("2");
    });

    await test.step("activity log detail", async () => {
      await page.goto("/admin/activity-logs/log_mock_001");
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 這兩條的前提都已經不成立或已被覆蓋：
       *   - 「metadata JSON block」**已不存在** —— `IA-02` 之後 meta 是三層人話化呈現，
       *     明確不是 raw payload dump（`admin-operations.spec.ts`
       *     「the single-record page uses the same three layers, not a raw payload dump」）。
       *   - entity 關聯連結 → 同檔「entity timelines read the same way as the global list」，
       *     以及「case detail leads to the reported material's activity timeline」。
       */
    });
  });

  test("admin scoped activity/report pages skeleton", async ({ page }) => {
    // 多條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    const scopedRoutes = [
      "/admin/users/usr_mock_001/activity-logs",
      "/admin/orders/ord_mock_001/activity-logs",
      "/admin/materials/mat_mock_001/activity-logs",
      "/admin/materials/mat_mock_001/reports",
    ] as const;
    for (const route of scopedRoutes) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page.getByRole("main")).toBeVisible();
      });
    }
    await test.step("scoped page interactions（皆已有專屬覆蓋或前提已不存在）", async () => {
      /*
       *   - 「只顯示該 id 的紀錄」→ `admin-operations.spec.ts`
       *     「entity timelines read the same way as the global list」與
       *     「material context shows only this material's teaching feedback, read-only」。
       *   - 「material reports 的 source switch 在兩個 API 之間切換」→ **前提已不存在**：
       *     `/admin/materials/:id/reports` 現在是 contextual read-only，沒有切換器，
       *     也不得有任何案件處置（`docs/mvp_rules.md` §6、`admin-information-architecture.md` §9）。
       *     覆蓋見同檔「shows the material's cases and links to the real case queue — no disposition here」。
       *   - 「mark-reviewed 狀態更新與回饋」→ **該按鈕已於 2026-08-23 移除**，
       *     legacy `reviewed` 是唯讀終態；**不得把舊 UI 加回來**。
       *     覆蓋見同檔「legacy reviewed cases are shown as legacy, not as a normal resolution」。
       */
    });
  });

  test("admin static pages skeleton", async ({ page }) => {
    // 多條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    const staticRoutes = ["/admin/users", "/admin/settings", "/admin/reviews-hub"] as const;
    for (const route of staticRoutes) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page.getByRole("main")).toBeVisible();
      });
    }

    /*
     * `/admin/reviews-hub` 已不在側欄（`IA-01`），但 route 保留為相容入口：
     * 直接開仍要正常渲染、維持唯讀，且不得再表現成一個待處理佇列。
     */
    await test.step("reviews-hub stays reachable and read-only", async () => {
      await page.goto("/admin/reviews-hub");
      await expect(page.getByRole("heading", { level: 1, name: "教學回饋總覽" })).toBeVisible();
      await expect(page.getByText("這一頁不在側欄裡")).toBeVisible();
      await expect(page.getByRole("button", { name: "隱藏" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "刪除" })).toHaveCount(0);
    });

    /*
     * `IA-07`：兩個 placeholder 已不在側欄，但 route **保留可直達** ——
     * 移出導覽不等於刪 route，既有書籤與內部連結不能斷。
     * 直接開啟時要正常渲染、誠實說明能力邊界，且不得長出假的管理動作。
     */
    await test.step("users placeholder stays reachable and stays honest", async () => {
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { level: 1, name: "用戶管理" })).toBeVisible();
      await expect(page.getByText("這一頁不在側欄裡")).toBeVisible();
      await expect(page.getByRole("link", { name: "前往活動紀錄" })).toBeVisible();
      for (const fake of ["停權", "刪除", "編輯角色"]) {
        await expect(page.getByRole("button", { name: fake })).toHaveCount(0);
      }
      await expect(page.getByRole("table")).toHaveCount(0);
    });

    await test.step("settings placeholder stays reachable and stays honest", async () => {
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { level: 1, name: "系統設定" })).toBeVisible();
      await expect(page.getByText("這一頁不在側欄裡")).toBeVisible();
      // 沒有資料模型支撐的設定表單一律不做（Admin Design Principle 8）。
      await expect(page.getByRole("button", { name: "儲存" })).toHaveCount(0);
      await expect(page.locator("form")).toHaveCount(0);
    });

    /*
     * 依人查詢的入口不得因為 `/admin/users` 移出側欄而斷掉 ——
     * `/admin/users/:userId/activity-logs` 是巢狀 route，與上面那一頁是兩件事。
     */
    await test.step("per-user activity log route survives the sidebar removal", async () => {
      await page.goto("/admin/users/usr_mock_001/activity-logs");
      await expect(page.getByRole("main")).toBeVisible();
    });
  });

  /**
   * 統計語意驗收（見 docs/mvp_rules.md §15）。
   * 這些斷言鎖的是「數字代表什麼、期間控制到哪裡」，不是版面樣式。
   */
  test("admin dashboard statistics semantics", async ({ page }) => {
    await mockAdminDashboardApis(page);
    await page.goto("/admin");

    await test.step("預設期間為近 30 天，區間文字採用 API 回傳的 metadata", async () => {
      await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("admin-period-label")).toContainText("2026/07/22 – 2026/08/20");
      await expect(page.getByTestId("admin-period-label")).toContainText("Asia/Taipei");
    });

    await test.step("本期表現為 period metrics", async () => {
      await expect(kpi(page, "營收")).toContainText("NT$ 12,000");
      await expect(kpi(page, "營收")).toContainText("所選期間已核准");
      await expect(kpi(page, "新增訂單")).toContainText("30");
      await expect(kpi(page, "新增用戶")).toContainText("5");
      await expect(kpi(page, "新增教材")).toContainText("4");
      await expect(kpi(page, "新增教學回饋")).toContainText("3");
    });

    await test.step("平台摘要為 all-time／snapshot", async () => {
      await expect(kpi(page, "教材總數")).toContainText("12");
      await expect(kpi(page, "訂單總數")).toContainText("34");
      await expect(kpi(page, "用戶總數")).toContainText("21");
      await expect(kpi(page, "教學回饋總數")).toContainText("7");
      // 已發布教材不在 summary 內，由 /admin/materials 就地統計（fixture 中 1 筆 published）。
      await expect(kpi(page, "已發布教材")).toContainText("1");
    });

    await test.step("all-time 卡不得使用期間文案", async () => {
      await expect(page.getByText("本期累計")).toHaveCount(0);
      for (const label of ["教材總數", "訂單總數", "用戶總數", "教學回饋總數"]) {
        await expect(kpi(page, label)).toContainText("歷來累計");
      }
      // 營收已成為期間指標，平台摘要不再並列 all-time 成交金額。
      await expect(page.getByText("成交金額")).toHaveCount(0);
    });

    await test.step("移除無資料來源／語意不符的指標", async () => {
      await expect(page.getByText("異常訂單")).toHaveCount(0);
      await expect(page.getByText("較上週", { exact: false })).toHaveCount(0);
    });

    await test.step("待處理卡為 current snapshot", async () => {
      await expect(page.getByRole("heading", { name: "目前待處理" })).toBeVisible();
      await expect(kpi(page, "待審核付款憑證")).toContainText("3");
      /*
       * 待處理檢舉讀的是 `actionableReportsCount`（pending + investigating），
       * **不是** `pendingReportsCount`。fixture 刻意讓兩者不同（1 vs 5）：
       * 若哪天有人改回舊欄位，這條會立刻失敗。
       */
      await expect(kpi(page, "待處理檢舉")).toContainText("5");
      await expect(kpi(page, "待處理檢舉")).not.toContainText("請盡快判斷");
    });

    await test.step("待處理卡的連結與卡片語意一致", async () => {
      // 點進去要看到「待我處理」那一組，不是全部未結案
      const card = kpi(page, "待處理檢舉");
      await expect(card.getByRole("link").first()).toHaveAttribute("href", "/admin/reports?status=actionable");
      await expect(kpi(page, "待審核教材").getByRole("link").first()).toHaveAttribute(
        "href",
        "/admin/materials?status=pending_review"
      );
      await expect(kpi(page, "待審核付款憑證").getByRole("link").first()).toHaveAttribute(
        "href",
        "/admin/payment-proofs?status=pending"
      );
    });

    await test.step("需要注意的訂單／活動為 current snapshot，不做前端日期過濾", async () => {
      // fixture 的活動時間全在 2020 年，遠早於所選期間；不得被任何日期條件濾掉。
      await expect(page.getByTestId("attention-order-row")).toHaveCount(2);
      await expect(page.getByTestId("attention-activity-row")).toHaveCount(2);
    });
  });

  /**
   * IA-04 —— Dashboard「需要注意的訂單」。
   *
   * 鎖的是「這張卡挑的是待辦，不是最新資料」：挑選條件必須來自 Backend 既有的
   * `operational_status`（`?status=` 查詢），不是前端對 `orders.status` 的再判讀，
   * 也不是把最新 N 筆照單全收。
   */
  test("dashboard attention orders: 依 operational_status 挑選，且導向既有付款審核", async ({ page }) => {
    // 最後一步會導覽到另一條 admin 路由；dev server 需要 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    const calls = await mockAdminDashboardApis(page);
    await page.goto("/admin");

    await test.step("標題與資訊層級：不再是「最近訂單」", async () => {
      await expect(page.getByRole("heading", { name: "需要注意的訂單" })).toBeVisible();
      await expect(page.getByText("最近訂單", { exact: true })).toHaveCount(0);
    });

    await test.step("挑選發生在 API：只查 attention 狀態，不抓全部訂單回來自己切", async () => {
      await expect(page.getByTestId("attention-order-row").first()).toBeVisible();
      expect([...calls.orderStatuses].sort()).toEqual(["payment_rejected", "pending_review"]);
      // 沒有一次「不帶 status」的全表查詢 —— 那正是 IA-06 加分頁後會算錯的寫法。
      expect(calls.orderStatuses).not.toContain("");
    });

    await test.step("只顯示 pending_review 與 payment_rejected", async () => {
      const rows = page.getByTestId("attention-order-row");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toContainText("ord_attention_review");
      await expect(rows.nth(1)).toContainText("ord_attention_rejected");
    });

    await test.step("時間上最新但不需處理的訂單不得出現", async () => {
      // 已核准 —— 舊的 latest-N feed 會把它排第一。
      await expect(page.getByText("ord_newest_approved")).toHaveCount(0);
      // 球在買家手上（尚未上傳憑證）—— 不是 Admin 的待辦。
      await expect(page.getByText("ord_awaiting")).toHaveCount(0);
    });

    await test.step("徽章讀 operational_status，與 /admin/orders 同一份文案", async () => {
      const rows = page.getByTestId("attention-order-row");
      await expect(rows.nth(0)).toContainText("待審核");
      await expect(rows.nth(1)).toContainText("付款被退回");
      // `orders.status` 的原始值不得外洩到畫面上。
      await expect(page.getByText("pending_payment")).toHaveCount(0);
    });

    await test.step("每一列連到既有的付款審核（status=all 才看得到被退回的憑證）", async () => {
      const link = page.getByTestId("attention-order-row").nth(1).getByRole("link").first();
      await expect(link).toHaveAttribute(
        "href",
        "/admin/payment-proofs?status=all&q=ord_attention_rejected",
      );
      await link.click();
      /*
       * timeout 放寬到 60s：dev server 的 `/admin/payment-proofs` 是 on-demand 編譯，
       * 冷路由的第一次導覽在本機實測要 15–40 秒（見 playwright.config.ts 的說明）。
       * 這是環境成本，不是 CTA 壞掉 —— production build 下不會發生。
       */
      await expect(page).toHaveURL(/\/admin\/payment-proofs\?status=all&q=ord_attention_rejected/, {
        timeout: 60_000,
      });
    });
  });

  test("dashboard attention orders: 沒有待辦時說得出「處理完了」，不是查無資料", async ({ page }) => {
    await mockAdminDashboardApis(page, { emptyAttention: true });
    await page.goto("/admin");

    await expect(page.getByText("目前沒有需要注意的訂單")).toBeVisible();
    await expect(page.getByText("目前沒有需要注意的活動")).toBeVisible();
    // KPI 與待處理卡照常 —— 兩張 feed 為空不代表整頁失敗。
    await expect(kpi(page, "營收")).toContainText("NT$ 12,000");
    await expect(kpi(page, "待審核付款憑證")).toContainText("3");
  });

  /**
   * IA-05 —— Dashboard「需要注意的活動」。
   *
   * 鎖三件事：allowlist 由 API 篩（不是前端切 window）、文案走全站共用的
   * `describeActivity()`、每一列連得回既有的 entity 紀錄。
   */
  test("dashboard attention activity: allowlist 由 API 篩選、人話化並可導航", async ({ page }) => {
    // 最後一步會導覽到另一條 admin 路由；dev server 需要 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    const calls = await mockAdminDashboardApis(page);
    await page.goto("/admin");

    await test.step("標題與資訊層級：不再是「最近活動」", async () => {
      await expect(page.getByRole("heading", { name: "需要注意的活動" })).toBeVisible();
      await expect(page.getByText("最近活動", { exact: true })).toHaveCount(0);
    });

    await test.step("allowlist 送到 API，不是抓一大頁回前端自己 filter", async () => {
      await expect(page.getByTestId("attention-activity-row").first()).toBeVisible();
      expect(calls.activityActions.length).toBeGreaterThan(0);
      const sent = calls.activityActions[0].split(",");
      // 清單內容由 lib/admin-labels.ts 定義；這裡驗的是「它真的被送出去了」。
      expect(sent).toContain("payment_proof.rejected");
      expect(sent).toContain("material.unpublished");
      expect(sent).toContain("download.denied");
      expect(sent).not.toContain("payment_proof.approved");
      expect(sent).not.toContain("cart.added");
    });

    await test.step("raw event code 不得出現在第一層", async () => {
      for (const raw of ["payment_proof.rejected", "material.unpublished", "cart.added", "admin", "teacher"]) {
        await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
      }
    });

    await test.step("套用 describeActivity() 的中文句子與對象", async () => {
      const rows = page.getByTestId("attention-activity-row");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toContainText("管理員 admin-e2e@example.com退回了付款憑證");
      await expect(rows.nth(0)).toContainText("訂單：ord_attention_rejected");
      await expect(rows.nth(1)).toContainText("管理員 admin-e2e@example.com下架了教材");
      await expect(rows.nth(1)).toContainText("教材：已上架教材");
    });

    await test.step("allowlist 外的常態事件不出現", async () => {
      await expect(page.getByText("核准了付款")).toHaveCount(0);
      await expect(page.getByText("把教材加入購物車")).toHaveCount(0);
    });

    await test.step("每一列連到該對象既有的活動紀錄", async () => {
      const rows = page.getByTestId("attention-activity-row");
      await expect(rows.nth(0).getByRole("link")).toHaveAttribute(
        "href",
        "/admin/orders/ord_attention_rejected/activity-logs",
      );
      await expect(rows.nth(1).getByRole("link")).toHaveAttribute(
        "href",
        "/admin/materials/mat_b/activity-logs",
      );
      await rows.nth(1).getByRole("link").click();
      // 同上：冷路由的 on-demand 編譯時間，不是導航失敗。
      await expect(page).toHaveURL(/\/admin\/materials\/mat_b\/activity-logs/, { timeout: 60_000 });
    });
  });

  /**
   * 兩張卡在 375px（chromium-mobile project）不得橫向溢出，
   * 且關鍵資訊（狀態徽章、活動句子）不得被裁掉。桌機跑同一條也不會錯。
   */
  test("dashboard attention cards stay within the viewport", async ({ page }) => {
    await mockAdminDashboardApis(page);
    await page.goto("/admin");

    await expect(page.getByTestId("attention-order-row")).toHaveCount(2);
    await expect(page.getByTestId("attention-activity-row")).toHaveCount(2);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // 狀態徽章與活動句子在窄螢幕仍必須看得到，不能被 truncate 成空白。
    await expect(page.getByTestId("attention-order-row").nth(0)).toContainText("待審核");
    await expect(page.getByTestId("attention-activity-row").nth(0)).toContainText("退回了付款憑證");
    // CTA 不得在 mobile 消失。
    await expect(page.getByTestId("attention-order-row").nth(0).getByRole("link").first()).toBeVisible();
  });

  test("reporting range: preset switch drives URL and period metrics only", async ({ page }) => {
    const calls = await mockAdminDashboardApis(page);
    await page.goto("/admin");
    await expect(kpi(page, "營收")).toContainText("NT$ 12,000");

    const staticCallsBefore = calls.materials + calls.orders + calls.activityLogs;

    await test.step("切到近 7 天：URL 與 period metrics 都更新", async () => {
      await page.getByRole("button", { name: "近 7 天" }).click();
      await expect(page).toHaveURL(/\?range=7d/);
      await expect(kpi(page, "營收")).toContainText("NT$ 5,000");
      await expect(kpi(page, "新增訂單")).toContainText("7");
      await expect(page.getByTestId("admin-period-label")).toContainText("2026/08/14 – 2026/08/20");
    });

    await test.step("snapshot 與 latest-N feed 不受期間影響", async () => {
      await expect(kpi(page, "訂單總數")).toContainText("34");
      await expect(kpi(page, "用戶總數")).toContainText("21");
      await expect(kpi(page, "待審核付款憑證")).toContainText("3");
      await expect(page.getByRole("table")).toContainText("ord_attention_review");
    });

    await test.step("切期間不重新載入與期間無關的端點", async () => {
      expect(calls.materials + calls.orders + calls.activityLogs).toBe(staticCallsBefore);
      expect(calls.summary).toBeGreaterThan(1);
    });

    await test.step("上一頁回到前一個期間", async () => {
      await page.goBack();
      await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(kpi(page, "營收")).toContainText("NT$ 12,000");
    });
  });

  test("reporting range: custom range survives reload and rejects invalid input", async ({ page }) => {
    const calls = await mockAdminDashboardApis(page);
    await page.goto("/admin?range=custom&from=2026-08-01&to=2026-08-10");

    await expect(page.getByRole("button", { name: "自訂" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("admin-period-label")).toContainText("2026/08/01 – 2026/08/10");
    await expect(kpi(page, "營收")).toContainText("NT$ 1,234");
    // 已套用的 custom 期間維持 compact：日期輸入列只在點「自訂」進入編輯態時展開。
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await page.getByRole("button", { name: "自訂" }).click();
    await expect(page.locator('input[type="date"]')).toHaveCount(2);

    await test.step("reload 後仍保留", async () => {
      await page.reload();
      await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
      await expect(page.getByTestId("admin-period-label")).toContainText("2026/08/01 – 2026/08/10");
    });

    await test.step("結束日期不可選未來（max 綁台北今日）", async () => {
      // reload 後回到 compact 狀態，需要重新進入編輯態。
      await page.getByRole("button", { name: "自訂" }).click();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
      await expect(page.locator('input[type="date"]').nth(1)).toHaveAttribute("max", today);
    });

    await test.step("from 晚於 to 時顯示 inline error 且不送 API", async () => {
      const before = calls.summary;
      await page.locator('input[type="date"]').first().fill("2026-08-15");
      await page.getByRole("button", { name: "套用" }).click();
      await expect(page.getByText("開始日期不可晚於結束日期。")).toBeVisible();
      expect(calls.summary).toBe(before);
    });
  });

  /**
   * 自訂日期編輯列的展開／收合（與 Creator 共用 `ReportingRangeSelector`）。
   * 鎖住的是狀態機不是像素：「目前生效的 range」與「正在編輯」是兩個狀態，
   * URL 只在按下「套用」時才變。
   */
  test.describe("自訂日期編輯列", () => {
    const editor = (page: Page) => page.getByTestId("reporting-custom-editor");
    const customBtn = (page: Page) => page.getByRole("button", { name: "自訂" });

    test("點自訂只展開編輯列，不改 URL 也不送 API", async ({ page }) => {
      const calls = await mockAdminDashboardApis(page);
      await page.goto("/admin");
      await expect(kpi(page, "營收")).toContainText("NT$ 12,000");
      const before = calls.summary;

      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();
      await expect(customBtn(page)).toHaveAttribute("aria-expanded", "true");
      // 生效中的 range 還是近 30 天，active 樣式不得提前跳到「自訂」。
      await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(customBtn(page)).toHaveAttribute("aria-pressed", "false");
      await expect(page).toHaveURL(/\/admin$/);
      expect(calls.summary).toBe(before);
      // 初始值取目前生效期間，不是空白。
      await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-07-22");
      await expect(page.locator('input[type="date"]').nth(1)).toHaveValue("2026-08-20");
    });

    test("套用後 URL 更新、編輯列收起、KPI 與兩張趨勢圖都在", async ({ page }) => {
      await mockAdminDashboardApis(page);
      await page.goto("/admin");
      await expect(kpi(page, "營收")).toContainText("NT$ 12,000");

      await customBtn(page).click();
      await page.locator('input[type="date"]').first().fill("2026-08-01");
      await page.locator('input[type="date"]').nth(1).fill("2026-08-10");
      await page.getByRole("button", { name: "套用" }).click();

      await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
      await expect(editor(page)).toHaveCount(0);
      await expect(customBtn(page)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("admin-period-label")).toContainText("2026/08/01 – 2026/08/10");
      // custom 期間下 KPI 與兩張趨勢圖都必須照常呈現。
      await expect(kpi(page, "營收")).toContainText("NT$ 1,234");
      await expect(kpi(page, "新增訂單")).toContainText("12");
      await expect(page.getByRole("img", { name: "營收趨勢" })).toBeVisible();
      await expect(page.getByRole("img", { name: "新增訂單趨勢" })).toBeVisible();
    });

    test("再次點自訂帶回目前生效的日期，不 reset 成空白或今日", async ({ page }) => {
      const calls = await mockAdminDashboardApis(page);
      await page.goto("/admin?range=custom&from=2026-08-01&to=2026-08-10");
      await expect(kpi(page, "營收")).toContainText("NT$ 1,234");
      const before = calls.summary;

      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();
      await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-08-01");
      await expect(page.locator('input[type="date"]').nth(1)).toHaveValue("2026-08-10");
      await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
      expect(calls.summary).toBe(before);
    });

    test("編輯中切到其他 preset 會收起編輯列並套用該 preset", async ({ page }) => {
      await mockAdminDashboardApis(page);
      await page.goto("/admin?range=custom&from=2026-08-01&to=2026-08-10");
      await expect(kpi(page, "營收")).toContainText("NT$ 1,234");

      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();

      await page.getByRole("button", { name: "本月" }).click();
      await expect(page).toHaveURL(/range=this_month/);
      await expect(editor(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "本月" })).toHaveAttribute("aria-pressed", "true");
      await expect(kpi(page, "營收")).toContainText("NT$ 20,000");

      // 展開狀態下也不得產生橫向溢出（mobile project 以 375px 跑同一條）。
      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });

  /** Sidebar density：只驗結構仍在，不驗像素（實際高度由人工 visual QA 確認）。 */
  test("admin sidebar keeps the identity card and its four nav groups", async ({ page }) => {
    await mockAdminDashboardApis(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "歡迎回來，管理員！" })).toBeVisible();

    const identity = page.getByTestId("sidebar-identity");
    await expect(identity.first()).toContainText("Hi, Admin");
    await expect(identity.first()).toContainText("平台營運總控台");

    /*
     * IA 分組（Epic §7）：依「Admin 要完成什麼工作」分，不是依程式 module。
     * 名稱寫死在這裡是刻意的 —— 分組是產品決策，改動時應該要有人明確改測試。
     *
     * 固定側欄是 `hidden lg:flex`，手機上 `display:none`，所以分組只在桌機斷言；
     * 手機的抽屜導覽由 `shell-consistency.spec.ts` 覆蓋。
     */
    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth >= 1024) {
      const sidebar = page.getByTestId("admin-sidebar-desktop");
      for (const group of ["總覽", "日常審核", "信任與安全", "平台管理"]) {
        await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
      }
      // 「付款憑證」→「付款審核」：名稱描述任務，與同組的「教材審核」對齊
      await expect(sidebar.getByRole("link", { name: "付款審核" })).toBeVisible();

      /*
       * 教學回饋（`IA-01`）：**不是**一級導覽。
       * 它沒有案件、沒有狀態、沒有 SLA —— 是判斷某份教材時的脈絡，不是每天要清的佇列。
       * 摘要與最新幾則改由 `MaterialFeedbackContext` 顯示在檢舉案件詳情與教材檢舉脈絡頁。
       * `/admin/reviews-hub` 仍可直達（相容），但不從側欄進入。
       */
      await expect(sidebar.getByRole("link", { name: "教學回饋" })).toHaveCount(0);
      await expect(sidebar.locator('a[href="/admin/reviews-hub"]')).toHaveCount(0);

      /*
       * 用戶管理／系統設定（`IA-07`）：**不是**一級導覽。
       * 兩者都是零能力的目的地 —— Backend 沒有 `/admin/users` 端點，
       * 系統設定 audit 的結論是目前沒有任何常數適合由後台調整。
       * 兩條 route 仍可直達（相容），但不從側欄進入；
       * `/admin/users/:userId/activity-logs` 也不受影響（入口在活動紀錄裡）。
       */
      await expect(sidebar.getByRole("link", { name: "用戶管理" })).toHaveCount(0);
      await expect(sidebar.getByRole("link", { name: "系統設定" })).toHaveCount(0);
      await expect(sidebar.locator('a[href="/admin/users"]')).toHaveCount(0);
      await expect(sidebar.locator('a[href="/admin/settings"]')).toHaveCount(0);

      // 同組的檢舉管理與其他主導覽不得被一併影響。
      for (const label of ["營運總覽", "教材審核", "付款審核", "訂單管理", "檢舉管理", "活動紀錄"]) {
        await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
      }

      // 依人查詢的唯一入口仍在活動紀錄那一條路徑上，移除側欄項目不得把它一起拿掉。
      await expect(sidebar.getByRole("link", { name: "活動紀錄" })).toHaveAttribute(
        "href",
        "/admin/activity-logs"
      );
    }
  });

  test("reporting range: invalid URL params fall back to 30d", async ({ page }) => {
    // 多條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    await mockAdminDashboardApis(page);

    for (const bad of [
      "?range=abc",
      "?range=custom&from=2026-08-01",
      "?range=custom&from=bad-date&to=2026-08-20",
      "?range=custom&from=2026-02-31&to=2026-08-20",
      "?range=custom&from=2026-08-20&to=2026-08-01",
    ]) {
      await test.step(`open /admin${bad}`, async () => {
        await page.goto(`/admin${bad}`);
        await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
        await expect(kpi(page, "營收")).toContainText("NT$ 12,000");
      });
    }
  });

  test("admin dashboard shows unavailable KPIs instead of a different metric when summary fails", async ({ page }) => {
    await mockAdminDashboardApis(page, { summaryOk: false });
    await page.goto("/admin");

    await test.step("summary 來源的 KPI 顯示 —", async () => {
      for (const label of ["營收", "新增訂單", "新增用戶", "新增教材", "新增教學回饋", "訂單總數", "教材總數", "用戶總數", "教學回饋總數"]) {
        await expect(kpi(page, label)).toContainText("—");
      }
    });

    await test.step("不得退回前端就地計算的另一種口徑", async () => {
      // 舊行為：訂單總數 → filteredOrders.length(2)、營收 → 前端加總、用戶總數 → 去重 user_id(2)。
      await expect(kpi(page, "訂單總數")).not.toContainText("2");
      await expect(kpi(page, "營收")).not.toContainText("NT$");
      await expect(kpi(page, "用戶總數")).not.toContainText("2");
    });

    await test.step("其他端點成功的區塊仍正常顯示", async () => {
      await expect(kpi(page, "已發布教材")).toContainText("1");
      await expect(page.getByRole("table")).toContainText("ord_attention_review");
    });
  });

  /**
   * 趨勢與比較的語意驗收（見 docs/mvp_rules.md §16–§17）。
   */
  test("admin dashboard KPI comparison", async ({ page }) => {
    await mockAdminDashboardApis(page);
    await page.goto("/admin");

    await test.step("30d：+20%，文案為「較前 30 天」", async () => {
      await expect(kpi(page, "營收")).toContainText("+20%");
      await expect(kpi(page, "營收")).toContainText("較前 30 天");
    });

    await test.step("負成長顯示負號，不取絕對值", async () => {
      await expect(kpi(page, "新增訂單")).toContainText("-30%");
      await expect(kpi(page, "新增教材")).toContainText("-50%");
    });

    await test.step("零變化顯示 0%", async () => {
      await expect(kpi(page, "新增用戶")).toContainText("0%");
    });

    await test.step("previous = 0 且 current > 0 顯示「前期無資料」，不是 100% / Infinity / NaN", async () => {
      const card = kpi(page, "新增教學回饋");
      await expect(card).toContainText("前期無資料");
      await expect(card).not.toContainText("100%");
      await expect(card).not.toContainText("Infinity");
      await expect(card).not.toContainText("NaN");
      // 「前期無資料」是完整的一句話，後面不再接比較用語（舊版是「新增 較前 30 天」）。
      await expect(card).not.toContainText("較前 30 天");
    });

    await test.step("四張「新增類」KPI 不再重複顯示「所選期間」", async () => {
      for (const label of ["新增訂單", "新增用戶", "新增教材", "新增教學回饋"]) {
        await expect(kpi(page, label)).not.toContainText("所選期間");
      }
      // 營收的 subtext 有額外的統計條件（僅已核准），保留。
      await expect(kpi(page, "營收")).toContainText("所選期間已核准");
    });

    await test.step("比較基準期出現在 title 中", async () => {
      await expect(kpi(page, "營收").locator("p[title]")).toHaveAttribute(
        "title",
        "比較基準期：2026/06/22 – 2026/07/21",
      );
    });

    await test.step("平台摘要與待處理卡沒有比較列", async () => {
      await expect(kpi(page, "訂單總數")).not.toContainText("較");
      await expect(kpi(page, "待審核教材")).not.toContainText("較");
    });
  });

  test("admin dashboard KPI comparison separates empty periods from flat growth", async ({ page }) => {
    await mockAdminDashboardApis(page, { emptyPeriod: true });
    await page.goto("/admin");

    await test.step("本期與前期都是 0 時顯示「暫無變化」，不是 0%", async () => {
      for (const label of ["營收", "新增訂單", "新增用戶", "新增教材", "新增教學回饋"]) {
        await expect(kpi(page, label)).toContainText("暫無變化");
        await expect(kpi(page, label)).not.toContainText("0%");
      }
    });
  });

  test("admin dashboard comparison wording follows the preset", async ({ page }) => {
    await mockAdminDashboardApis(page);

    for (const [range, wording, delta] of [
      // `today` 的前期為 0：顯示「前期無資料」，**不接**比較用語。
      ["today", null, "前期無資料"],
      ["7d", "較前 7 天", "-17%"],
      ["this_month", "較上月同期", "0%"],
      ["custom&from=2026-08-01&to=2026-08-10", "較前期", "+23%"],
    ] as const) {
      await test.step(`range=${range}`, async () => {
        await page.goto(`/admin?range=${range}`);
        await expect(kpi(page, "營收")).toContainText(delta);
        if (wording) await expect(kpi(page, "營收")).toContainText(wording);
        else await expect(kpi(page, "營收")).not.toContainText("較");
        // 全部 preset 都不得出現舊的「較上週」文案。
        await expect(page.getByText("較上週")).toHaveCount(0);
      });
    }
  });

  test("admin dashboard trend charts", async ({ page }) => {
    const calls = await mockAdminDashboardApis(page);
    await page.goto("/admin");

    await test.step("兩張圖各自渲染，標題區分 revenue / new orders", async () => {
      await expect(page.getByRole("heading", { name: "營收趨勢" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "新增訂單趨勢" })).toBeVisible();
      // §16：避免與 approved orders 混淆，不能只叫「訂單趨勢」。
      await expect(page.getByRole("heading", { name: "訂單趨勢", exact: true })).toHaveCount(0);
    });

    await test.step("圖表有 accessible name 與說明", async () => {
      await expect(page.getByRole("img", { name: "營收趨勢" })).toBeVisible();
      await expect(page.getByRole("img", { name: "新增訂單趨勢" })).toBeVisible();
    });

    await test.step("30d → 每日一根，共 30 根", async () => {
      const bars = page.getByRole("img", { name: "營收趨勢" }).locator("rect:not([fill='transparent'])");
      await expect(bars).toHaveCount(30);
    });

    await test.step("補 0 的 bucket 仍存在，且不顯示為「無資料」", async () => {
      // fixture 只有第一個 bucket 有值，其餘 29 個為 0。
      // 斷言圖表自己的 zero label，不能用泛用的「無資料」—— KPI 的「前期無資料」也含這三個字。
      await expect(page.getByText("本期無資料變動")).toHaveCount(0);
      await expect(page.getByText("本期最高：2026/07/22，NT$ 12,000")).toBeVisible();
    });

    await test.step("切到今日 → hourly，24 根", async () => {
      await page.getByRole("button", { name: "今日" }).click();
      await expect(page).toHaveURL(/\?range=today/);
      const bars = page.getByRole("img", { name: "營收趨勢" }).locator("rect:not([fill='transparent'])");
      await expect(bars).toHaveCount(24);
      await expect(page.getByText("本期最高：2026/08/20 00:00，NT$ 500")).toBeVisible();
    });

    await test.step("切期間會重新取得 trends，但不動與期間無關的端點", async () => {
      const staticCalls = calls.materials + calls.orders + calls.activityLogs;
      await page.getByRole("button", { name: "近 7 天" }).click();
      await expect(page.getByText("本期最高：2026/08/14，NT$ 5,000")).toBeVisible();
      expect(calls.trends).toBeGreaterThan(2);
      expect(calls.materials + calls.orders + calls.activityLogs).toBe(staticCalls);
    });
  });

  test("admin dashboard trend failure does not blank the KPIs", async ({ page }) => {
    await mockAdminDashboardApis(page, { trendsOk: false });
    await page.goto("/admin");

    await test.step("圖表顯示錯誤態", async () => {
      await expect(page.getByText("趨勢資料暫時無法載入")).toHaveCount(2);
    });

    await test.step("KPI 仍正常顯示，不因圖表失敗變成 —", async () => {
      await expect(kpi(page, "營收")).toContainText("NT$ 12,000");
      await expect(kpi(page, "營收")).toContainText("+20%");
      await expect(kpi(page, "新增訂單")).toContainText("30");
    });
  });

  test("admin dashboard summary failure does not blank the charts", async ({ page }) => {
    await mockAdminDashboardApis(page, { summaryOk: false });
    await page.goto("/admin");

    await test.step("KPI 顯示 —，且不顯示任何比較列", async () => {
      await expect(kpi(page, "營收")).toContainText("—");
      await expect(kpi(page, "營收")).not.toContainText("%");
    });

    await test.step("圖表仍照常渲染", async () => {
      await expect(page.getByRole("img", { name: "營收趨勢" })).toBeVisible();
      await expect(page.getByText("趨勢資料暫時無法載入")).toHaveCount(0);
    });
  });

  test("admin dashboard ignores a stale period response", async ({ page }) => {
    // 7d 慢、today 快：快速切換後畫面必須停在 today，不能被較晚回來的 7d 覆蓋。
    await mockAdminDashboardApis(page, { delayByPreset: { "7d": 800, today: 20 } });
    await page.goto("/admin");
    await expect(kpi(page, "營收")).toContainText("NT$ 12,000");

    await page.getByRole("button", { name: "近 7 天" }).click();
    await page.getByRole("button", { name: "今日" }).click();

    await expect(page).toHaveURL(/\?range=today/);
    await expect(kpi(page, "營收")).toContainText("NT$ 500");
    await expect(page.getByTestId("admin-period-label")).toContainText("2026/08/20 – 2026/08/20");

    // 等到慢請求必然已回來，再確認畫面沒有被它覆寫。
    await page.waitForTimeout(1200);
    await expect(kpi(page, "營收")).toContainText("NT$ 500");
    // today 的前期為 0，比較列是「前期無資料」而不是「較昨日」——
    // 期間仍以 API 回傳的 metadata 為準。
    await expect(page.getByTestId("admin-period-label")).toContainText("2026/08/20 – 2026/08/20");
    await expect(page.getByText("本期最高：2026/08/20 00:00，NT$ 500")).toBeVisible();
  });

  test("admin dashboard keeps snapshot sections stable while the period reloads", async ({ page }) => {
    await mockAdminDashboardApis(page, { delayByPreset: { "7d": 600 } });
    await page.goto("/admin");
    await expect(kpi(page, "訂單總數")).toContainText("34");

    await page.getByRole("button", { name: "近 7 天" }).click();

    await test.step("重新載入期間時，平台摘要／待處理／需要注意的訂單不進 skeleton", async () => {
      await expect(kpi(page, "訂單總數")).toContainText("34");
      await expect(kpi(page, "用戶總數")).toContainText("21");
      await expect(kpi(page, "待審核付款憑證")).toContainText("3");
      await expect(page.getByRole("table")).toContainText("ord_attention_review");
    });

    await expect(kpi(page, "營收")).toContainText("NT$ 5,000");
  });

  test("trends endpoint shares the summary date-range contract", async ({ page }) => {
    await mockAdminDashboardApis(page);
    // 後註冊的 handler 先被匹配；記錄後 fallback 給上面的 mock 實際回應。
    const seen: string[] = [];
    await page.route("**/api/backend/admin/dashboard/**", async (route) => {
      seen.push(new URL(route.request().url()).search);
      return route.fallback();
    });
    await page.goto("/admin?range=custom&from=2026-08-01&to=2026-08-10");

    await expect(kpi(page, "營收")).toContainText("NT$ 1,234");
    // summary 與 trends 必須帶完全相同的期間參數 —— 兩者不得各自解析。
    const summaryQuery = seen.find((q) => q.includes("from=2026-08-01"));
    expect(summaryQuery).toBeTruthy();
    expect(seen.filter((q) => q === summaryQuery).length).toBeGreaterThanOrEqual(2);
  });

  test("all admin routes reachable", async ({ page }) => {
    // 14 條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，
    // 30s 預設值不夠。（在 auth 修好之前，這個迴圈其實全被導向 /login 才會那麼快。）
    test.setTimeout(180_000);
    for (const route of ADMIN_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});

/**
 * Admin Orders 的 operational-state 篩選（見 docs/mvp_rules.md §5、§19）。
 *
 * 這裡鎖的是「UI 值 = API token = Backend 衍生狀態」這條 1:1 契約：
 *   - 不得再有 UI→API 的 mapping（舊版把「待審核」轉成 dead status `paid`）
 *   - 篩選狀態存在 URL，deep-link / 重新整理 / 書籤都得到同一個畫面
 *   - 列徽章讀 Backend 的 `operational_status`，不是 `orders.status`
 *
 * fixture 刻意讓 `status` 與 `operational_status` 不一致（三筆都是 `pending_payment`
 * 卻分屬三個 bucket），因此任何「退回去讀 orders.status」的實作都會讓測試失敗。
 */
const ADMIN_ORDER_FIXTURES = [
  { id: "ord_awaiting", user_id: "usr_1", buyer_email: "alice@example.com", status: "pending_payment", operational_status: "awaiting_payment", total_amount: 100, payment_proof_pending_review_count: 0, payment_proof_latest_status: null, created_at: "2026-08-05T00:00:00.000Z" },
  { id: "ord_review", user_id: "usr_2", buyer_email: "bob@example.com", status: "pending_payment", operational_status: "pending_review", total_amount: 200, payment_proof_pending_review_count: 1, payment_proof_latest_status: "pending", created_at: "2026-08-04T00:00:00.000Z" },
  { id: "ord_rejected", user_id: "usr_3", buyer_email: "carol@example.com", status: "pending_payment", operational_status: "payment_rejected", total_amount: 300, payment_proof_pending_review_count: 0, payment_proof_latest_status: "rejected", created_at: "2026-08-03T00:00:00.000Z" },
  { id: "ord_approved", user_id: "usr_4", buyer_email: "alice@example.com", status: "approved", operational_status: "approved", total_amount: 400, payment_proof_pending_review_count: 0, payment_proof_latest_status: "approved", created_at: "2026-08-02T00:00:00.000Z" },
  { id: "ord_cancelled", user_id: "usr_5", buyer_email: "dave@example.com", status: "cancelled", operational_status: "cancelled", total_amount: 500, payment_proof_pending_review_count: 0, payment_proof_latest_status: null, created_at: "2026-08-01T00:00:00.000Z" },
];

/**
 * 記錄每一次 `admin/orders` 請求的 query string，用來斷言送出的參數。
 *
 * mock 端**真的**做篩選、搜尋與切頁（`IA-06`）：若只回一份固定清單，
 * 前端就算把 `q` / `page` 忘在原地也照樣「看起來正常」。
 */
async function mockAdminOrdersApi(page: Page): Promise<string[]> {
  const requests: string[] = [];
  const json = (route: Route, payload: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

  await page.route("**/api/backend/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");
    if (path !== "admin/orders") return json(route, { items: [] });

    requests.push(url.search);
    const status = url.searchParams.get("status");
    // 真實 Backend 對非法 token 回 400；前端本來就不該送出，送出即測試失敗。
    if (status && !ADMIN_ORDER_FIXTURES.some((o) => o.operational_status === status)) {
      return json(route, { message: "status must be one of awaiting_payment|pending_review|payment_rejected|approved|cancelled" }, 400);
    }

    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const matched = ADMIN_ORDER_FIXTURES.filter((o) => {
      if (status && o.operational_status !== status) return false;
      if (!q) return true;
      return o.id.toLowerCase().includes(q) || o.buyer_email.toLowerCase().includes(q);
    });

    // 分頁契約與 Backend `utils/adminQuery.js` 同源：page 1 起算、limit 預設 20。
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
    const pageNo = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
    const items = matched.slice((pageNo - 1) * limit, pageNo * limit);

    return json(route, {
      items,
      pagination: {
        page: pageNo,
        limit,
        total: matched.length,
        totalPages: Math.max(1, Math.ceil(matched.length / limit)),
      },
    });
  });

  return requests;
}

const rows = (page: Page) => page.getByTestId("admin-order-row");
const badges = (page: Page) => page.getByTestId("admin-order-status-badge");
/** 最後一次請求的 query 參數。分頁上線後 query string 不再可能是空字串。 */
const lastParams = (requests: string[]) => new URLSearchParams(requests.at(-1) ?? "");

test.describe("Admin Orders operational filter", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    // AdminShell 掛載時會打 `auth/me`（`DX-04` 的 session 探測）——
    // 不 mock 它就會落到真實後端、假 token 換回 401，整頁被導向 /login。
    await installShellBootstrapMocks(page);
  });

  test("每個篩選都送出對應的 operational token 並只留下該 bucket", async ({ page }) => {
    test.setTimeout(120_000);
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders");
    await expect(rows(page)).toHaveCount(ADMIN_ORDER_FIXTURES.length);
    // 「全部」不送 status；分頁參數則一律帶著（與其他三個 Admin 清單頁同一份契約）。
    expect(lastParams(requests).get("status")).toBeNull();
    expect(lastParams(requests).get("page")).toBe("1");
    expect(lastParams(requests).get("limit")).toBe("20");

    const cases = [
      { value: "awaiting_payment", label: "待付款", id: "ord_awaiting" },
      { value: "pending_review", label: "待審核", id: "ord_review" },
      { value: "payment_rejected", label: "付款被退回", id: "ord_rejected" },
      { value: "approved", label: "已核准", id: "ord_approved" },
      { value: "cancelled", label: "已取消", id: "ord_cancelled" },
    ] as const;

    for (const c of cases) {
      await test.step(`選「${c.label}」`, async () => {
        await page.getByTestId(`filter-tab-${c.value}`).click();
        // 篩選狀態存在 URL，因此網址列與 API 請求必然同源。
        await expect(page).toHaveURL(new RegExp(`status=${c.value}`));
        await expect(rows(page)).toHaveCount(1);
        await expect(rows(page).first()).toContainText(c.id);
        await expect(badges(page).first()).toHaveText(c.label);
        await expect.poll(() => lastParams(requests).get("status")).toBe(c.value);
      });
    }
  });

  test("deep-link 直接開啟待審核", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?status=pending_review");

    await expect(page.getByTestId("filter-tab-pending_review")).toHaveAttribute("aria-selected", "true");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("ord_review");
    // 請求是非同步的：先等畫面落定，再斷言送出的 token。
    await expect.poll(() => requests.some((s) => s.includes("status=pending_review"))).toBe(true);
  });

  test("非法 deep-link fallback 成全部，且不把非法 token 送到 API", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?status=banana");

    await expect(page.getByTestId("filter-tab-all")).toHaveAttribute("aria-selected", "true");
    await expect(rows(page)).toHaveCount(ADMIN_ORDER_FIXTURES.length);
    // 至少發生過一次請求，否則下面兩個 every() 會在空陣列上假性通過。
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((s) => !s.includes("banana"))).toBe(true);
    expect(requests.every((s) => !s.includes("status="))).toBe(true);
  });

  test("列徽章使用 Backend 衍生狀態，而非 orders.status", async ({ page }) => {
    await mockAdminOrdersApi(page);
    await page.goto("/admin/orders");

    /*
     * 三筆 fixture 的 `orders.status` 同為 `pending_payment`，卻必須顯示三種不同的徽章。
     * 只讀 `orders.status` 的實作不可能通過這一段。
     */
    await expect(rows(page).filter({ hasText: "ord_awaiting" })).toContainText("待付款");
    await expect(rows(page).filter({ hasText: "ord_review" })).toContainText("待審核");
    await expect(rows(page).filter({ hasText: "ord_rejected" })).toContainText("付款被退回");
    // `approved` 在 Admin 一律是「已核准」（buyer 端維持「已完成」，本輪不動）。
    await expect(rows(page).filter({ hasText: "ord_approved" })).toContainText("已核准");
    await expect(rows(page).filter({ hasText: "ord_cancelled" })).toContainText("已取消");

    // dead status 的舊文案不得再出現。
    await expect(page.getByRole("main")).not.toContainText("已付款");
    await expect(page.getByRole("main")).not.toContainText("已完成");
  });
});

/**
 * `IA-06` —— Admin Orders 搜尋與分頁。
 *
 * 客訴進來時 Admin 手上是**訂單編號**或**購買者 Email**；在這之前這一頁只有一個
 * 五值下拉選單，只能靠肉眼捲清單。這裡鎖三件事：
 *   1. `q` 由 URL 承載並送到 API（server-side 搜尋，不是抓回來自己 filter）
 *   2. 購買者 Email 是**看得見的欄位**，不只是搜尋索引
 *   3. 分頁契約與其他三個 Admin 清單頁同一份（page 1 起算、limit 預設 20）
 */
test.describe("Admin Orders search & pagination (IA-06)", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    // AdminShell 掛載時會打 `auth/me`（`DX-04` 的 session 探測）——
    // 不 mock 它就會落到真實後端、假 token 換回 401，整頁被導向 /login。
    await installShellBootstrapMocks(page);
  });

  test("用訂單編號搜尋：q 進 URL、送到 API、只留下那一筆", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders");
    await expect(rows(page)).toHaveCount(ADMIN_ORDER_FIXTURES.length);

    await page.getByTestId("toolbar-search-input").fill("ord_rejected");
    await page.getByTestId("toolbar-search-submit").click();

    await expect(page).toHaveURL(/q=ord_rejected/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("ord_rejected");
    // 搜尋必須在 API 端完成 —— 抓一頁回來自己 filter 只會搜到第一頁。
    await expect.poll(() => lastParams(requests).get("q")).toBe("ord_rejected");
  });

  test("用購買者 Email 搜尋，而且 Email 看得見", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?q=alice%40example.com");

    await expect(rows(page)).toHaveCount(2);
    // 搜尋得到卻看不到，Admin 無從確認自己找對了人。
    await expect(rows(page).first()).toContainText("alice@example.com");
    await expect(page.getByRole("main")).not.toContainText("carol@example.com");
    await expect.poll(() => lastParams(requests).get("q")).toBe("alice@example.com");
  });

  test("清除搜尋回到完整清單", async ({ page }) => {
    await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?q=ord_rejected");
    await expect(rows(page)).toHaveCount(1);

    await page.getByTestId("toolbar-search-clear").click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(rows(page)).toHaveCount(ADMIN_ORDER_FIXTURES.length);
  });

  test("換篩選會清掉頁碼，不會停在一個空的第 2 頁", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?page=2&limit=2");
    await expect.poll(() => lastParams(requests).get("page")).toBe("2");

    await page.getByTestId("filter-tab-approved").click();
    await expect(page).not.toHaveURL(/page=2/);
    await expect.poll(() => lastParams(requests).get("page")).toBe("1");
    await expect(rows(page)).toHaveCount(1);
  });

  test("分頁參數由 URL 承載並送到 API", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?limit=2");

    await expect(rows(page)).toHaveCount(2);
    await expect.poll(() => lastParams(requests).get("limit")).toBe("2");

    await page.goto("/admin/orders?limit=2&page=3");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("ord_cancelled");
  });
});
