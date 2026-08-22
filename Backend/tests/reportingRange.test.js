/**
 * `utils/reportingRange` 的純函式測試 —— 不連資料庫。
 *
 *   node --test tests/reportingRange.test.js
 *   npm run test:unit --prefix Backend
 *
 * 「現在」一律以 `opts.now` 注入固定時間點，因此測試結果與執行主機時區無關。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REPORTING_TIMEZONE,
  MAX_RANGE_DAYS,
  InvalidDateRangeError,
  addDays,
  diffDays,
  startOfMonth,
  todayInTimezone,
  resolveReportingRange,
} = require("../utils/reportingRange");

/** 2026-08-20 12:00 Asia/Taipei */
const NOON_20260820_TPE = new Date("2026-08-20T04:00:00.000Z");

function resolve(query, now = NOON_20260820_TPE) {
  return resolveReportingRange(query, { now });
}

test("timezone constant is Asia/Taipei", () => {
  assert.equal(REPORTING_TIMEZONE, "Asia/Taipei");
});

test("todayInTimezone uses the Taipei calendar day, not UTC", () => {
  // 台北 2026-08-20 00:30 → UTC 仍是 2026-08-19T16:30Z。
  // 這是舊實作（toISOString().slice(0,10)）會算成 8/19 的關鍵情境。
  const justAfterTaipeiMidnight = new Date("2026-08-19T16:30:00.000Z");
  assert.equal(todayInTimezone("Asia/Taipei", justAfterTaipeiMidnight), "2026-08-20");
  assert.equal(todayInTimezone("UTC", justAfterTaipeiMidnight), "2026-08-19");

  // 台北 2026-08-20 23:30 → UTC 已是 8/20 15:30Z，兩者同日。
  const lateTaipeiEvening = new Date("2026-08-20T15:30:00.000Z");
  assert.equal(todayInTimezone("Asia/Taipei", lateTaipeiEvening), "2026-08-20");

  // 台北 2026-08-19 23:59 → UTC 是 8/19 15:59Z。
  const justBeforeTaipeiMidnight = new Date("2026-08-19T15:59:59.000Z");
  assert.equal(todayInTimezone("Asia/Taipei", justBeforeTaipeiMidnight), "2026-08-19");
});

test("preset: today", () => {
  const r = resolve({ range: "today" });
  assert.deepEqual(
    { preset: r.preset, from: r.from, to: r.to, endExclusive: r.endExclusive, timezone: r.timezone },
    { preset: "today", from: "2026-08-20", to: "2026-08-20", endExclusive: "2026-08-21", timezone: "Asia/Taipei" }
  );
});

test("preset: today resolves from the Taipei day even just after Taipei midnight", () => {
  const r = resolve({ range: "today" }, new Date("2026-08-19T16:30:00.000Z"));
  assert.equal(r.from, "2026-08-20");
  assert.equal(r.to, "2026-08-20");
  assert.equal(r.endExclusive, "2026-08-21");
});

test("preset: 7d is 7 inclusive Taipei calendar days ending today", () => {
  const r = resolve({ range: "7d" });
  assert.equal(r.from, "2026-08-14");
  assert.equal(r.to, "2026-08-20");
  assert.equal(diffDays(r.from, r.to) + 1, 7);
  assert.equal(r.endExclusive, "2026-08-21");
});

test("preset: 30d is 30 inclusive Taipei calendar days ending today", () => {
  const r = resolve({ range: "30d" });
  assert.equal(r.from, "2026-07-22");
  assert.equal(r.to, "2026-08-20");
  assert.equal(diffDays(r.from, r.to) + 1, 30);
});

test("preset: this_month starts at the 1st and ends today, not at month end", () => {
  const r = resolve({ range: "this_month" });
  assert.equal(r.from, "2026-08-01");
  assert.equal(r.to, "2026-08-20");
  assert.equal(r.endExclusive, "2026-08-21");
});

test("preset: 30d crosses a month boundary and a short February", () => {
  // 2026-03-01 往回 29 天 → 2026-01-31（2026 年 2 月為 28 天）。
  const r = resolve({ range: "30d" }, new Date("2026-03-01T04:00:00.000Z"));
  assert.equal(r.from, "2026-01-31");
  assert.equal(r.to, "2026-03-01");
  assert.equal(diffDays(r.from, r.to) + 1, 30);
});

test("preset: this_month on the 1st is a single day", () => {
  const r = resolve({ range: "this_month" }, new Date("2026-03-01T04:00:00.000Z"));
  assert.equal(r.from, "2026-03-01");
  assert.equal(r.to, "2026-03-01");
  assert.equal(r.endExclusive, "2026-03-02");
});

test("leap year: calendar arithmetic around 2028-02-29", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2028-02-29", 1), "2028-03-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  // 非閏年
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");

  const r = resolve({ range: "7d" }, new Date("2028-02-29T04:00:00.000Z"));
  assert.equal(r.from, "2028-02-23");
  assert.equal(r.to, "2028-02-29");
  assert.equal(r.endExclusive, "2028-03-01");
});

