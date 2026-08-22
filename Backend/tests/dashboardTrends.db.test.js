/**
 * Admin dashboard trends + previous-period comparison 的資料庫整合測試。
 *
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * fixture id 帶 `tp_trtest_` 前綴，測試前後各清一次，因此可重複執行。
 * 斷言一律採「相對同一期間 baseline 的差值」，不依賴資料庫既有筆數。
 *
 * 這支測試要證明的事：
 *   1. trend bucket 依 **Asia/Taipei** 日曆切分，不是 UTC，也不是 DB 隱含時區
 *   2. bucket 邊界同樣是 **half-open [start, end)**
 *   3. 沒有資料的 bucket **補 0**，圖表不跳日期
 *   4. hourly / daily / monthly 三種粒度都正確
 *   5. revenue 依 `paid_at`、orders 依 `created_at`，兩者不共用事件
 *   6. previous-period comparison 與 deltaPercent 由 Backend 算出且正確
 *   7. `approved` 但 `paid_at IS NULL` 的 legacy 列不進入任何 period / trend 數字
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const test = require("node:test");
const assert = require("node:assert/strict");

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  throw new Error(
    `ABORT: this test writes fixtures and must run against ${EXPECTED_DB}. ` +
      `PGDATABASE is currently ${JSON.stringify(process.env.PGDATABASE)}. ` +
      "Run it via `npm run test:db --prefix Backend`."
  );
}

const db = require("../config/db");
const { resolveReportingRange } = require("../utils/reportingRange");
const { getDashboardSummary } = require("../services/adminDashboard.service");
const { getDashboardTrends } = require("../services/adminTrends.service");

const PREFIX = "tp_trtest_";

/**
 * 把「台北牆鐘時間」寫進**無時區**的 TIMESTAMP 欄位，與查詢端的換算完全對稱
 * （見 services/adminTrends.service.js），因此無論 DB session 時區為何，
 * fixture 都落在預期的台北時刻。
 */
const TPE_NAIVE = (n) => `(($${n}::timestamp AT TIME ZONE 'Asia/Taipei') AT TIME ZONE current_setting('TimeZone'))`;

/** fixture 日期都在過去；注入固定 now 讓「不得選未來日期」的驗證與系統時鐘無關。 */
const NOW = new Date("2026-09-15T04:00:00.000Z");
const periodOf = (from, to) => resolveReportingRange({ range: "custom", from, to }, { now: NOW });
const presetPeriod = (range, now = NOW) => resolveReportingRange({ range }, { now });

async function cleanup() {
  await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM orders WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function insertUser(id, createdAtTpe) {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role, created_at)
     VALUES($1, $2, 'x', 'buyer', ${TPE_NAIVE(3)})`,
    [PREFIX + id, `${PREFIX}${id}@example.test`, createdAtTpe]
  );
}

async function insertOrder(id, { status, amount, createdAtTpe, paidAtTpe = null }) {
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, created_at, updated_at, paid_at)
     VALUES($1, $2, $3, 'manual_transfer', $4, $4, ${TPE_NAIVE(5)}, ${TPE_NAIVE(5)},
            CASE WHEN $6::text IS NULL THEN NULL ELSE ${TPE_NAIVE(6)} END)`,
    [PREFIX + id, `${PREFIX}owner`, status, amount, createdAtTpe, paidAtTpe]
  );
}

/** 把序列轉成 `{key: value}`，方便逐 bucket 斷言。 */
const byKey = (series) => Object.fromEntries(series.map((p) => [p.key, p.value]));

/** 相對 baseline 的差值序列；只保留有變化的 bucket。 */
function deltaSeries(now, base) {
  const b = byKey(base);
  return Object.fromEntries(
    now.map((p) => [p.key, p.value - (b[p.key] ?? 0)]).filter(([, v]) => v !== 0)
  );
}

const PERIODS = {
  aug20: periodOf("2026-08-20", "2026-08-20"), // hourly
  aug14to20: periodOf("2026-08-14", "2026-08-20"), // daily, gap fill
  aug19: periodOf("2026-08-19", "2026-08-19"),
  janToMay: periodOf("2026-01-15", "2026-05-10"), // monthly, partial first/last
  legacy: periodOf("2026-06-10", "2026-06-10"),
};

const baselines = {};
const trendBaselines = {};

