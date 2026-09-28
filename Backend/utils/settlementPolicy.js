/**
 * 結算政策 —— 期間邊界、退款窗口、門檻、ageing。
 *
 * 仿 `paymentTimingPolicy.js` 的形狀：**純函式 ＋ 常數**，共用
 * `taiwanCalendar.js` 的台北日曆慣例，不碰資料庫。
 *
 * ## 期間邊界（`DEC-30`）
 *
 * 期間 ＝ **Asia/Taipei 曆月**，id 為 `YYYY-MM`。
 * cutoff ＝ 該月最後一個日曆日的**末日終了**（`endOfTaiwanDay`），
 * **不得自創 UTC cutoff 語意**。撥款完成期限 ＝ **次月第 15 個日曆日**的末日終了。
 *
 * ## 退款窗口（`DEC-25` ＋ `DEC-26`）
 *
 * 錨點是 `orders.paid_at`，窗口 7 個日曆日，期限**持久化**於
 * `orders.refund_window_end`，讀取時**不得**重算。這裡的函式只在
 * **付款核准當下**被呼叫一次。
 *
 * ## ageing（`DEC-29`／`DEC-32`／`DEC-33`）
 *
 * 判準是 **CUTOFF-STATE**：只看期末狀態，不看期間內的 hold 歷程。
 * `DEC-32` §P1 的原文就是「期末」。反面（期間內只要被 hold 過就不計）會讓一連串
 * 短暫的 hold 無限期阻止 ageing —— 那正是 `DEC-29` 要防的結果。
 *
 * 六期 override 以 **`ageing_before`（帶入本期的計數）** 判斷：第 1～6 期皆合格 →
 * **第 7 期**釋出，與 `DEC-32` §P2 的示例一致。
 */

const {
  taiwanCalendarDate,
  addCalendarDays,
  endOfTaiwanDay,
  toDate,
} = require("./taiwanCalendar");

/** `DEC-25` §2：退款／爭議窗口 ＝ `paid_at` ＋ 7 個日曆日。 */
const REFUND_WINDOW_CALENDAR_DAYS = 7;

/** `DEC-29`：最低撥款門檻 NT$300。未達門檻**滾入下一期間**，不沒收、不歸零。 */
const MIN_PAYOUT_AMOUNT_TWD = 300;

/** `DEC-29` §2：連續 6 個合格期間低於門檻 → **下一個**期間不論金額釋出。 */
const AGEING_OVERRIDE_CYCLES = 6;

/** `DEC-30` §4：撥款**完成**期限 ＝ 次月第 15 個日曆日。 */
const PAYOUT_DUE_DAY_OF_MONTH = 15;

const CYCLE_ID_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertCycleId(cycleId) {
  if (typeof cycleId !== "string" || !CYCLE_ID_PATTERN.test(cycleId)) {
    throw new Error(`invalid settlement cycle id: ${cycleId} (expected YYYY-MM)`);
  }
  return cycleId;
}

/** 某個時間點所屬的結算期間 id（台北曆月）。 */
function cycleIdForInstant(instant) {
  return taiwanCalendarDate(instant).slice(0, 7);
}

function cycleParts(cycleId) {
  assertCycleId(cycleId);
  const [year, month] = cycleId.split("-").map(Number);
  return { year, month };
}