test("leap year: 2028-02-29 is a valid custom date, 2026-02-29 is not", () => {
  const ok = resolve({ range: "custom", from: "2028-02-29", to: "2028-02-29" }, new Date("2028-03-05T04:00:00.000Z"));
  assert.equal(ok.from, "2028-02-29");
  assert.throws(() => resolve({ range: "custom", from: "2026-02-01", to: "2026-02-29" }), InvalidDateRangeError);
});

test("endExclusive is always to + 1 day (half-open range)", () => {
  // 月底 → 次月 1 日
  const monthEnd = resolve({ range: "custom", from: "2026-08-01", to: "2026-08-31" }, new Date("2026-09-10T04:00:00.000Z"));
  assert.equal(monthEnd.endExclusive, "2026-09-01");
  // 年底 → 次年 1 月 1 日
  const yearEnd = resolve({ range: "custom", from: "2025-12-31", to: "2025-12-31" });
  assert.equal(yearEnd.endExclusive, "2026-01-01");
});

test("custom: explicit from/to without range is treated as custom", () => {
  const r = resolve({ from: "2026-08-01", to: "2026-08-10" });
  assert.equal(r.preset, "custom");
  assert.equal(r.from, "2026-08-01");
  assert.equal(r.to, "2026-08-10");
  assert.equal(r.endExclusive, "2026-08-11");
});

test("custom: a single day is valid", () => {
  const r = resolve({ range: "custom", from: "2026-08-20", to: "2026-08-20" });
  assert.equal(diffDays(r.from, r.to), 0);
  assert.equal(r.endExclusive, "2026-08-21");
});

test("default: no parameters resolves to 30d", () => {
  const r = resolve({});
  assert.equal(r.preset, "30d");
  assert.equal(r.from, "2026-07-22");
  assert.equal(r.to, "2026-08-20");
});

test("rejects malformed dates that PostgreSQL's ::date cast would otherwise accept", () => {
  for (const bad of ["2026-8-1", "20260820", "2026-08-20T00:00:00Z", "bad-date", "", "2026/08/20"]) {
    assert.throws(
      () => resolve({ range: "custom", from: bad, to: "2026-08-20" }),
      InvalidDateRangeError,
      `expected '${bad}' to be rejected`
    );
  }
});

test("rejects dates that do not exist on the calendar", () => {
  assert.throws(() => resolve({ range: "custom", from: "2026-02-31", to: "2026-08-20" }), InvalidDateRangeError);
  assert.throws(() => resolve({ range: "custom", from: "2026-13-01", to: "2026-08-20" }), InvalidDateRangeError);
  assert.throws(() => resolve({ range: "custom", from: "2026-04-31", to: "2026-08-20" }), InvalidDateRangeError);
});

test("rejects from after to", () => {
  assert.throws(() => resolve({ range: "custom", from: "2026-08-20", to: "2026-08-01" }), InvalidDateRangeError);
});

test("rejects an end date in the future (Asia/Taipei)", () => {
  assert.throws(() => resolve({ range: "custom", from: "2026-08-01", to: "2026-08-21" }), InvalidDateRangeError);
  // 台北今日本身可接受
  assert.doesNotThrow(() => resolve({ range: "custom", from: "2026-08-01", to: "2026-08-20" }));
});

test("rejects a range longer than the cap", () => {
  const tooLong = addDays("2026-08-20", -MAX_RANGE_DAYS);
  assert.throws(() => resolve({ range: "custom", from: tooLong, to: "2026-08-20" }), InvalidDateRangeError);
  const atCap = addDays("2026-08-20", -(MAX_RANGE_DAYS - 1));
  assert.doesNotThrow(() => resolve({ range: "custom", from: atCap, to: "2026-08-20" }));
});

test("rejects incomplete custom ranges instead of guessing", () => {
  assert.throws(() => resolve({ range: "custom", from: "2026-08-01" }), InvalidDateRangeError);
  assert.throws(() => resolve({ range: "custom", to: "2026-08-20" }), InvalidDateRangeError);
  assert.throws(() => resolve({ range: "custom" }), InvalidDateRangeError);
});

test("rejects unknown presets", () => {
  assert.throws(() => resolve({ range: "abc" }), InvalidDateRangeError);
  assert.throws(() => resolve({ range: "90d" }), InvalidDateRangeError);
});

test("presets ignore caller-supplied from/to", () => {
  const r = resolve({ range: "today", from: "2020-01-01", to: "2020-01-02" });
  assert.equal(r.from, "2026-08-20");
  assert.equal(r.to, "2026-08-20");
});

test("startOfMonth helper", () => {
  assert.equal(startOfMonth("2026-08-20"), "2026-08-01");
  assert.equal(startOfMonth("2026-01-01"), "2026-01-01");
});

