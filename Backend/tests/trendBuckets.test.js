/**
 * `utils/trendBuckets` 的純函式測試 —— 不連資料庫。
 *
 *   node --test tests/trendBuckets.test.js
 *   npm run test:unit --prefix Backend
 *
 * 覆蓋 granularity 選擇、預期 bucket 序列、以及缺口補 0。
 * SQL 端的時區分組由 `tests/dashboardPeriod.db.test.js` 覆蓋。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveGranularity, expectedBucketKeys, fillBuckets, DAILY_MAX_DAYS } = require("../utils/trendBuckets");
const { addDays } = require("../utils/reportingRange");

const period = (from, to) => ({ from, to });

// ── granularity ─────────────────────────────────────────────────────────────

test("granularity: a single day is hourly", () => {
  assert.equal(resolveGranularity(period("2026-08-20", "2026-08-20")), "hour");
});

test("granularity: 2–90 days is daily", () => {
  assert.equal(resolveGranularity(period("2026-08-19", "2026-08-20")), "day");
  assert.equal(resolveGranularity(period("2026-08-14", "2026-08-20")), "day"); // 7d
  assert.equal(resolveGranularity(period("2026-07-22", "2026-08-20")), "day"); // 30d
  // 剛好 90 天仍是 daily
  const ninety = addDays("2026-08-20", -(DAILY_MAX_DAYS - 1));
  assert.equal(resolveGranularity(period(ninety, "2026-08-20")), "day");
});

test("granularity: 91 days and above is monthly", () => {
  const ninetyOne = addDays("2026-08-20", -DAILY_MAX_DAYS);
  assert.equal(resolveGranularity(period(ninetyOne, "2026-08-20")), "month");
  // custom 上限 365 天仍是 monthly（不需要年粒度）
  assert.equal(resolveGranularity(period("2025-08-21", "2026-08-20")), "month");
});

test("granularity: this_month with 20 elapsed days is daily, not a single monthly point", () => {
  assert.equal(resolveGranularity(period("2026-08-01", "2026-08-20")), "day");
});

// ── expected bucket keys ────────────────────────────────────────────────────

test("hourly: exactly 24 buckets, including hours that have not happened yet", () => {
  const keys = expectedBucketKeys(period("2026-08-20", "2026-08-20"), "hour");
  assert.equal(keys.length, 24);
  assert.equal(keys[0], "2026-08-20T00");
  assert.equal(keys[14], "2026-08-20T14");
  assert.equal(keys[23], "2026-08-20T23");
});

test("daily: one bucket per inclusive Taipei calendar day", () => {
  const keys = expectedBucketKeys(period("2026-08-14", "2026-08-20"), "day");
  assert.deepEqual(keys, [
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
  ]);
});

test("daily: crosses a month boundary without gaps or duplicates", () => {
  const keys = expectedBucketKeys(period("2026-01-30", "2026-02-02"), "day");
  assert.deepEqual(keys, ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
});

test("daily: a single-day custom range still produces one bucket", () => {
  assert.deepEqual(expectedBucketKeys(period("2026-08-20", "2026-08-20"), "day"), ["2026-08-20"]);
});

test("monthly: every month touched by the range, including partial first/last", () => {
  // §59：1/15 ~ 5/10 → 五個月 key；頭尾只被期間涵蓋一部分，
  // 但仍必須各有一個 bucket（實際數值由 SQL 的 [start, end) 過濾決定）。
  const keys = expectedBucketKeys(period("2026-01-15", "2026-05-10"), "month");
  assert.deepEqual(keys, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
});

test("monthly: crosses the year boundary", () => {
  const keys = expectedBucketKeys(period("2025-11-15", "2026-02-10"), "month");
  assert.deepEqual(keys, ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("monthly: a 365-day range produces at most 13 buckets", () => {
  const keys = expectedBucketKeys(period("2025-08-21", "2026-08-20"), "month");
  assert.equal(keys.length, 13);
  assert.equal(keys[0], "2025-08");
  assert.equal(keys[12], "2026-08");
});

// ── gap filling ─────────────────────────────────────────────────────────────

test("fillBuckets: missing buckets become 0, order follows the expected sequence", () => {
  // SQL 只回有資料的 bucket；圖表不能跳日期。
  const keys = expectedBucketKeys(period("2026-08-14", "2026-08-20"), "day");
  const rows = [
    { bucket: "2026-08-14", value: 3 },
    { bucket: "2026-08-16", value: 5 },
    { bucket: "2026-08-20", value: 2 },
  ];
  assert.deepEqual(fillBuckets(keys, rows), [
    { key: "2026-08-14", value: 3 },
    { key: "2026-08-15", value: 0 },
    { key: "2026-08-16", value: 5 },
    { key: "2026-08-17", value: 0 },
    { key: "2026-08-18", value: 0 },
    { key: "2026-08-19", value: 0 },
    { key: "2026-08-20", value: 2 },
  ]);
});

test("fillBuckets: no rows at all yields an all-zero series, not an empty array", () => {
  // 全 0 是有效資料（該期間沒有營收），與「載入失敗」是兩回事。
  const keys = expectedBucketKeys(period("2026-08-19", "2026-08-20"), "day");
  assert.deepEqual(fillBuckets(keys, []), [
    { key: "2026-08-19", value: 0 },
    { key: "2026-08-20", value: 0 },
  ]);
});

test("fillBuckets: coerces bigint strings from node-postgres", () => {
  // SUM(...)::bigint 會以字串回傳。
  const filled = fillBuckets(["2026-08-20"], [{ bucket: "2026-08-20", value: "1200" }]);
  assert.deepEqual(filled, [{ key: "2026-08-20", value: 1200 }]);
});

test("fillBuckets: ignores rows outside the expected sequence", () => {
  const filled = fillBuckets(["2026-08-20"], [
    { bucket: "2026-08-20", value: 1 },
    { bucket: "2026-08-21", value: 99 },
  ]);
  assert.deepEqual(filled, [{ key: "2026-08-20", value: 1 }]);
});

test("fillBuckets: hourly sequence keeps all 24 slots", () => {
  const keys = expectedBucketKeys(period("2026-08-20", "2026-08-20"), "hour");
  const filled = fillBuckets(keys, [
    { bucket: "2026-08-20T00", value: 1 },
    { bucket: "2026-08-20T14", value: 2 },
    { bucket: "2026-08-20T23", value: 3 },
  ]);
  assert.equal(filled.length, 24);
  assert.equal(filled[0].value, 1);
  assert.equal(filled[13].value, 0);
  assert.equal(filled[14].value, 2);
  assert.equal(filled[23].value, 3);
});
