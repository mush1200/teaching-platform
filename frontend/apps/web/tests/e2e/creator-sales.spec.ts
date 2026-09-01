import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";

/**
 * Creator Sales 的語意驗收（見 docs/mvp_rules.md §18）。
 *
 * 鎖住的是「數字代表什麼、日期是哪一天、文案怎麼稱呼」，不是版面樣式：
 *   - 金額是 **Gross Sales（折扣前）**，文案必須是「銷售額」，不得是「營收」／「收益」
 *   - 認列日是 `orders.paid_at`（成交日），不是 `created_at`
 *   - 期間與 Admin 共用 Asia/Taipei、half-open、URL state、預設近 30 天
 *   - 趨勢日期標籤不得再早一天（舊版把 PG date 物件轉 `toISOString()` 造成的 off-by-one）
 */

const PERIOD_BY_PRESET: Record<string, { from: string; to: string; amount: number; units: number }> = {
  today: { from: "2026-08-20", to: "2026-08-20", amount: 500, units: 1 },
  "7d": { from: "2026-08-14", to: "2026-08-20", amount: 7000, units: 7 },
  "30d": { from: "2026-07-22", to: "2026-08-20", amount: 12000, units: 30 },
  this_month: { from: "2026-08-01", to: "2026-08-20", amount: 20000, units: 20 },
};

function resolvePreset(params: URLSearchParams) {
  const range = params.get("range") ?? "30d";
  const from = params.get("from");
  const to = params.get("to");
  if (range === "custom" && from && to) {
    return { range, p: { from, to, amount: 1234, units: 5 } };
  }
  const key = PERIOD_BY_PRESET[range] ? range : "30d";
  return { range: key, p: PERIOD_BY_PRESET[key] };
}

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const epoch = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  for (let t = epoch(from); t <= epoch(to); t += 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function summaryPayload(params: URLSearchParams) {
  const { range, p } = resolvePreset(params);
  const granularity = p.from === p.to ? "hour" : "day";
  const keys =
    granularity === "hour"
      ? Array.from({ length: 24 }, (_, h) => `${p.from}T${String(h).padStart(2, "0")}`)
      : enumerateDays(p.from, p.to);

  return {
    periodFrom: p.from,
    periodTo: p.to,
    periodTimezone: "Asia/Taipei",
    periodPreset: range,
    granularity,
    totalSoldUnits: p.units,
    totalSalesAmount: p.amount,
    // deprecated alias —— 必須與 canonical 欄位同值。
    totalRevenue: p.amount,
    totalOrders: 3,
    materialsCount: 2,
    // 只有第一個 bucket 有值，其餘補 0：驗證 UI 不會把「全 0」當成「無資料」。
    trend: keys.map((key, i) => ({
      key,
      salesAmount: i === 0 ? p.amount : 0,
      soldUnits: i === 0 ? p.units : 0,
      day: key,
      revenue: i === 0 ? p.amount : 0,
    })),
  };
}

function listPayload(params: URLSearchParams, items: unknown[]) {
  const { range, p } = resolvePreset(params);
  return {
    periodFrom: p.from,
    periodTo: p.to,
    periodTimezone: "Asia/Taipei",
    periodPreset: range,
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

type CallCounts = { summary: number; materials: number; records: number };

type FailKey = "summary" | "materials" | "records";

async function mockCreatorSalesApis(
  page: Page,
  opts: { ok?: boolean; fail?: FailKey[]; big?: boolean; delayByPreset?: Record<string, number> } = {},
) {
  const { ok = true, fail = [], big = false, delayByPreset } = opts;
  const calls: CallCounts = { summary: 0, materials: 0, records: 0 };

  const json = (route: Route, payload: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

  await page.route("**/api/backend/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");

    if (path.startsWith("teacher/sales/")) {
      const which = path.split("/")[2] as keyof CallCounts;
      if (which in calls) calls[which] += 1;

      const delay = delayByPreset?.[url.searchParams.get("range") ?? "30d"];
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (!ok || fail.includes(which as FailKey)) return json(route, { message: "server error" }, 500);

      if (which === "summary") {
        const payload = summaryPayload(url.searchParams);
        if (big) {
          payload.totalSalesAmount = 1234567;
          payload.totalRevenue = 1234567;
          payload.totalOrders = 9876;
          payload.totalSoldUnits = 10000;
        }
        return json(route, payload);
      }
      if (which === "materials") {
        return json(
          route,
          listPayload(url.searchParams, [
            {
              materialId: "mat_a",
              // 刻意的長標題：desktop 不得撐爆欄位，mobile 最多兩行。
              title: "超市購物配對－幼兒生活情境認知與語言表達完整教學素材包",
              soldUnits: 4,
              salesAmount: 4000,
              revenue: 4000,
              // 台北 2026-05-08 09:00 = 2026-05-08T01:00Z。舊版顯示會早一天。
              lastSoldAt: "2026-05-08T01:00:00.000Z",
            },
          ]),
        );
      }
      return json(
        route,
        listPayload(url.searchParams, [
          {
            orderId: "ord_1",
            orderItemId: "oi_1",
            materialId: "mat_a",
            materialTitle: "超市購物配對－幼兒生活情境認知與語言表達完整教學素材包",
            quantity: 1,
            unitPrice: 1000,
            subtotal: 1000,
            buyerId: "usr_1",
            orderStatus: "approved",
            // 成交時間為台北 2026-05-08 01:59（UTC 為 5/7 17:59Z）——
            // 舊版用瀏覽器時區 + toISOString 會顯示成 2026-05-07。
            paidAt: "2026-05-07T17:59:00.000Z",
            createdAt: "2026-05-01T02:00:00.000Z",
          },
        ]),
      );
    }

    return json(route, { items: [] });
  });

  return calls;
}

/**
 * 桌機表格與手機清單會同時存在於 DOM（其中一份由 CSS 隱藏），
 * 因此文字斷言必須限定在實際可見的那一份，否則 `.first()` 可能抓到隱藏節點。
 */
function visibleText(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true }).first();
}