// ── previous period ─────────────────────────────────────────────────────────
// 一般規則：緊鄰前一個等長期間，兩期完全不重疊。
// `this_month` 例外：上個月的相同 elapsed-day window（見 docs/mvp_rules.md §17.1）。

const { resolvePreviousPeriod, computeDeltaPercent, daysInMonth } = require("../utils/reportingRange");

function prev(query, now = NOON_20260820_TPE) {
  return resolvePreviousPeriod(resolveReportingRange(query, { now }));
}

test("previous period: today is yesterday (Taipei calendar day, not last 24h)", () => {
  const p = prev({ range: "today" });
  assert.equal(p.from, "2026-08-19");
  assert.equal(p.to, "2026-08-19");
  assert.equal(p.endExclusive, "2026-08-20");
});

test("previous period: 7d is the adjacent, non-overlapping 7 days", () => {
  const current = resolveReportingRange({ range: "7d" }, { now: NOON_20260820_TPE });
  const p = prev({ range: "7d" });
  assert.deepEqual([current.from, current.to], ["2026-08-14", "2026-08-20"]);
  assert.deepEqual([p.from, p.to], ["2026-08-07", "2026-08-13"]);
  assert.equal(diffDays(p.from, p.to) + 1, 7);
  // 不重疊：previous 的最後一天正好是 current 第一天的前一天。
  assert.equal(addDays(p.to, 1), current.from);
});

test("previous period: 30d", () => {
  const p = prev({ range: "30d" });
  assert.deepEqual([p.from, p.to], ["2026-06-22", "2026-07-21"]);
  assert.equal(diffDays(p.from, p.to) + 1, 30);
});

test("previous period: this_month uses last month's same elapsed-day window", () => {
  // current 8/01–8/20（20 天）→ previous 7/01–7/20（20 天），不是 7/12–7/31。
  const p = prev({ range: "this_month" });
  assert.deepEqual([p.from, p.to], ["2026-07-01", "2026-07-20"]);
});

test("previous period: this_month clamps to a shorter previous month", () => {
  // current 3/01–3/31 → previous 2/01–2/28（2026 非閏年）。絕不產生 2/31。
  const p = prev({ range: "this_month" }, new Date("2026-03-31T04:00:00.000Z"));
  assert.deepEqual([p.from, p.to], ["2026-02-01", "2026-02-28"]);
  // previous 比 current 短，是刻意且明確定義的行為。
  assert.equal(diffDays(p.from, p.to) + 1, 28);
});

test("previous period: this_month clamps to 29 in a leap year", () => {
  const p = prev({ range: "this_month" }, new Date("2028-03-31T04:00:00.000Z"));
  assert.deepEqual([p.from, p.to], ["2028-02-01", "2028-02-29"]);
});

test("previous period: this_month crosses the year boundary", () => {
  const p = prev({ range: "this_month" }, new Date("2026-01-15T04:00:00.000Z"));
  assert.deepEqual([p.from, p.to], ["2025-12-01", "2025-12-15"]);
});

test("previous period: custom is the adjacent equal-length window", () => {
  // 8/03–8/12 共 10 天 → 7/24–8/02 共 10 天。
  const p = prev({ range: "custom", from: "2026-08-03", to: "2026-08-12" });
  assert.deepEqual([p.from, p.to], ["2026-07-24", "2026-08-02"]);
  assert.equal(diffDays(p.from, p.to) + 1, 10);
});

test("previous period: custom single day", () => {
  const p = prev({ range: "custom", from: "2026-08-20", to: "2026-08-20" });
  assert.deepEqual([p.from, p.to], ["2026-08-19", "2026-08-19"]);
});

test("daysInMonth handles leap years", () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 1), 31);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

// ── growth ──────────────────────────────────────────────────────────────────

test("computeDeltaPercent: normal growth and decline", () => {
  assert.equal(computeDeltaPercent(120, 100), 20);
  assert.equal(computeDeltaPercent(80, 100), -20);
  assert.equal(computeDeltaPercent(100, 100), 0);
});

test("computeDeltaPercent: decline is negative, never absolute", () => {
  assert.equal(computeDeltaPercent(5, 10), -50);
  assert.equal(computeDeltaPercent(0, 10), -100);
});

test("computeDeltaPercent: zero denominator", () => {
  // 0 → 0：沒有變化。
  assert.equal(computeDeltaPercent(0, 0), 0);
  // 0 → 正數：百分比無有限值，回 null（UI 顯示「新增」）。
  // 刻意不沿用舊 wowReviewDeltaPercent 硬編 100 的規則。
  assert.equal(computeDeltaPercent(100, 0), null);
  assert.equal(computeDeltaPercent(1, 0), null);
});

test("computeDeltaPercent: rounds to a whole percent", () => {
  // 5000 vs 6000 → -16.67% → -17
  assert.equal(computeDeltaPercent(5000, 6000), -17);
  assert.equal(computeDeltaPercent(12000, 10000), 20);
  assert.equal(computeDeltaPercent(1004, 1000), 0);
});
