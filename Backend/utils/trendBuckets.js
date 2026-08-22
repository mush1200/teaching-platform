/**
 * Trend chart 的 bucket 規則：granularity 決定、預期序列產生、缺口補 0。
 *
 * 這裡只做**日曆運算**（純字串 / `Date.UTC` 曆面），與執行主機時區無關。
 * 真正的時區換算發生在 SQL（見 `services/adminTrends.service.js`），
 * 兩邊共用同一組 bucket key 格式，因此 merge 時不需要任何再解析。
 *
 * 語意見 docs/mvp_rules.md §16。
 */

const { addDays, diffDays } = require("./reportingRange");

/** Bucket 粒度。key 格式與 SQL 的 `to_char` 樣板一一對應。 */
const GRANULARITY = Object.freeze({ HOUR: "hour", DAY: "day", MONTH: "month" });

/** `date_trunc()` 的第一個參數。以固定對照表取值，不讓外部字串進入 SQL。 */
const TRUNC_UNIT = Object.freeze({ hour: "hour", day: "day", month: "month" });

/**
 * `to_char()` 樣板。產生的 key 是 machine-friendly 識別碼，不是給人看的 label：
 *   hour  → `2026-08-20T14`
 *   day   → `2026-08-20`
 *   month → `2026-08`
 * 顯示用的格式（`14:00`、`8/20`、`2026/08`）由前端負責。
 */
const KEY_FORMAT = Object.freeze({
  hour: 'YYYY-MM-DD"T"HH24',
  day: "YYYY-MM-DD",
  month: "YYYY-MM",
});

/** 單日 → 小時；2–90 天 → 日；91 天以上 → 月（custom 上限 365 天，故不需要年粒度）。 */
const DAILY_MAX_DAYS = 90;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * 依 current period 長度決定粒度。
 * @param {{from: string, to: string}} period
 * @returns {"hour"|"day"|"month"}
 */
function resolveGranularity(period) {
  const days = diffDays(period.from, period.to) + 1;
  if (days <= 1) return GRANULARITY.HOUR;
  if (days <= DAILY_MAX_DAYS) return GRANULARITY.DAY;
  return GRANULARITY.MONTH;
}

/**
 * 期間內**所有**應該存在的 bucket key，依時間排序。
 *
 * SQL 只會回傳有資料的 bucket，這份序列就是補 0 的依據 —— 圖表不能跳日期。
 *
 * - hour：固定 24 個 bucket（`00`–`23`）。刻意包含尚未到來的小時並補 0，
 *   讓 x 軸點數在一天之內保持穩定，不會每過一小時就變形。
 * - month：頭尾月份可能只被期間涵蓋一部分；此處仍產生完整的月 key，
 *   實際數值由 SQL 的 `[start, end)` 過濾決定，因此只會計入期間內的資料。
 *
 * @param {{from: string, to: string}} period
 * @param {"hour"|"day"|"month"} granularity
 * @returns {string[]}
 */
function expectedBucketKeys(period, granularity) {
  if (granularity === GRANULARITY.HOUR) {
    return Array.from({ length: 24 }, (_, h) => `${period.from}T${pad2(h)}`);
  }

  if (granularity === GRANULARITY.DAY) {
    const keys = [];
    for (let day = period.from; diffDays(day, period.to) >= 0; day = addDays(day, 1)) {
      keys.push(day);
    }
    return keys;
  }

  const keys = [];
  let [year, month] = period.from.split("-").slice(0, 2).map(Number);
  const [endYear, endMonth] = period.to.split("-").slice(0, 2).map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${pad2(month)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/**
 * 把 SQL 結果 merge 進完整 bucket 序列，沒有資料的 bucket 補 `0`。
 *
 * `0` 是有效資料（該期間確實沒有營收／訂單），與「資料載入失敗」是兩回事 ——
 * 後者由 endpoint 的錯誤處理表達，不得用空陣列混充。
 *
 * @param {string[]} keys `expectedBucketKeys` 的輸出
 * @param {Array<{bucket: string, value: number|string}>} rows
 * @returns {Array<{key: string, value: number}>}
 */
function fillBuckets(keys, rows) {
  const byKey = new Map(rows.map((row) => [String(row.bucket), Number(row.value) || 0]));
  return keys.map((key) => ({ key, value: byKey.get(key) ?? 0 }));
}

module.exports = {
  GRANULARITY,
  TRUNC_UNIT,
  KEY_FORMAT,
  DAILY_MAX_DAYS,
  resolveGranularity,
  expectedBucketKeys,
  fillBuckets,
};
