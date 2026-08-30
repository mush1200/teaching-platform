/**
 * 消費申訴的法定處理期限（canonical）。
 *
 * **這裡是唯一的定義來源。** service、route、測試、逾期偵測都從這裡讀，
 * 不得在任何地方散落 `15` 這個數字或自己算 due date。
 *
 * ## 法源（四條，缺一不可）
 *
 *   * **消保法 §43 II** —— 「企業經營者對於消費者之申訴，應於**申訴之日起十五日內**
 *     妥適處理之。」（期間長度）
 *   * **民法 §120 II** —— 「以日、星期、月或年定期間者，其**始日不算入**。」（起算）
 *   * **民法 §121 I** —— 「以日、星期、月或年定期間者，以**期間末日之終止**為期間終止。」
 *     （末日的哪一刻）
 *   * **民法 §122** —— 「於一定期日或期間內，應為意思表示或給付者，其**期日或期間之末日，
 *     為星期日、紀念日或其他休息日時，以其休息日之次日代之**。」（末日展延）
 *
 * ## 正確的計算
 *
 * ```text
 * 申訴日（台灣日曆日）     2026-08-26   ← §120 II：始日不算入
 * Day 1                    2026-08-27
 * …
 * Day 15 ＝ 期間末日        2026-09-10   ＝ 申訴日 + 15 個日曆日
 * 期間終止                  2026-09-10 23:59:59.999（台北）  ← §121 I
 * ```
 *
 * ### 2026-08-26 修正（Wave 2 #6 CORRECTION）
 *
 * 初版寫成 `submittedAt + 16 × 24h`，同時錯了兩件事：
 *
 *   1. **多算一天。** `+16` 把「始日不算入」誤解成「往後推一天再數 15 天」；
 *      正確是**申訴日的日曆日 + 15 天**（8/26 → 9/10，不是 9/11）。
 *   2. **沒有處理「末日之終止」。** 直接加毫秒會讓 10:37 提出的申訴在末日 10:37 就到期，
 *      而 §121 I 說的是**末日終了**。
 *
 * 另外初版用 `Date` 毫秒運算，隱含「以執行主機時區判斷日期」的風險 —— 見下節。
 *
 * ## 台灣日曆日，不是 UTC 日曆日，也不是主機本地日
 *
 * 期間是**法律上的日曆日**，必須以 `Asia/Taipei` 判斷，理由是實際會差一天：
 *
 * ```text
 * 台北 2026-08-27 00:30  ＝  UTC 2026-08-26 16:30
 *   以台灣日曆日算 → 申訴日 8/27 → 末日 9/11   ✅
 *   以 UTC 日曆日算 → 申訴日 8/26 → 末日 9/10   ❌ 少一天
 * ```
 *
 * 因此日曆日一律用 `Intl.DateTimeFormat` 取 `Asia/Taipei` 分量，
 * **不得**用 `toISOString().slice(0, 10)`（那是 UTC 日）或 `getDate()`（那是主機本地日）。
 * 這與 `utils/reportingRange.js` 的既有慣例一致。
 *
 * 台灣自 1979 年起**沒有日光節約時間**，全年固定 UTC+8，因此末日終了可直接表達為
 * 同日的 `15:59:59.999Z`。此假設由測試明文驗證（一月與七月的偏移皆為 +8）。
 *
 * ## §122 末日展延：**尚未實作**
 *
 * `星期日、紀念日或其他休息日` 需要權威的國定假日來源（行政院人事行政總處行事曆），
 * repo 目前**沒有**任何 holiday / calendar primitive，本輪也**不建立**一套假日系統。
 *
 * 因此本模組回傳的是**最早可能的法定末日**（`REST_DAY_EXTENSION = "NOT_IMPLEMENTED"`）。
 * §122 的效果**只會把末日往後推、不會往前**，所以：
 *
 *   * 對外的期限承諾**不得**直接引用本值（可能早於真正的法定期限）；
 *   * `isOverdue()` 因此是**保守的** —— 它可能比真正的法定逾期更早示警。
 *     對營運而言偏安全（提早處理），但**不得**當成法律上已逾期的認定。
 *
 * 追蹤見 `docs/pending-work-tracker.md` 的 `LEGAL-01`。
 */

const {
  TAIWAN_TIMEZONE,
  TAIWAN_UTC_OFFSET_HOURS,
  MS_PER_DAY,
  toDate,
  taiwanCalendarDate,
  addCalendarDays,
  endOfTaiwanDay,
} = require("./taiwanCalendar");

/**
 * 法定期間一律以台灣日曆日判斷。
 *
 * 日期算術本身來自 `utils/taiwanCalendar.js`（2026-08-26 抽出的共用原語）——
 * **只共用「怎麼在台灣曆上加天數」，不共用任何期限數字**。
 * 本模組是消保法 §43 II 的法定申訴軌道；
 * `utils/paymentTimingPolicy.js` 是日常核帳的營運軌道。兩者的數字絕不互通。
 */
