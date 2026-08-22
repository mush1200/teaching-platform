/**
 * Admin reporting period 的 canonical 解析器。
 *
 * 這是**唯一**允許把「使用者選的期間」轉成查詢邊界的地方。route / service / frontend
 * 都不得自行重算日期。
 *
 * 語意（見 docs/mvp_rules.md §15）：
 *
 *   Timezone   Asia/Taipei（固定；不跟隨 server 或 browser 時區）
 *   from / to  inclusive calendar date，格式一律 `YYYY-MM-DD`
 *   查詢邊界    half-open [start, end)，其中 end = to + 1 天的台北 00:00
 *
 * 刻意不使用的危險寫法：
 *   - `new Date("2026-08-20")`  → 那是 UTC 午夜，不是台北日曆日
 *   - `toISOString().slice(0,10)` → 那是 UTC 日曆日
 *   - `setHours(23,59,59,999)`  → 閉區間 + 毫秒精度，本模組一律 half-open
 *
 * 所有日期運算都在 UTC 曆面上進行（`Date.UTC` / `getUTC*`），因此結果與執行主機的
 * 時區完全無關 —— 這裡處理的是「日曆日字串」，不是時間點。真正的時區轉換發生在 SQL
 * （見 `services/adminDashboard.service.js`），由 PostgreSQL 的 `AT TIME ZONE` 負責。
 */

const REPORTING_TIMEZONE = "Asia/Taipei";

/** 預設期間：無任何參數時（含舊 caller）採用近 30 天。 */
const DEFAULT_PRESET = "30d";

/** custom 期間的上限。避免極端請求；MVP 階段資料量小，此值僅為護欄。 */
const MAX_RANGE_DAYS = 365;

const PRESETS = new Set(["today", "7d", "30d", "this_month", "custom"]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class InvalidDateRangeError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidDateRangeError";
    this.code = "INVALID_DATE_RANGE";
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * 嚴格解析 `YYYY-MM-DD`。
 *
 * 不能只靠 PostgreSQL 的 `::date` cast：實測 `2026-8-1`、`20260820`、
 * `2026-08-20T00:00:00Z` 都會被 cast 接受，那會讓 API 對外的契約變得模糊。
 * 這裡同時擋掉不存在的日期（`2026-02-31`），閏年由 `Date.UTC` 正確處理。
 */
function parseIsoDate(value, label) {
  const raw = String(value ?? "").trim();
  if (!ISO_DATE_RE.test(raw)) {
    throw new InvalidDateRangeError(`${label} must be a calendar date in YYYY-MM-DD format`);
  }
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new InvalidDateRangeError(`${label} is not a real calendar date: ${raw}`);
  }
  return raw;
}

function toUtcEpochDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcEpochDay(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** 日曆日加減。`n` 可為負。 */
function addDays(dateStr, n) {
  return fromUtcEpochDay(toUtcEpochDay(dateStr) + n * 86400000);
}

/** `to - from` 的日曆日差（同一天為 0）。 */
function diffDays(fromDate, toDate) {
  return Math.round((toUtcEpochDay(toDate) - toUtcEpochDay(fromDate)) / 86400000);
}

/** 該月的第一天。 */
function startOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

/**
 * 指定時區「現在」的日曆日期。
 *
 * 用 `Intl` 取分量再自行組裝，不依賴 locale 的預設格式，也不經過 `toISOString()`。
 * `now` 可注入以利測試。
 */
function todayInTimezone(timeZone = REPORTING_TIMEZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * 把 preset 或 custom from/to 解析成 canonical 期間。
 *
 * 回傳的 `from` / `to` 皆為 **inclusive** 日曆日；`endExclusive` 為 `to + 1 天`，
 * 供 SQL 以 `>= from AND < endExclusive` 查詢。
 *
 * @param {{range?: string, from?: string, to?: string}} query
 * @param {{now?: Date}} [opts]
 * @returns {{preset: string, from: string, to: string, endExclusive: string, timezone: string}}
 * @throws {InvalidDateRangeError}
 */
function resolveReportingRange(query = {}, opts = {}) {
  const today = todayInTimezone(REPORTING_TIMEZONE, opts.now ?? new Date());

  const hasFrom = query.from != null && String(query.from).trim() !== "";
  const hasTo = query.to != null && String(query.to).trim() !== "";
  const rawRange = query.range != null && String(query.range).trim() !== "" ? String(query.range).trim().toLowerCase() : null;

  // 未指定 range 但給了 from/to → 視為 custom（§10 的 `?from=&to=` 契約）。
  let preset = rawRange ?? (hasFrom || hasTo ? "custom" : DEFAULT_PRESET);

  if (!PRESETS.has(preset)) {
    throw new InvalidDateRangeError(`range must be one of ${[...PRESETS].join("|")}`);
  }

  let from;
  let to;

  if (preset === "custom") {
    if (!hasFrom || !hasTo) {
      throw new InvalidDateRangeError("range=custom requires both from and to");
    }
    from = parseIsoDate(query.from, "from");
    to = parseIsoDate(query.to, "to");
  } else {
    // preset 一律由 server 依台北「今天」推導，caller 不得覆寫。
    to = today;
    if (preset === "today") from = today;
    else if (preset === "7d") from = addDays(today, -6);
    else if (preset === "30d") from = addDays(today, -29);
    else from = startOfMonth(today); // this_month
  }

  if (diffDays(from, to) < 0) {
    throw new InvalidDateRangeError("from must not be after to");
  }
  // 未來日期不納入 current period：期末不得晚於台北今日。
  if (diffDays(to, today) < 0) {
    throw new InvalidDateRangeError("to must not be in the future (Asia/Taipei)");
  }
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) {
    throw new InvalidDateRangeError(`range must not exceed ${MAX_RANGE_DAYS} days`);
  }

  return { preset, from, to, endExclusive: addDays(to, 1), timezone: REPORTING_TIMEZONE };
}

/** 指定年月的天數（`m` 為 1–12）。用 UTC 曆面計算，閏年自動正確。 */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 上個月的「相同 elapsed-day window」。
 *
 * `this_month` 專用：比較 20 天 vs 20 天，而不是 20 天 vs 整個 31 天。
 * 上個月較短時夾到該月最後一日 —— 絕不產生 2/31 這種不存在的日期，
 * 此時 previous 期間會比 current 短，這是刻意且明確定義的行為。
 */
function previousMonthWindow(from, to) {
  const [y, m] = from.split("-").map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const endDay = Math.min(Number(to.split("-")[2]), daysInMonth(prevYear, prevMonth));
  return {
    from: `${prevYear}-${pad2(prevMonth)}-01`,
    to: `${prevYear}-${pad2(prevMonth)}-${pad2(endDay)}`,
  };
}

/**
 * Current period 的比較基準期。
 *
 * 一般規則（today / 7d / 30d / custom）：**緊鄰前一個等長期間**，兩期完全不重疊。
 *   previousTo   = from - 1 天
 *   previousFrom = previousTo - (天數 - 1)
 *
 * `this_month` 例外：改用上個月的相同 elapsed-day window（見 `previousMonthWindow`）。
 * 用等長規則的話，8/01–8/20 會得到 7/12–7/31，那對「本月至今 vs 上月同期」沒有營運意義。
 *
 * @param {{preset: string, from: string, to: string}} period 由 `resolveReportingRange` 產生
 */
function resolvePreviousPeriod(period) {
  const window =
    period.preset === "this_month"
      ? previousMonthWindow(period.from, period.to)
      : (() => {
          const to = addDays(period.from, -1);
          return { from: addDays(to, -diffDays(period.from, period.to)), to };
        })();

  return {
    from: window.from,
    to: window.to,
    endExclusive: addDays(window.to, 1),
    timezone: REPORTING_TIMEZONE,
  };
}

/**
 * Canonical 成長率。**唯一**允許計算 deltaPercent 的地方（前端只負責顯示）。
 *
 *   previous > 0              → 四捨五入後的百分比變化（可為負，不取絕對值）
 *   previous = 0, current = 0 → 0（沒有變化）
 *   previous = 0, current > 0 → **null**，因為百分比在數學上沒有有限值可表示
 *
 * 刻意不沿用舊 `wowReviewDeltaPercent` 把「從 0 成長」硬編成 100% 的規則 ——
 * 那是任意值，會讓 0→1 與 0→10000 看起來一樣。UI 對 null 顯示「新增」。
 *
 * @returns {number|null}
 */
function computeDeltaPercent(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : null;
  return Math.round(((c - p) / p) * 100);
}

module.exports = {
  REPORTING_TIMEZONE,
  DEFAULT_PRESET,
  MAX_RANGE_DAYS,
  InvalidDateRangeError,
  parseIsoDate,
  addDays,
  diffDays,
  daysInMonth,
  startOfMonth,
  todayInTimezone,
  resolveReportingRange,
  resolvePreviousPeriod,
  computeDeltaPercent,
};
