import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";
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
 *   today → 500 vs 0     → null → UI 顯示「新增」
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
    wowReviewDeltaPercent: 25,
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

type CallCounts = { summary: number; trends: number; materials: number; orders: number; activityLogs: number };

type MockOptions = {
  summaryOk?: boolean;
  trendsOk?: boolean;
  /** 依 preset 延遲回應，用來製造 stale response 情境。 */
  delayByPreset?: Record<string, number>;
};

/**
 * Admin Dashboard 的最小 API fixture。
 *
 * 回傳的計數器可用來斷言「切換期間時只有期間相關端點重新請求」。
 * `summaryOk` / `trendsOk` 可各自失敗，用來驗證兩支 endpoint 的錯誤狀態互不牽連。
 */
async function mockAdminDashboardApis(page: Page, opts: MockOptions = {}): Promise<CallCounts> {
  const { summaryOk = true, trendsOk = true, delayByPreset } = opts;
  const calls: CallCounts = { summary: 0, trends: 0, materials: 0, orders: 0, activityLogs: 0 };

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
      return json(route, summaryPayload(url.searchParams));
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
      // 後端已 ORDER BY created_at DESC；此處刻意讓最新的一筆排在最前面。
      return json(route, {
        items: [
          { id: "ord_newest", user_id: "usr_1", status: "approved", total_amount: 999, created_at: "2026-08-19T00:00:00.000Z" },
          { id: "ord_older", user_id: "usr_2", status: "pending_payment", total_amount: 111, created_at: "2020-01-01T00:00:00.000Z" },
        ],
      });
    }

    if (path.startsWith("admin/activity-logs")) {
      calls.activityLogs += 1;
      // 兩筆都遠早於「今天」：latest-N feed 不得被任何日期條件濾掉。
      return json(route, {
        items: [
          { id: "1", action: "payment_proof.approved", actor_role: "admin", target_type: "order", created_at: "2020-01-02T00:00:00.000Z" },
          { id: "2", action: "material.created", actor_role: "teacher", target_type: "material", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        pagination: { page: 1, limit: 8, total: 2, totalPages: 1 },
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
  });

  test("admin dashboard skeleton", async ({ page }) => {
    await page.goto("/admin");
    await test.step("dashboard widgets visible", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      // TODO(assert): verify KPI cards render expected labels and values.
      // TODO(assert): verify recent order table renders at least one row.
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
    await test.step("admin list interactions TODOs", async () => {
      // TODO(assert): materials page links to material reports/activity logs.
      // 訂單狀態篩選已有專屬 describe：「Admin Orders operational filter」。
      // TODO(assert): reports mark-reviewed button updates row state.
      // TODO(assert): payment-proofs approve/reject action pathways.
    });
  });

  test("admin activity logs and detail skeleton", async ({ page }) => {
    await test.step("activity log list", async () => {
      await page.goto("/admin/activity-logs");
      await expect(page.getByRole("main")).toBeVisible();
      // TODO(assert): actor/action/target filters affect query and list.
      // TODO(assert): pagination controls move page correctly.
    });

    await test.step("activity log detail", async () => {
      await page.goto("/admin/activity-logs/log_mock_001");
      await expect(page.getByRole("main")).toBeVisible();
      // TODO(assert): metadata JSON block renders with expected keys.
      // TODO(assert): related links route to user/material/order logs.
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
    await test.step("scoped page interactions TODOs", async () => {
      // TODO(assert): scoped pages only show records for provided ids.
      // TODO(assert): material reports source switch toggles between two APIs.
      // TODO(assert): mark-reviewed state updates and shows feedback.
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
      await expect(kpi(page, "待處理檢舉")).toContainText("1");
    });

    await test.step("最近訂單／活動為 latest-N feed，不做前端日期過濾", async () => {
      await expect(page.getByRole("table")).toContainText("ord_newest");
      await expect(page.getByRole("table")).toContainText("ord_older");
      await expect(page.getByText("payment_proof.approved")).toBeVisible();
      await expect(page.getByText("尚無活動紀錄")).toHaveCount(0);
    });
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
      await expect(page.getByRole("table")).toContainText("ord_newest");
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
      await expect(page.getByRole("table")).toContainText("ord_newest");
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

    await test.step("previous = 0 且 current > 0 顯示「新增」，不是 100% / Infinity / NaN", async () => {
      const card = kpi(page, "新增教學回饋");
      await expect(card).toContainText("新增");
      await expect(card).not.toContainText("100%");
      await expect(card).not.toContainText("Infinity");
      await expect(card).not.toContainText("NaN");
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

  test("admin dashboard comparison wording follows the preset", async ({ page }) => {
    await mockAdminDashboardApis(page);

    for (const [range, wording, delta] of [
      ["today", "較昨日", "新增"],
      ["7d", "較前 7 天", "-17%"],
      ["this_month", "較上月同期", "0%"],
      ["custom&from=2026-08-01&to=2026-08-10", "較前期", "+23%"],
    ] as const) {
      await test.step(`range=${range}`, async () => {
        await page.goto(`/admin?range=${range}`);
        await expect(kpi(page, "營收")).toContainText(wording);
        await expect(kpi(page, "營收")).toContainText(delta);
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
      await expect(page.getByText("無資料")).toHaveCount(0);
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
    await expect(kpi(page, "營收")).toContainText("較昨日");
    await expect(page.getByText("本期最高：2026/08/20 00:00，NT$ 500")).toBeVisible();
  });

  test("admin dashboard keeps snapshot sections stable while the period reloads", async ({ page }) => {
    await mockAdminDashboardApis(page, { delayByPreset: { "7d": 600 } });
    await page.goto("/admin");
    await expect(kpi(page, "訂單總數")).toContainText("34");

    await page.getByRole("button", { name: "近 7 天" }).click();

    await test.step("重新載入期間時，平台摘要／待處理／最近訂單不進 skeleton", async () => {
      await expect(kpi(page, "訂單總數")).toContainText("34");
      await expect(kpi(page, "用戶總數")).toContainText("21");
      await expect(kpi(page, "待審核付款憑證")).toContainText("3");
      await expect(page.getByRole("table")).toContainText("ord_newest");
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
  { id: "ord_awaiting", user_id: "usr_1", status: "pending_payment", operational_status: "awaiting_payment", total_amount: 100, payment_proof_pending_review_count: 0, payment_proof_latest_status: null, created_at: "2026-08-05T00:00:00.000Z" },
  { id: "ord_review", user_id: "usr_2", status: "pending_payment", operational_status: "pending_review", total_amount: 200, payment_proof_pending_review_count: 1, payment_proof_latest_status: "pending", created_at: "2026-08-04T00:00:00.000Z" },
  { id: "ord_rejected", user_id: "usr_3", status: "pending_payment", operational_status: "payment_rejected", total_amount: 300, payment_proof_pending_review_count: 0, payment_proof_latest_status: "rejected", created_at: "2026-08-03T00:00:00.000Z" },
  { id: "ord_approved", user_id: "usr_4", status: "approved", operational_status: "approved", total_amount: 400, payment_proof_pending_review_count: 0, payment_proof_latest_status: "approved", created_at: "2026-08-02T00:00:00.000Z" },
  { id: "ord_cancelled", user_id: "usr_5", status: "cancelled", operational_status: "cancelled", total_amount: 500, payment_proof_pending_review_count: 0, payment_proof_latest_status: null, created_at: "2026-08-01T00:00:00.000Z" },
];

/** 記錄每一次 `admin/orders` 請求的 query string，用來斷言送出的 token。 */
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
    const items = status ? ADMIN_ORDER_FIXTURES.filter((o) => o.operational_status === status) : ADMIN_ORDER_FIXTURES;
    return json(route, { items });
  });

  return requests;
}

const rows = (page: Page) => page.getByTestId("admin-order-row");
const badges = (page: Page) => page.getByTestId("admin-order-status-badge");

test.describe("Admin Orders operational filter", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("每個篩選都送出對應的 operational token 並只留下該 bucket", async ({ page }) => {
    test.setTimeout(120_000);
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders");
    await expect(rows(page)).toHaveCount(ADMIN_ORDER_FIXTURES.length);
    expect(requests.at(-1)).toBe("");

    const cases = [
      { value: "awaiting_payment", label: "待付款", id: "ord_awaiting" },
      { value: "pending_review", label: "待審核", id: "ord_review" },
      { value: "payment_rejected", label: "付款被退回", id: "ord_rejected" },
      { value: "approved", label: "已核准", id: "ord_approved" },
      { value: "cancelled", label: "已取消", id: "ord_cancelled" },
    ] as const;

    for (const c of cases) {
      await test.step(`選「${c.label}」`, async () => {
        await page.selectOption("#admin-order-status", c.value);
        // 篩選狀態存在 URL，因此換頁參數與 API 請求必然同源。
        await expect(page).toHaveURL(new RegExp(`status=${c.value}`));
        await expect(rows(page)).toHaveCount(1);
        await expect(rows(page).first()).toContainText(c.id);
        await expect(badges(page).first()).toHaveText(c.label);
        expect(requests.at(-1)).toBe(`?status=${c.value}`);
      });
    }
  });

  test("deep-link 直接開啟待審核", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?status=pending_review");

    await expect(page.locator("#admin-order-status")).toHaveValue("pending_review");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("ord_review");
    // 請求是非同步的：先等畫面落定，再斷言送出的 token。
    await expect.poll(() => requests).toContain("?status=pending_review");
  });

  test("非法 deep-link fallback 成全部，且不把非法 token 送到 API", async ({ page }) => {
    const requests = await mockAdminOrdersApi(page);
    await page.goto("/admin/orders?status=banana");

    await expect(page.locator("#admin-order-status")).toHaveValue("all");
    await expect(rows(page)).toHaveCount(ADMIN_ORDER_FIXTURES.length);
    // 至少發生過一次請求，否則下面兩個 every() 會在空陣列上假性通過。
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((q) => !q.includes("banana"))).toBe(true);
    expect(requests.every((q) => !q.includes("status="))).toBe(true);
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