const LEGAL_TIMEZONE = TAIWAN_TIMEZONE;

/** 消保法 §43 II 的法定處理日數。**不得在別處重寫這個數字。** */
const STATUTORY_HANDLING_DAYS = 15;

/**
 * §122 末日展延的實作狀態。
 *
 * `NOT_IMPLEMENTED` 表示本模組回傳的是**最早可能**的法定末日；
 * 真正的末日只會等於或晚於它。
 */
const REST_DAY_EXTENSION = "NOT_IMPLEMENTED";

/** 期間計算政策。改這裡等於改全系統。 */
const SLA_POLICY = Object.freeze({
  days: STATUTORY_HANDLING_DAYS,
  timezone: LEGAL_TIMEZONE,
  calendarDays: true,
  excludeFirstDay: true, // 民法 §120 II
  dueAtEndOfLastDay: true, // 民法 §121 I
  restDayExtension: REST_DAY_EXTENSION, // 民法 §122 —— 見模組說明
  legalBasis: "消保法 §43 II ＋ 民法 §120 II / §121 I（§122 末日展延尚未實作）",
});

/**
 * 法定期間的**末日**（台灣日曆日字串）。
 *
 * §120 II 始日不算入 → Day 1 是申訴日的次日 → Day 15 ＝ 申訴日 + 15 個日曆日。
 *
 * **這是最早可能的末日** —— §122 的休息日展延尚未實作（見模組說明）。
 *
 * @param {Date|string|number} submittedAt
 * @returns {string} `YYYY-MM-DD`
 */
function statutoryDueDate(submittedAt) {
  return addCalendarDays(taiwanCalendarDate(submittedAt), STATUTORY_HANDLING_DAYS);
}

/**
 * 法定期間的**終止時點**（末日的台北 23:59:59.999）。
 *
 * 這個值寫進 `consumer_complaints.statutory_due_at`。
 *
 * 註：`utils/reportingRange.js` 的期間一律用 half-open `[start, end)` 且明文
 * 避開 `23:59:59.999`；這裡刻意不同 —— 那裡處理的是「查詢區間」，
 * 這裡表達的是民法 §121 I 字面上的**單一時點**（期間末日之終止），
 * 而欄位本身也只有一個 `..._at`。
 *
 * @param {Date|string|number} submittedAt
 * @returns {Date}
 */
function statutoryDueAt(submittedAt) {
  return endOfTaiwanDay(statutoryDueDate(submittedAt));
}

/**
 * 這件申訴是否已逾期。
 *
 * **已結案（`resolved` / `closed`）的申訴不算逾期** —— 逾期的意義是
 * 「還沒處理完而法定期限已過」，對已處理完的案件回報逾期只會讓告警失去訊號。
 * 歷史上是否曾經逾期由 `resolved_at` 與 `statutory_due_at` 的比較回答，
 * 那是稽核，不是待辦告警。
 *
 * **保守性：** `statutory_due_at` 是最早可能的法定期限（§122 未實作），
 * 因此本函式可能比真正的法定逾期更早回 `true`。營運上偏安全，
 * **但不得**當成法律上已逾期的認定。
 *
 * @param {{status: string, statutory_due_at: Date|string}} complaint
 * @param {Date} [now]
 */
function isOverdue(complaint, now = new Date()) {
  if (!complaint || !complaint.statutory_due_at) return false;
  if (["resolved", "closed"].includes(complaint.status)) return false;
  return toDate(complaint.statutory_due_at, "statutory_due_at").getTime() < toDate(now, "now").getTime();
}

/**
 * 距離法定末日還有幾個**台灣日曆日**（負數 = 已逾期幾天，0 = 今天就是末日）。
 *
 * 用日曆日相減而不是毫秒相除 —— 期限是「哪一天」，不是「還剩幾小時」。
 */
function daysUntilDue(complaint, now = new Date()) {
  if (!complaint || !complaint.statutory_due_at) return null;
  const dueDay = taiwanCalendarDate(complaint.statutory_due_at);
  const today = taiwanCalendarDate(now);
  const asUtc = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((asUtc(dueDay) - asUtc(today)) / MS_PER_DAY);
}

module.exports = {
  LEGAL_TIMEZONE,
  STATUTORY_HANDLING_DAYS,
  TAIWAN_UTC_OFFSET_HOURS,
  REST_DAY_EXTENSION,
  SLA_POLICY,
  taiwanCalendarDate,
  addCalendarDays,
  endOfTaiwanDay,
  statutoryDueDate,
  statutoryDueAt,
  isOverdue,
  daysUntilDue,
};