/**
 * 手機上導覽在抽屜裡，而抽屜**關閉時不會 render**。
 *
 * 這是本輪 shared `NavDrawer` 帶來的行為改變：舊版把抽屜永遠留在 DOM 裡、只用
 * `-translate-x-full` 推出畫面，於是關閉狀態下那些連結仍然在 accessibility tree 與
 * tab 順序中（鍵盤使用者會 tab 進一個看不見的選單）。現在關閉就是沒有。
 *
 * 因此手機要先打開抽屜才看得到導覽；桌機則是固定側欄，不需要動作。
 */
async function openNavIfMobile(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) return;
  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
}

test.describe("Creator Sales", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "teacher", { email: "creator-e2e@example.com" });
    // RoleShell 的 creator 分支掛載時會打 `auth/me`（`DX-04` 的 session 探測）。
    // 本檔自己的 route 只處理 `teacher/sales/*`，其餘會落到真實後端而回 401。
    await installShellBootstrapMocks(page);
  });

  test("creator sales semantics and terminology", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");

    await test.step("預設近 30 天，區間文字採用 API metadata", async () => {
      await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("creator-period-label")).toContainText("2026/07/22 – 2026/08/20");
      // 時區不再佔畫面，改由 title / sr-only 提供。
      await expect(page.getByTestId("creator-period-label")).toHaveAttribute("title", /Asia\/Taipei/);
    });

    await test.step("KPI 使用「銷售額」+ subtext「折扣前」，且順序以銷售額為首", async () => {
      const perf = page.locator("section[aria-labelledby='creator-performance']");
      await expect(perf.getByText("折扣前", { exact: true })).toBeVisible();
      await expect(perf.getByText("NT$ 12,000")).toBeVisible();
      // KPI 標籤不再使用冗長的完整名稱（sr-only caption 仍保留完整口徑）。
      await expect(perf.getByText("銷售額（折扣前）")).toHaveCount(0);
      // 第一張卡就是銷售額 —— 最重要的指標放在視覺起點。
      await expect(perf.locator("p").first()).toHaveText("銷售額");
    });

    await test.step("Creator 銷售頁不得再出現「營收」或「收益」", async () => {
      await expect(page.getByText("總營收")).toHaveCount(0);
      await expect(page.getByText("營收")).toHaveCount(0);
      await expect(page.getByText("收益")).toHaveCount(0);
      await expect(page.getByText("每日銷量與營收")).toHaveCount(0);
    });

    await test.step("狀態篩選不再暴露 dead status", async () => {
      await expect(page.getByText("completed")).toHaveCount(0);
      await expect(page.getByText("已成交（approved/completed）")).toHaveCount(0);
    });

    await test.step("趨勢圖使用共用元件，依成交時間統計", async () => {
      await expect(page.getByRole("heading", { name: "銷售額趨勢" })).toBeVisible();
      await expect(page.getByRole("img", { name: "銷售額趨勢" })).toBeVisible();
      const bars = page.getByRole("img", { name: "銷售額趨勢" }).locator("rect:not([fill='transparent'])");
      await expect(bars).toHaveCount(30);
      // 補 0 的 bucket 是有效資料，不得顯示成「無資料」。
      await expect(page.getByText("無資料")).toHaveCount(0);
      await expect(page.getByText("本期最高：2026/07/22，NT$ 12,000")).toBeVisible();
      // 沒有 y 軸時，至少要有一個最大值刻度作為尺度參照。
      await expect(page.getByText("最高 NT$ 12,000")).toBeVisible();
    });

    await test.step("成交時間以 Asia/Taipei 顯示，且不早一天", async () => {
      // 台北 2026-05-08 01:59（UTC 為 5/7 17:59Z）。舊版顯示會是 2026-05-07。
      await expect(visibleText(page, "2026/05/08 01:59")).toBeVisible();
      await expect(page.getByText("2026/05/07").filter({ visible: true })).toHaveCount(0);
      // 「最近成交」只有日期、沒有時間。
      await expect(visibleText(page, "2026/05/08")).toBeVisible();
    });

    await test.step("桌機表頭使用銷售額；移除高度重複的 Top 5 區塊", async () => {
      if ((await page.evaluate(() => window.innerWidth)) >= 1024) {
        await expect(page.getByRole("columnheader", { name: "成交時間" })).toBeVisible();
        await expect(page.getByRole("columnheader", { name: "銷售額" })).toBeVisible();
        await expect(page.getByRole("columnheader", { name: "小計" })).toBeVisible();
      }
      await expect(page.getByText("熱銷教材")).toHaveCount(0);
      await expect(page.getByText("匯出 Top 5 CSV")).toHaveCount(0);
    });

    await test.step("移除「統計期間」卡，教材篩選改隸屬成交明細", async () => {
      await expect(page.getByText("統計期間", { exact: true })).toHaveCount(0);
      await expect(page.getByText("所有數字與明細都依這個期間計算。")).toHaveCount(0);
      await expect(page.getByText("教材（僅篩選成交明細）")).toHaveCount(0);
      // Select 永遠顯示人類可讀文字，不得閃 raw enum。
      await expect(page.getByText("all", { exact: true })).toHaveCount(0);
      await expect(page.locator("#creator-records-material")).toHaveValue("all");
    });

    await test.step("heading 階層完整", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      for (const name of ["銷售表現", "銷售額趨勢", "教材銷售表現", "成交明細"]) {
        // 名稱互為子字串（銷售表現 ⊂ 教材銷售表現），必須 exact 比對。
        await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
      }
    });

    await test.step("表格具備 caption 與 th[scope]", async () => {
      const tables = page.locator("table");
      await expect(tables).toHaveCount(2);
      for (let i = 0; i < 2; i += 1) {
        await expect(tables.nth(i).locator("caption")).toHaveCount(1);
        const heads = tables.nth(i).locator("th");
        const n = await heads.count();
        for (let j = 0; j < n; j += 1) {
          await expect(heads.nth(j)).toHaveAttribute("scope", "col");
        }
      }
    });

    await test.step("長教材標題不撐爆欄位", async () => {
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });

  test("creator sales range drives every section", async ({ page }) => {
    const calls = await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();
    const before = { ...calls };

    await test.step("切到近 7 天：URL、KPI、趨勢一起更新", async () => {
      await page.getByRole("button", { name: "近 7 天" }).click();
      await expect(page).toHaveURL(/range=7d/);
      await expect(visibleText(page, "NT$ 7,000")).toBeVisible();
      await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/14 – 2026/08/20");
      const bars = page.getByRole("img", { name: "銷售額趨勢" }).locator("rect:not([fill='transparent'])");
      await expect(bars).toHaveCount(7);
    });

    await test.step("三支 endpoint 都跟著同一個期間重新取得", async () => {
      expect(calls.summary).toBeGreaterThan(before.summary);
      expect(calls.materials).toBeGreaterThan(before.materials);
      expect(calls.records).toBeGreaterThan(before.records);
    });

    await test.step("切到今日 → hourly 24 根", async () => {
      await page.getByRole("button", { name: "今日" }).click();
      await expect(page).toHaveURL(/range=today/);
      const bars = page.getByRole("img", { name: "銷售額趨勢" }).locator("rect:not([fill='transparent'])");
      await expect(bars).toHaveCount(24);
    });

    await test.step("上一頁回到前一個期間", async () => {
      await page.goBack();
      await expect(page.getByRole("button", { name: "近 7 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(visibleText(page, "NT$ 7,000")).toBeVisible();
    });
  });

  test("creator sales custom range survives reload", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales?range=custom&from=2026-08-01&to=2026-08-10");

    await expect(page.getByRole("button", { name: "自訂" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/01 – 2026/08/10");
    await expect(visibleText(page, "NT$ 1,234")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
    await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/01 – 2026/08/10");
  });

  /**
   * §12 自訂日期編輯列的展開／收合。
   *
   * 鎖住的是狀態機，不是像素：
   *   - `range === "custom"`（生效中的期間）與 `isCustomEditing`（正在編輯）是兩個狀態
   *   - URL 只在按下「套用」時才變
   *   - 驗證失敗不得收起編輯列
   */
  test.describe("自訂日期編輯列", () => {
    const editor = (page: Page) => page.getByTestId("reporting-custom-editor");
    const customBtn = (page: Page) => page.getByRole("button", { name: "自訂" });

    test("custom 期間載入時編輯列預設收合", async ({ page }) => {
      await mockCreatorSalesApis(page);
      await page.goto("/creator/sales?range=custom&from=2026-08-01&to=2026-08-10");

      await expect(customBtn(page)).toHaveAttribute("aria-pressed", "true");
      await expect(editor(page)).toHaveCount(0);
      await expect(customBtn(page)).toHaveAttribute("aria-expanded", "false");
      // 期間仍看得到 —— 由標題列的區間文字負責，不需要常駐輸入框。
      await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/01 – 2026/08/10");
    });

    test("點自訂只展開編輯列，不改 URL 也不送 API", async ({ page }) => {
      const calls = await mockCreatorSalesApis(page);
      await page.goto("/creator/sales");
      await expect(visibleText(page, "NT$ 12,000")).toBeVisible();
      const before = { ...calls };

      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();
      await expect(customBtn(page)).toHaveAttribute("aria-expanded", "true");
      // 生效中的 range 還是近 30 天，active 樣式不得提前跳到「自訂」。
      await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(customBtn(page)).toHaveAttribute("aria-pressed", "false");
      await expect(page).toHaveURL(/\/creator\/sales$/);
      expect(calls.summary).toBe(before.summary);

      // 初始值取目前生效期間，不是空白。
      await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-07-22");
      await expect(page.locator('input[type="date"]').nth(1)).toHaveValue("2026-08-20");
    });

    test("套用後 URL 更新、編輯列收起、自訂維持 active", async ({ page }) => {
      await mockCreatorSalesApis(page);
      await page.goto("/creator/sales");
      await expect(visibleText(page, "NT$ 12,000")).toBeVisible();

      await customBtn(page).click();
      await page.locator('input[type="date"]').first().fill("2026-08-01");
      await page.locator('input[type="date"]').nth(1).fill("2026-08-10");
      await page.getByRole("button", { name: "套用" }).click();

      await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
      await expect(editor(page)).toHaveCount(0);
      await expect(customBtn(page)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/01 – 2026/08/10");
      await expect(visibleText(page, "NT$ 1,234")).toBeVisible();
    });

    test("再次點自訂帶回目前生效的日期，不 reset 成空白或今日", async ({ page }) => {
      const calls = await mockCreatorSalesApis(page);
      await page.goto("/creator/sales?range=custom&from=2026-08-01&to=2026-08-10");
      await expect(visibleText(page, "NT$ 1,234")).toBeVisible();
      const before = { ...calls };

      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();
      await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-08-01");
      await expect(page.locator('input[type="date"]').nth(1)).toHaveValue("2026-08-10");
      await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
      expect(calls.summary).toBe(before.summary);
    });

    test("驗證失敗時編輯列保持展開且不送 API", async ({ page }) => {
      const calls = await mockCreatorSalesApis(page);
      await page.goto("/creator/sales?range=custom&from=2026-08-01&to=2026-08-10");
      await expect(visibleText(page, "NT$ 1,234")).toBeVisible();
      const before = { ...calls };

      await customBtn(page).click();
      await page.locator('input[type="date"]').first().fill("2026-08-15");
      await page.getByRole("button", { name: "套用" }).click();

      await expect(page.getByText("開始日期不可晚於結束日期。")).toBeVisible();
      await expect(editor(page)).toBeVisible();
      await expect(page).toHaveURL(/range=custom&from=2026-08-01&to=2026-08-10/);
      expect(calls.summary).toBe(before.summary);
    });

    test("編輯中切到其他 preset 會收起編輯列並套用該 preset", async ({ page }) => {
      await mockCreatorSalesApis(page);
      await page.goto("/creator/sales?range=custom&from=2026-08-01&to=2026-08-10");
      await expect(visibleText(page, "NT$ 1,234")).toBeVisible();

      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();

      await page.getByRole("button", { name: "近 7 天" }).click();
      await expect(page).toHaveURL(/range=7d/);
      await expect(editor(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "近 7 天" })).toHaveAttribute("aria-pressed", "true");
      await expect(visibleText(page, "NT$ 7,000")).toBeVisible();

      // 展開狀態下也不得產生橫向溢出（mobile project 會以 375px 跑同一條）。
      await customBtn(page).click();
      await expect(editor(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });

  test("creator sales falls back to 30d on invalid URL params", async ({ page }) => {
    test.setTimeout(120_000);
    await mockCreatorSalesApis(page);

    for (const bad of [
      "?range=abc",
      "?range=custom&from=2026-08-01",
      "?range=custom&from=2026-02-31&to=2026-08-20",
      "?range=custom&from=2026-08-20&to=2026-08-01",
    ]) {
      await test.step(`open /creator/sales${bad}`, async () => {
        await page.goto(`/creator/sales${bad}`);
        await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");
        await expect(visibleText(page, "NT$ 12,000")).toBeVisible();
      });
    }
  });

  test("creator sales shows per-section errors instead of zeroes when everything fails", async ({ page }) => {
    await mockCreatorSalesApis(page, { ok: false });
    await page.goto("/creator/sales");

    // 三區各自的錯誤態，而不是一個吃掉整頁的 ErrorState。
    await expect(page.getByText("銷售數據暫時無法載入")).toBeVisible();
    await expect(page.getByText("教材銷售資料暫時無法載入")).toBeVisible();
    await expect(page.getByText("成交明細暫時無法載入")).toBeVisible();
    // 0 是有效的銷售額，不能拿來代表「載入失敗」。
    await expect(page.getByText("NT$ 0")).toHaveCount(0);
    // 版面骨架仍在。
    await expect(page.getByRole("heading", { level: 1, name: "我的銷售" })).toBeVisible();
  });

  test("creator sales ignores a stale period response", async ({ page }) => {
    await mockCreatorSalesApis(page, { delayByPreset: { "7d": 800, today: 20 } });
    await page.goto("/creator/sales");
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();

    await page.getByRole("button", { name: "近 7 天" }).click();
    await page.getByRole("button", { name: "今日" }).click();

    await expect(page).toHaveURL(/range=today/);
    await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/20 – 2026/08/20");
    await page.waitForTimeout(1200);
    await expect(visibleText(page, "NT$ 500")).toBeVisible();
    await expect(page.getByTestId("creator-period-label")).toContainText("2026/08/20 – 2026/08/20");
  });

  /**
   * Partial failure：三支 endpoint 各自持有 loading / error state，
   * 一支失敗**不得**清掉其他已成功的資料。
   */
  test("creator sales survives a summary failure", async ({ page }) => {
    await mockCreatorSalesApis(page, { fail: ["summary"] });
    await page.goto("/creator/sales");

    await expect(page.getByText("銷售數據暫時無法載入")).toBeVisible();
    await expect(page.getByText("趨勢資料暫時無法載入")).toBeVisible();
    // 其餘兩區照常顯示。
    await expect(page.getByRole("heading", { level: 2, name: "教材銷售表現", exact: true })).toBeVisible();
    await expect(visibleText(page, "NT$ 4,000")).toBeVisible();
    await expect(visibleText(page, "NT$ 1,000")).toBeVisible();
    // 失敗不得被當成 0。
    await expect(page.getByText("NT$ 0")).toHaveCount(0);
  });

  test("creator sales survives a materials failure", async ({ page }) => {
    await mockCreatorSalesApis(page, { fail: ["materials"] });
    await page.goto("/creator/sales");

    await expect(page.getByText("教材銷售資料暫時無法載入")).toBeVisible();
    // KPI 與明細照常。
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "成交明細", exact: true })).toBeVisible();
    await expect(visibleText(page, "NT$ 1,000")).toBeVisible();
    await expect(page.getByText("銷售數據暫時無法載入")).toHaveCount(0);
  });

  test("creator sales survives a records failure", async ({ page }) => {
    await mockCreatorSalesApis(page, { fail: ["records"] });
    await page.goto("/creator/sales");

    await expect(page.getByText("成交明細暫時無法載入")).toBeVisible();
    // KPI 與教材表現照常。
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();
    await expect(visibleText(page, "NT$ 4,000")).toBeVisible();
    await expect(page.getByText("銷售數據暫時無法載入")).toHaveCount(0);
    await expect(page.getByText("教材銷售資料暫時無法載入")).toHaveCount(0);
  });

  test("creator sales keeps the shell while sections reload", async ({ page }) => {
    await mockCreatorSalesApis(page, { delayByPreset: { "7d": 700 } });
    await page.goto("/creator/sales");
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();

    await page.getByRole("button", { name: "近 7 天" }).click();

    await test.step("重新載入期間時 header 與選擇器保持在原位", async () => {
      await expect(page.getByRole("heading", { level: 1, name: "我的銷售" })).toBeVisible();
      await expect(page.getByRole("button", { name: "近 7 天" })).toBeVisible();
      // 區塊標題不隨載入消失（版面不塌陷）。
      await expect(page.getByRole("heading", { level: 2, name: "銷售表現", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "成交明細", exact: true })).toBeVisible();
      // 骨架而不是整頁單一 spinner。
      await expect(page.getByText("載入銷售資料中…")).toHaveCount(0);
    });

    await expect(visibleText(page, "NT$ 7,000")).toBeVisible();
  });

  test("creator sales renders large numbers without breaking", async ({ page }) => {
    await mockCreatorSalesApis(page, { big: true });
    await page.goto("/creator/sales");

    await expect(visibleText(page, "NT$ 1,234,567")).toBeVisible();
    await expect(page.getByText("9,876")).toBeVisible();
    await expect(page.getByText("10,000")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("creator sales empty state offers one next step", async ({ page }) => {
    await page.route("**/api/backend/teacher/sales/**", (route) => {
      const url = new URL(route.request().url());
      const which = url.pathname.split("/").pop();
      const meta = { periodFrom: "2026-07-22", periodTo: "2026-08-20", periodTimezone: "Asia/Taipei", periodPreset: "30d" };
      const body =
        which === "summary"
          ? { ...meta, granularity: "day", totalSoldUnits: 0, totalSalesAmount: 0, totalRevenue: 0, totalOrders: 0, materialsCount: 0, trend: [{ key: "2026-07-22", salesAmount: 0, soldUnits: 0, day: "2026-07-22", revenue: 0 }] }
          : { ...meta, items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
      return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
    });
    await page.goto("/creator/sales");

    // 0 是有效資料，KPI 正常顯示，不是錯誤態。
    await expect(visibleText(page, "NT$ 0")).toBeVisible();
    await expect(page.getByText("銷售數據暫時無法載入")).toHaveCount(0);

    // 三段空狀態各自用不同措辭，不再重複同一句大標題。
    await expect(page.getByText("此期間尚無成交紀錄")).toHaveCount(0);
    await expect(page.getByText("此期間沒有教材成交資料")).toBeVisible();
    await expect(page.getByText("此期間沒有成交明細")).toBeVisible();
    await expect(page.getByText("此期間尚無成交。")).toBeVisible();

    // 一頁只需要一個 CTA。
    await expect(page.getByRole("link", { name: "前往我的教材" })).toHaveCount(1);
  });

  /**
   * Responsive data presentation：`lg`（1024px）以下不使用 table。
   * 這條測試在 desktop 與 mobile 兩個 project 都有意義 —— 依實際 viewport 斷言。
   */
  test("creator sales switches between table and list by viewport", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();

    const width = await page.evaluate(() => window.innerWidth);
    const tables = page.locator("table");
    const lists = page.locator("section[id='materials'] ul, section[id='records'] ul");

    if (width >= 1024) {
      await test.step("桌機使用表格，數值欄右對齊且為等寬數字", async () => {
        await expect(tables.first()).toBeVisible();
        const align = await page.evaluate(() => {
          const t = document.querySelectorAll("table")[1];
          const cells = [...(t.querySelector("tbody tr")?.children || [])].map((td) => {
            const cs = getComputedStyle(td as Element);
            return { align: cs.textAlign, nums: cs.fontVariantNumeric };
          });
          return cells;
        });
        // 成交明細：數量 / 單價 / 小計（index 2,3,4）必須右對齊 + tabular-nums
        for (const i of [2, 3, 4]) {
          expect(align[i].align).toBe("right");
          expect(align[i].nums).toContain("tabular-nums");
        }
      });
    } else {
      await test.step("手機隱藏表格，改用清單，且小計不需橫滑即可看到", async () => {
        await expect(tables.first()).toBeHidden();
        await expect(lists.first()).toBeVisible();

        // 小計金額必須落在可視寬度內（舊版被裁掉 175px）。
        const box = await page.getByText("NT$ 1,000").last().boundingBox();
        const vw = await page.evaluate(() => document.documentElement.clientWidth);
        expect(box).not.toBeNull();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw);

        // 整頁不得橫向溢出，清單內也不得有橫向捲動容器。
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });

      await test.step("長教材標題最多兩行", async () => {
        const clamp = await page.evaluate(() => {
          const el = document.querySelector("section[id='materials'] ul li p");
          return el ? getComputedStyle(el).webkitLineClamp : null;
        });
        expect(clamp).toBe("2");
      });
    }
  });

  /** §60 趨勢圖在觸控裝置只能靠點擊讀值；點擊必須同時更新數值與長條的視覺狀態。 */
  test("creator sales trend reveals a value on tap", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");
    const chart = page.getByRole("img", { name: "銷售額趨勢" });
    await expect(chart).toBeVisible();

    const hits = chart.locator("rect[fill='transparent']");
    const bars = chart.locator("rect:not([fill='transparent'])");
    const before = await bars.first().getAttribute("class");

    await hits.first().click();
    // 數值出現在圖表標題列（aria-live 區，滑鼠與觸控共用）。
    const readout = page.locator("p[aria-live='polite']");
    await expect(readout).toBeVisible();
    await expect(readout).toContainText("2026/07/22");
    await expect(readout).toContainText("NT$ 12,000");
    // 被選中的長條有可辨識的視覺狀態，而不只是文字改變。
    await expect.poll(async () => bars.first().getAttribute("class")).not.toBe(before);

    // 再點同一根 → 取消釘選。指標仍停在該欄，因此會退回 hover 狀態；
    // 把指標移開後才應完全回到未選取。
    await hits.first().click();
    await page.mouse.move(0, 0);
    await expect.poll(async () => bars.first().getAttribute("class")).toBe(before);
  });

  /** §62/§63 切期間三支各打一次；重試只重打該區。 */
  test("creator sales issues exactly one request per section", async ({ page }) => {
    const calls = await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");
    await expect(visibleText(page, "NT$ 12,000")).toBeVisible();
    const base = { ...calls };

    await page.getByRole("button", { name: "近 7 天" }).click();
    await expect(visibleText(page, "NT$ 7,000")).toBeVisible();
    await expect
      .poll(() => [calls.summary - base.summary, calls.materials - base.materials, calls.records - base.records])
      .toEqual([1, 1, 1]);
  });

  test("creator sales retry reloads only the failed section", async ({ page }) => {
    const calls = await mockCreatorSalesApis(page, { fail: ["materials"] });
    await page.goto("/creator/sales");
    await expect(page.getByText("教材銷售資料暫時無法載入")).toBeVisible();
    const base = { ...calls };

    await page.getByRole("button", { name: "重新載入" }).click();
    await expect.poll(() => calls.materials - base.materials).toBe(1);
    expect(calls.summary - base.summary).toBe(0);
    expect(calls.records - base.records).toBe(0);
  });

  /** §53 5xx 的原始英文訊息不得外洩給創作者。 */
  test("creator sales never surfaces raw upstream error text", async ({ page }) => {
    await mockCreatorSalesApis(page, { ok: false });
    await page.goto("/creator/sales");
    await expect(page.getByText("銷售數據暫時無法載入")).toBeVisible();
    await expect(page.getByText("server error")).toHaveCount(0);
    await expect(page.getByText("伺服器暫時無法回應，請稍後再試。").first()).toBeVisible();
    // 期間文字不得永遠停在載入中。
    await expect(page.getByTestId("creator-period-label")).not.toContainText("期間載入中");
  });

  /** §35/§49 舊的 `?tab=records` 仍可定位，但不得改變 h1。 */
  test("creator sales keeps the legacy tab deep link as an anchor only", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales?tab=records&range=7d");

    await expect(page.getByRole("heading", { level: 1, name: "我的銷售" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "成交明細" })).toHaveCount(0);
    // 期間參數不受影響。
    await expect(page.getByRole("button", { name: "近 7 天" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("section#records")).toBeVisible();
  });

  test("creator sidebar says 我的銷售", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");
    await openNavIfMobile(page);
    await expect(page.getByRole("link", { name: "我的銷售" }).first()).toBeVisible();
    await expect(page.getByText("銷售與收益")).toHaveCount(0);
  });

  /** Sidebar density：只驗結構仍在，不驗像素（實際可見範圍由人工 visual QA 確認）。 */
  test("creator sidebar keeps the identity card and the 教材狀態 section", async ({ page }) => {
    await mockCreatorSalesApis(page);
    await page.goto("/creator/sales");

    await openNavIfMobile(page);

    /*
     * Identity card 只在桌機固定側欄出現；抽屜刻意不放它（與 top bar 重複，
     * 而且在矮視窗上吃掉大量垂直空間）。
     */
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const identity = page.getByTestId("sidebar-identity").first();
      await expect(identity).toContainText("Hi, 歡迎回來");
      await expect(identity).toContainText("管理你的教材與銷售");
    }
    // 側欄分段標題在 mobile 是抽屜內容，desktop 是固定側欄；兩者都必須保留。
    await expect(page.getByText("主要功能").first()).toBeAttached();
    await expect(page.getByText("教材狀態").first()).toBeAttached();
    await expect(page.getByRole("link", { name: "教材管理" }).first()).toBeAttached();
  });
});