/** 期間的下一個 id（跨年正確）。 */
function nextCycleId(cycleId) {
  const { year, month } = cycleParts(cycleId);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** 期間的上一個 id（跨年正確）。 */
function previousCycleId(cycleId) {
  const { year, month } = cycleParts(cycleId);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** 該曆月的最後一個日曆日（`YYYY-MM-DD`）。 */
function lastCalendarDayOfCycle(cycleId) {
  const next = nextCycleId(cycleId);
  const { year, month } = cycleParts(next);
  return addCalendarDays(`${year}-${String(month).padStart(2, "0")}-01`, -1);
}

/**
 * 期間邊界。三個值都**持久化**在 `payout_cycles` —— 它們是對創作者揭露過的
 * 承諾，政策日後調整不得追溯改變既有期間。
 */
function cycleBounds(cycleId) {
  const { year, month } = cycleParts(cycleId);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextId = nextCycleId(cycleId);
  const nextParts = cycleParts(nextId);
  const payoutDueDay = `${nextParts.year}-${String(nextParts.month).padStart(2, "0")}-${String(
    PAYOUT_DUE_DAY_OF_MONTH
  ).padStart(2, "0")}`;
  return {
    cycleId,
    // 期間起點以「前一日終了」表達，使 `starts_at < cutoff_at` 且區間為 half-open。
    startsAt: endOfTaiwanDay(addCalendarDays(firstDay, -1)),
    cutoffAt: endOfTaiwanDay(lastCalendarDayOfCycle(cycleId)),
    payoutDueAt: endOfTaiwanDay(payoutDueDay),
  };
}

/** 退款窗口期限的**日期**（台灣日曆日字串）。 */
function refundWindowEndDate(paidAt) {
  return addCalendarDays(taiwanCalendarDate(paidAt), REFUND_WINDOW_CALENDAR_DAYS);
}

/**
 * 退款窗口期限的**終止時點**。寫進 `orders.refund_window_end`。
 *
 * ⚠️ 只在**付款核准當下**呼叫一次（`DEC-26`）。讀取端一律用已儲存的值，
 * **不得**以「當時的政策」重算。
 */
function refundWindowEndAt(paidAt) {
  toDate(paidAt, "paid_at");
  return endOfTaiwanDay(refundWindowEndDate(paidAt));
}

/**
 * 撥款觸發理由（`DEC-29`）。
 *
 * 判斷順序固定：終止／停業 override → 門檻 → 六期 override。
 * 三者都不成立即結轉（`none`），**不沒收、不歸零、不視為平台收入**。
 *
 * ⚠️ `ageingBefore` 是**帶入本期**的計數，不是關閉後的計數 ——
 * 六個已完成的合格期間（第 1～6 期）在第 7 期才觸發。
 */
function payoutTriggerReason({ eligibleBalance, ageingBefore, terminating = false }) {
  if (!Number.isInteger(eligibleBalance)) {
    throw new Error(`eligibleBalance must be an integer (got ${eligibleBalance})`);
  }
  if (eligibleBalance <= 0) return "none";
  if (terminating) return "termination";
  if (eligibleBalance >= MIN_PAYOUT_AMOUNT_TWD) return "threshold";
  if (Number.isInteger(ageingBefore) && ageingBefore >= AGEING_OVERRIDE_CYCLES) {
    return "six_cycle_override";
  }
  return "none";
}

/**
 * Shadow 模式旗標。
 *
 * **預設關閉** —— 設計 §21：Phase 3（shadow，只比對不服務）與 Phase 4（啟用）的
 * 差別只在於是否持久化已計算的分錄。旗標未明確設為 `"true"` 之前，
 * 結算路徑**一律不寫入**。
 */
function isSettlementWriteEnabled(env = process.env) {
  return String(env.SETTLEMENT_WRITE_ENABLED ?? "").trim().toLowerCase() === "true";
}

module.exports = {
  REFUND_WINDOW_CALENDAR_DAYS,
  MIN_PAYOUT_AMOUNT_TWD,
  AGEING_OVERRIDE_CYCLES,
  PAYOUT_DUE_DAY_OF_MONTH,
  CYCLE_ID_PATTERN,
  assertCycleId,
  cycleIdForInstant,
  nextCycleId,
  previousCycleId,
  lastCalendarDayOfCycle,
  cycleBounds,
  refundWindowEndDate,
  refundWindowEndAt,
  payoutTriggerReason,
  isSettlementWriteEnabled,
};
