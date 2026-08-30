/**
 * 台灣日曆日的算術原語（canonical）。
 *
 * ## 這裡**沒有**任何期限、SLA 或法律語意
 *
 * 只有三件事：「這個時間點是台灣的哪一天」、「那一天加 N 天是哪一天」、
 * 「那一天的終了是哪個時間點」。
 *
 * 期限的**數值**與**法源**一律屬於各自的 policy 模組，**不得**放進這裡：
 *
 *   * `utils/complaintSla.js`        消保法 §43 II 十五日（法定申訴處理期限）
 *   * `utils/paymentTimingPolicy.js` 付款期限與人工核帳 SLA（營運政策）
 *
 * **兩者共用的只有下面的日期算術，不共用任何數字。**
 * 消費申訴的法定軌道與日常核帳的營運軌道完全不同，
 * 混用常數會讓其中一邊的調整無聲地改動另一邊。
 *
 * ## 為什麼日曆日一定要用 `Asia/Taipei`
 *
 * ```text
 * 台北 2026-08-27 00:30  ＝  UTC 2026-08-26 16:30
 *   以台灣日曆日算 → 8/27   ✅
 *   以 UTC 日曆日算 → 8/26   ❌ 差一天
 * ```
 *
 * 因此一律用 `Intl.DateTimeFormat` 取 `Asia/Taipei` 分量，
 * **不得**用 `toISOString().slice(0, 10)`（UTC 日）或 `getDate()`（主機本地日）。
 * 這與 `utils/reportingRange.js` 的既有慣例一致。
 *
 * 台灣自 1979 年起**沒有日光節約時間**，全年固定 UTC+8，
 * 因此「某日終了」可直接表達為同日的 `15:59:59.999Z`。此假設由測試明文驗證。
 */

/** 全系統的法律／營運日曆時區。 */
const TAIWAN_TIMEZONE = "Asia/Taipei";

/** 台灣固定 UTC+8（1979 年後無日光節約時間）。 */
const TAIWAN_UTC_OFFSET_HOURS = 8;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value, label) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${label}: invalid date`);
  return d;
}

/** 某個時間點在**台灣**的日曆日（`YYYY-MM-DD`）。與執行主機時區無關。 */
function taiwanCalendarDate(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TAIWAN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(toDate(instant, "taiwanCalendarDate"));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 日曆日加天數。在 UTC 曆面上運算，因此純粹是日期字串的算術，與主機時區無關。 */
function addCalendarDays(dateString, days) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
  const pad = (n) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 台灣某日曆日的**終了**（`23:59:59.999` 台北）對應的時間點。 */
function endOfTaiwanDay(dateString) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23 - TAIWAN_UTC_OFFSET_HOURS, 59, 59, 999));
}

/** 兩個時間點相差幾個**台灣日曆日**（正數 = `to` 在 `from` 之後）。 */
function calendarDaysBetween(from, to) {
  const asUtc = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round(
    (asUtc(taiwanCalendarDate(to)) - asUtc(taiwanCalendarDate(from))) / MS_PER_DAY
  );
}

module.exports = {
  TAIWAN_TIMEZONE,
  TAIWAN_UTC_OFFSET_HOURS,
  MS_PER_DAY,
  toDate,
  taiwanCalendarDate,
  addCalendarDays,
  endOfTaiwanDay,
  calendarDaysBetween,
};