test("dashboard trends and comparison", async (t) => {
  const dbNameRes = await db.query("SELECT current_database() AS d");
  assert.equal(dbNameRes.rows[0].d, EXPECTED_DB, "connected to the wrong database");

  await cleanup();
  for (const [name, period] of Object.entries(PERIODS)) {
    baselines[name] = await getDashboardSummary(period);
    trendBaselines[name] = await getDashboardTrends(period);
  }

  // ── fixtures ────────────────────────────────────────────────────────────────
  await insertUser("owner", "2026-01-01 00:00:00");

  // §57 hourly：同一個台北日的三個不同小時。
  await insertOrder("h00", { status: "approved", amount: 10, createdAtTpe: "2026-08-20 00:30:00", paidAtTpe: "2026-08-20 00:30:00" });
  await insertOrder("h14", { status: "approved", amount: 20, createdAtTpe: "2026-08-20 14:20:00", paidAtTpe: "2026-08-20 14:20:00" });
  await insertOrder("h23", { status: "approved", amount: 30, createdAtTpe: "2026-08-20 23:59:00", paidAtTpe: "2026-08-20 23:59:00" });

  // §58 half-open：台北 8/21 00:00 —— 查 8/20 不得包含。
  await insertOrder("hnext", { status: "approved", amount: 999, createdAtTpe: "2026-08-21 00:00:00", paidAtTpe: "2026-08-21 00:00:00" });

  // §55 daily gap fill：資料只落在 8/14、8/16、8/20（8/20 由上面三筆組成）。
  await insertOrder("d14", { status: "approved", amount: 100, createdAtTpe: "2026-08-14 09:00:00", paidAtTpe: "2026-08-14 09:00:00" });
  await insertOrder("d16", { status: "approved", amount: 200, createdAtTpe: "2026-08-16 09:00:00", paidAtTpe: "2026-08-16 09:00:00" });

  // §56 跨台北午夜：建立在 8/19 23:00，核准在 8/20 00:30。
  // revenue 必須落 8/20（UTC 是 8/19T16:30Z），orders 必須落 8/19。
  await insertOrder("mid", { status: "approved", amount: 500, createdAtTpe: "2026-08-19 23:00:00", paidAtTpe: "2026-08-20 00:30:00" });

  // §59 monthly：頭尾月份只被期間涵蓋一部分。
  await insertOrder("m01in", { status: "approved", amount: 11, createdAtTpe: "2026-01-20 10:00:00", paidAtTpe: "2026-01-20 10:00:00" });
  await insertOrder("m01out", { status: "approved", amount: 77, createdAtTpe: "2026-01-05 10:00:00", paidAtTpe: "2026-01-05 10:00:00" });
  await insertOrder("m03in", { status: "approved", amount: 33, createdAtTpe: "2026-03-15 10:00:00", paidAtTpe: "2026-03-15 10:00:00" });
  await insertOrder("m05in", { status: "approved", amount: 55, createdAtTpe: "2026-05-01 10:00:00", paidAtTpe: "2026-05-01 10:00:00" });
  await insertOrder("m05out", { status: "approved", amount: 88, createdAtTpe: "2026-05-20 10:00:00", paidAtTpe: "2026-05-20 10:00:00" });

  // §49 legacy gap：approved 但沒有 paid_at。
  await insertOrder("legacy", { status: "approved", amount: 4242, createdAtTpe: "2026-06-10 12:00:00", paidAtTpe: null });

  async function trendDeltas(name) {
    const now = await getDashboardTrends(PERIODS[name]);
    const base = trendBaselines[name];
    return {
      raw: now,
      revenue: deltaSeries(now.revenue, base.revenue),
      orders: deltaSeries(now.orders, base.orders),
    };
  }

  await t.test("hourly granularity buckets by the Taipei hour", async () => {
    const d = await trendDeltas("aug20");
    assert.equal(d.raw.granularity, "hour");
    assert.equal(d.raw.revenue.length, 24, "a single day always renders 24 hourly buckets");

    // 00:30 → 00、14:20 → 14、23:59 → 23。500 來自跨午夜那筆的 paid_at 00:30。
    assert.deepEqual(d.revenue, { "2026-08-20T00": 510, "2026-08-20T14": 20, "2026-08-20T23": 30 });
    // 跨午夜那筆是 8/19 建立的，不算 8/20 的新增訂單。
    assert.deepEqual(d.orders, { "2026-08-20T00": 1, "2026-08-20T14": 1, "2026-08-20T23": 1 });
  });

  await t.test("hourly: keys are zero-padded and cover the whole day", async () => {
    const keys = (await trendDeltas("aug20")).raw.revenue.map((p) => p.key);
    assert.equal(keys[0], "2026-08-20T00");
    assert.equal(keys[9], "2026-08-20T09");
    assert.equal(keys[23], "2026-08-20T23");
  });

  await t.test("half-open: the next day's 00:00 is excluded from this day", async () => {
    const d = await trendDeltas("aug20");
    // 8/21 00:00 的那筆金額 999 不得出現在 8/20 的任何 bucket。
    assert.equal(
      Object.values(d.revenue).reduce((a, b) => a + b, 0),
      560,
      "8/21 00:00 must not leak into the 8/20 series"
    );
  });

  await t.test("revenue uses paid_at and orders uses created_at across Taipei midnight", async () => {
    const aug20 = await trendDeltas("aug20");
    const aug19 = await trendDeltas("aug19");

    // 核准在 8/20 00:30 → 營收落 8/20。
    assert.equal(aug20.revenue["2026-08-20T00"], 510);
    // 建立在 8/19 23:00 → 新增訂單落 8/19，且 8/19 沒有營收。
    assert.deepEqual(aug19.orders, { "2026-08-19T23": 1 });
    assert.deepEqual(aug19.revenue, {}, "nothing was approved on 8/19");
  });

  await t.test("daily granularity fills missing days with 0", async () => {
    const d = await trendDeltas("aug14to20");
    assert.equal(d.raw.granularity, "day");

    const keys = d.raw.revenue.map((p) => p.key);
    assert.deepEqual(keys, [
      "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20",
    ], "every day in the period must have a bucket");

    // 只有 8/14、8/16、8/20 有營收；其餘為 0（差值中不出現即代表補 0 後未變動）。
    assert.deepEqual(d.revenue, { "2026-08-14": 100, "2026-08-16": 200, "2026-08-20": 560 });
    // 8/19 建立那筆讓 orders 多一天。
    assert.deepEqual(d.orders, { "2026-08-14": 1, "2026-08-16": 1, "2026-08-19": 1, "2026-08-20": 3 });

    // 補 0 的日期確實存在且為數字 0（不是 undefined / null）。
    const revenueByKey = byKey(d.raw.revenue);
    for (const gap of ["2026-08-15", "2026-08-17", "2026-08-18"]) {
      assert.equal(typeof revenueByKey[gap], "number");
    }
  });

  await t.test("monthly granularity counts only rows inside the period for partial months", async () => {
    const d = await trendDeltas("janToMay");
    assert.equal(d.raw.granularity, "month");
    assert.deepEqual(d.raw.revenue.map((p) => p.key), ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);

    // 1/20 在期間內、1/05 在期間外（期間自 1/15 起）；
    // 5/01 在期間內、5/20 在期間外（期間至 5/10 止）。
    assert.deepEqual(d.revenue, { "2026-01": 11, "2026-03": 33, "2026-05": 55 });
    assert.deepEqual(d.orders, { "2026-01": 1, "2026-03": 1, "2026-05": 1 });
  });

  await t.test("approved orders without paid_at never reach period revenue or any trend bucket", async () => {
    const trends = await trendDeltas("legacy");
    assert.deepEqual(trends.revenue, {}, "legacy row has no recognition timestamp");
    // 但它確實是該期間建立的訂單。單日期間 → hourly，建立於台北 12:00。
    assert.equal(trends.raw.granularity, "hour");
    assert.deepEqual(trends.orders, { "2026-06-10T12": 1 });

    const summary = await getDashboardSummary(PERIODS.legacy);
    const base = baselines.legacy;
    assert.equal(summary.periodRevenueAmount - base.periodRevenueAmount, 0, "must not fall back to created_at");
    assert.equal(summary.newOrdersCount - base.newOrdersCount, 1);
    /*
     * all-time 營收仍包含它 —— 這正是已知的 legacy gap：Σ(各期間營收) 會小於 revenueAmount。
     * 本測試插入的 approved fixture 金額合計 6365，其中 4242 沒有 paid_at，
     * 因此**永遠**不會落進任何 reporting period 或 trend bucket。
     */
    const APPROVED_FIXTURE_TOTAL = 10 + 20 + 30 + 999 + 100 + 200 + 500 + 11 + 77 + 33 + 55 + 88 + 4242;
    assert.equal(summary.revenueAmount - base.revenueAmount, APPROVED_FIXTURE_TOTAL);
    assert.equal(APPROVED_FIXTURE_TOTAL - 4242, 2123, "the reachable-by-period portion");
  });

  await t.test("trend totals reconcile with the period KPI", async () => {
    const summary = await getDashboardSummary(PERIODS.aug14to20);
    const base = baselines.aug14to20;
    const trends = await trendDeltas("aug14to20");

    const revenueSum = Object.values(trends.revenue).reduce((a, b) => a + b, 0);
    const ordersSum = Object.values(trends.orders).reduce((a, b) => a + b, 0);
    assert.equal(revenueSum, summary.periodRevenueAmount - base.periodRevenueAmount);
    assert.equal(ordersSum, summary.newOrdersCount - base.newOrdersCount);
  });

  await t.test("previous period metadata is resolved by the backend", async () => {
    const s = await getDashboardSummary(PERIODS.aug14to20);
    // 8/14–8/20（7 天）→ 8/07–8/13（7 天），緊鄰且不重疊。
    assert.equal(s.previousPeriodFrom, "2026-08-07");
    assert.equal(s.previousPeriodTo, "2026-08-13");
  });

  await t.test("this_month comparison uses last month's same elapsed-day window", async () => {
    const period = presetPeriod("this_month", new Date("2026-08-20T04:00:00.000Z"));
    const s = await getDashboardSummary(period);
    assert.equal(s.periodFrom, "2026-08-01");
    assert.equal(s.periodTo, "2026-08-20");
    assert.equal(s.previousPeriodFrom, "2026-07-01");
    assert.equal(s.previousPeriodTo, "2026-07-20");
  });

  await t.test("comparison metrics and deltaPercent are computed against the previous period", async () => {
    // current = 8/20（單日），previous = 8/19。
    // 8/20 營收 560（10+20+30+500），8/19 營收 0 → previous 為 0 且 current > 0 → null。
    // 8/20 新增訂單 3，8/19 新增訂單 1 → +200%。
    const period = PERIODS.aug20;
    const s = await getDashboardSummary(period);
    const base = baselines.aug20;

    assert.equal(s.periodRevenueAmount - base.periodRevenueAmount, 560);
    assert.equal(s.newOrdersCount - base.newOrdersCount, 3);
    assert.equal(s.previousNewOrdersCount - (base.previousNewOrdersCount ?? 0), 1, "8/19 gained one order");
    assert.equal(s.previousPeriodFrom, "2026-08-19");
    assert.equal(s.previousPeriodTo, "2026-08-19");

    // deltaPercent 一定是 number 或 null，永遠不是 NaN / Infinity。
    for (const key of [
      "revenueDeltaPercent", "newOrdersDeltaPercent", "newUsersDeltaPercent",
      "newMaterialsDeltaPercent", "newReviewsDeltaPercent",
    ]) {
      const v = s[key];
      assert.ok(v === null || Number.isFinite(v), `${key} must be a finite number or null, got ${v}`);
    }
  });

  await t.test("snapshot metrics are unaffected by trends and comparison", async () => {
    const a = await getDashboardSummary(PERIODS.aug20);
    const b = await getDashboardSummary(PERIODS.janToMay);
    for (const key of ["ordersCount", "usersCount", "materialsCount", "reviewsCount", "revenueAmount"]) {
      assert.equal(a[key], b[key], `${key} must not change with the reporting period`);
    }
  });

  await t.test("trends echo the resolved period metadata", async () => {
    const trends = await getDashboardTrends(PERIODS.janToMay);
    assert.equal(trends.periodFrom, "2026-01-15");
    assert.equal(trends.periodTo, "2026-05-10");
    assert.equal(trends.periodTimezone, "Asia/Taipei");
    assert.equal(trends.periodPreset, "custom");
    assert.equal(trends.revenue.length, trends.orders.length);
  });

  t.after(async () => {
    await cleanup();
    await db.pool.end();
  });
});
