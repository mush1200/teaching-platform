/**
 * `DEC-25`／`DEC-26`／`DEC-29`／`DEC-30`／`DEC-32` 的政策函式測試。
 *
 * 重點在兩個**最容易寫錯**的地方：
 *   1. 期間邊界必須是**台北末日終了**，不是 UTC 月底；
 *   2. 六期 override 的 off-by-one —— 第 1～6 期合格 → **第 7 期**才釋出。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cycleIdForInstant,
  nextCycleId,
  previousCycleId,
  lastCalendarDayOfCycle,
  cycleBounds,
  refundWindowEndDate,
  refundWindowEndAt,
  payoutTriggerReason,
  isSettlementWriteEnabled,
  MIN_PAYOUT_AMOUNT_TWD,
  AGEING_OVERRIDE_CYCLES,
  REFUND_WINDOW_CALENDAR_DAYS,
} = require("../utils/settlementPolicy");

test("DEC-30 §1: the cycle of an instant is its Taipei calendar month, not the UTC one", () => {
  // 2026-02-28T16:30Z 在台北已經是 3/1（UTC+8）。
  assert.equal(cycleIdForInstant("2026-02-28T16:30:00.000Z"), "2026-03");
  assert.equal(cycleIdForInstant("2026-02-28T15:00:00.000Z"), "2026-02");
});

test("cycle ids roll over the year correctly in both directions", () => {
  assert.equal(nextCycleId("2026-12"), "2027-01");
  assert.equal(previousCycleId("2026-01"), "2025-12");
  assert.equal(nextCycleId("2026-01"), "2026-02");
  assert.equal(previousCycleId("2026-12"), "2026-11");
});

test("the last calendar day is correct for 30/31-day months and for leap February", () => {
  assert.equal(lastCalendarDayOfCycle("2026-01"), "2026-01-31");
  assert.equal(lastCalendarDayOfCycle("2026-04"), "2026-04-30");
  assert.equal(lastCalendarDayOfCycle("2026-02"), "2026-02-28");
  assert.equal(lastCalendarDayOfCycle("2028-02"), "2028-02-29");
});

test("DEC-30 §2/§4: cutoff is the Taipei end-of-final-day and payout is due on the 15th", () => {
  const bounds = cycleBounds("2026-01");
  // 台北 1/31 23:59:59.999 ＝ UTC 1/31 15:59:59.999
  assert.equal(bounds.cutoffAt.toISOString(), "2026-01-31T15:59:59.999Z");
  // 完成期限 ＝ 次月 15 日終了
  assert.equal(bounds.payoutDueAt.toISOString(), "2026-02-15T15:59:59.999Z");
  assert.ok(bounds.startsAt < bounds.cutoffAt);
  assert.ok(bounds.cutoffAt < bounds.payoutDueAt);
});

test("DEC-25 §2: the refund window is anchored on paid_at plus 7 calendar days", () => {
  assert.equal(REFUND_WINDOW_CALENDAR_DAYS, 7);
  assert.equal(refundWindowEndDate("2026-03-01T02:00:00.000Z"), "2026-03-08");
  assert.equal(refundWindowEndAt("2026-03-01T02:00:00.000Z").toISOString(), "2026-03-08T15:59:59.999Z");
});

test("the refund window uses the Taipei calendar date, not the UTC one", () => {
  // UTC 2026-03-01T16:30Z 在台北已是 3/2 → 窗口末日 3/9，不是 3/8。
  assert.equal(refundWindowEndDate("2026-03-01T16:30:00.000Z"), "2026-03-09");
});

test("DEC-29 §1: below threshold and not aged rolls forward — it is never forfeited", () => {
  assert.equal(payoutTriggerReason({ eligibleBalance: 50, ageingBefore: 0 }), "none");
  assert.equal(payoutTriggerReason({ eligibleBalance: 299, ageingBefore: 5 }), "none");
});

test("DEC-29: reaching the threshold triggers a payout", () => {
  assert.equal(MIN_PAYOUT_AMOUNT_TWD, 300);
  assert.equal(payoutTriggerReason({ eligibleBalance: 300, ageingBefore: 0 }), "threshold");
  assert.equal(payoutTriggerReason({ eligibleBalance: 12000, ageingBefore: 0 }), "threshold");
});

test("DEC-32 §P2 off-by-one: six qualifying cycles release in the SEVENTH, not the sixth", () => {
  assert.equal(AGEING_OVERRIDE_CYCLES, 6);
  // 第 6 期關閉時，帶入該期的計數是 5 → 尚未觸發。
  assert.equal(payoutTriggerReason({ eligibleBalance: 50, ageingBefore: 5 }), "none");
  // 第 7 期帶入的計數是 6 → 釋出。
  assert.equal(payoutTriggerReason({ eligibleBalance: 50, ageingBefore: 6 }), "six_cycle_override");
});

test("DEC-29 §3: termination overrides the threshold at any amount", () => {
  assert.equal(
    payoutTriggerReason({ eligibleBalance: 1, ageingBefore: 0, terminating: true }),
    "termination"
  );
});

test("a zero or negative eligible balance never triggers a payout, even when terminating", () => {
  assert.equal(payoutTriggerReason({ eligibleBalance: 0, ageingBefore: 9, terminating: true }), "none");
  assert.equal(payoutTriggerReason({ eligibleBalance: -50, ageingBefore: 9 }), "none");
});

test("settlement writes are disabled unless the flag is explicitly true", () => {
  assert.equal(isSettlementWriteEnabled({}), false);
  assert.equal(isSettlementWriteEnabled({ SETTLEMENT_WRITE_ENABLED: "" }), false);
  assert.equal(isSettlementWriteEnabled({ SETTLEMENT_WRITE_ENABLED: "1" }), false);
  assert.equal(isSettlementWriteEnabled({ SETTLEMENT_WRITE_ENABLED: "yes" }), false);
  assert.equal(isSettlementWriteEnabled({ SETTLEMENT_WRITE_ENABLED: "true" }), true);
  assert.equal(isSettlementWriteEnabled({ SETTLEMENT_WRITE_ENABLED: " TRUE " }), true);
});

test("an invalid cycle id is rejected rather than silently normalised", () => {
  assert.throws(() => cycleBounds("2026-13"), /invalid settlement cycle id/);
  assert.throws(() => cycleBounds("2026-1"), /invalid settlement cycle id/);
  assert.throws(() => cycleBounds("2026-00"), /invalid settlement cycle id/);
});
