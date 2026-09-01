/**
 * 付款期限與人工核帳 SLA 的單元測試（P1-09 Gate 6）。
 *
 * 鎖住三件事：
 *
 *   1. **兩個數字只有一個定義來源** —— 7 個日曆日 / 3 個日曆日。
 *   2. **末日終了模型**（不是 `+N×24h`）—— 與買家看到的「請於 YYYY/MM/DD 前」一致。
 *   3. **與消費申訴 15 日完全分離** —— 不共用常數、不共用計算。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../utils/paymentTimingPolicy");
const complaintSla = require("../utils/complaintSla");
const calendar = require("../utils/taiwanCalendar");

/** 台北牆上時間 → 時間點（台灣固定 UTC+8）。 */
const taipei = (s) => new Date(`${s}+08:00`);

test("已拍板的兩個數字：7 個日曆日付款期限、3 個日曆日核帳 SLA", () => {
  assert.equal(policy.PAYMENT_DUE_CALENDAR_DAYS, 7);
  assert.equal(policy.PAYMENT_REVIEW_CALENDAR_DAYS, 3);
  assert.equal(policy.PAYMENT_TIMING_POLICY.calendarDays, true);
  assert.equal(policy.PAYMENT_TIMING_POLICY.dueAtEndOfLastDay, true);
  assert.equal(policy.PAYMENT_TIMING_POLICY.timezone, "Asia/Taipei");
  assert.equal(policy.PAYMENT_TIMING_POLICY.paymentDueFrom, "orders.created_at");
  assert.equal(policy.PAYMENT_TIMING_POLICY.reviewFrom, "orders.payment_info_submitted_at");
});

test("「通常 1 個工作日」是期待值，永遠不是 deadline", () => {
  // 它必須是字串 —— 一旦是數字就有可能被誤用成計算來源。
  assert.equal(typeof policy.EXPECTED_REVIEW_COPY_ONLY, "string");
  assert.match(policy.EXPECTED_REVIEW_COPY_ONLY, /1 個工作日/);
  // policy 裡的數字只有兩個：7 與 3。
  const numbers = Object.values(policy.PAYMENT_TIMING_POLICY).filter((v) => typeof v === "number");
  assert.deepEqual(numbers.sort((a, b) => a - b), [3, 7], "不得出現第三個期限數字");
});

test("付款期限：建單日 + 7 個日曆日，終止於該日台北 23:59:59.999", () => {
  const created = taipei("2026-08-26T10:37:00");
  assert.equal(policy.paymentDueDate(created), "2026-09-02");
  assert.equal(policy.paymentDueAt(created).toISOString(), "2026-09-02T15:59:59.999Z");

  // **不是 +7×24h** —— 那會在 9/2 10:37 就到期，且無法用「請於 9/2 前」表達。
  assert.notEqual(
    policy.paymentDueAt(created).getTime(),
    created.getTime() + 7 * 24 * 60 * 60 * 1000
  );
  // 末日終了模型永遠不會比 +7×24h 更短。
  assert.ok(policy.paymentDueAt(created).getTime() > created.getTime() + 7 * 24 * 60 * 60 * 1000);
});

test("核帳期限：提交日 + 3 個日曆日，終止於該日台北 23:59:59.999", () => {
  const submitted = taipei("2026-08-26T14:00:00");
  assert.equal(policy.reviewDueDate(submitted), "2026-08-29");
  assert.equal(policy.reviewDueAt(submitted).toISOString(), "2026-08-29T15:59:59.999Z");
});

test("跨月／跨年／閏年", () => {
  assert.equal(policy.paymentDueDate(taipei("2026-08-31T09:00:00")), "2026-09-07");
  assert.equal(policy.paymentDueDate(taipei("2026-12-28T09:00:00")), "2027-01-04");
  assert.equal(policy.reviewDueDate(taipei("2026-12-31T23:00:00")), "2027-01-03");
  // 閏年：2028-02-25 + 7 天 → 3/3（經過 2/29）
  assert.equal(policy.paymentDueDate(taipei("2028-02-25T09:00:00")), "2028-03-03");
  // 平年：2026-02-25 + 7 天 → 3/4
  assert.equal(policy.paymentDueDate(taipei("2026-02-25T09:00:00")), "2026-03-04");
});

test("時區：以台灣日曆日判斷，不是 UTC 日也不是主機本地日", () => {
  // 台北 2026-08-27 00:30 ＝ UTC 2026-08-26 16:30。
  const earlyMorning = new Date("2026-08-26T16:30:00Z");
  assert.equal(earlyMorning.toISOString().slice(0, 10), "2026-08-26", "UTC 日是 8/26");
  assert.equal(calendar.taiwanCalendarDate(earlyMorning), "2026-08-27");
  assert.equal(policy.paymentDueDate(earlyMorning), "2026-09-03", "台灣日 8/27 + 7 = 9/3");

  // 只差一小時（台北 8/26 23:30）就是不同的期限。
  const lateNight = new Date("2026-08-26T15:30:00Z");
  assert.equal(policy.paymentDueDate(lateNight), "2026-09-02");
  assert.notEqual(policy.paymentDueDate(lateNight), policy.paymentDueDate(earlyMorning));
});

test("isPaymentOverdue：legacy（NULL）不算逾期，非 pending 不算逾期", () => {
  const due = policy.paymentDueAt(taipei("2026-08-26T10:00:00")); // 9/2 終了
  const after = taipei("2026-09-03T00:00:00");
  const before = taipei("2026-09-02T23:00:00");

  assert.equal(policy.isPaymentOverdue({ status: "pending_payment", payment_due_at: due }, after), true);
  assert.equal(policy.isPaymentOverdue({ status: "pending_payment", payment_due_at: due }, before), false);
  // **legacy 訂單沒有被揭露過期限 —— 未知不等於違規。**
  assert.equal(policy.isPaymentOverdue({ status: "pending_payment", payment_due_at: null }, after), false);
  // 已核准／已取消不再是待辦。
  assert.equal(policy.isPaymentOverdue({ status: "approved", payment_due_at: due }, after), false);
  assert.equal(policy.isPaymentOverdue({ status: "cancelled", payment_due_at: due }, after), false);
  assert.equal(policy.isPaymentOverdue(null, after), false);
});

test("isReviewOverdue：核准後不再逾時；legacy（NULL）不算逾時", () => {
  const due = policy.reviewDueAt(taipei("2026-08-26T14:00:00")); // 8/29 終了
  const after = taipei("2026-08-30T09:00:00");
  const before = taipei("2026-08-29T22:00:00");

  assert.equal(policy.isReviewOverdue({ status: "pending_payment", review_due_at: due }, after), true);
  assert.equal(policy.isReviewOverdue({ status: "pending_payment", review_due_at: due }, before), false);
  assert.equal(
    policy.isReviewOverdue({ status: "approved", review_due_at: due }, after),
    false,
    "**核准後不得再顯示核帳逾時**"
  );
  assert.equal(policy.isReviewOverdue({ status: "pending_payment", review_due_at: null }, after), false);
});

test("daysUntil*：以台灣日曆日相減，末日當天為 0", () => {
  const due = policy.paymentDueAt(taipei("2026-08-26T10:00:00")); // 9/2
  assert.equal(policy.daysUntilPaymentDue({ payment_due_at: due }, taipei("2026-08-26T10:00:00")), 7);
  assert.equal(policy.daysUntilPaymentDue({ payment_due_at: due }, taipei("2026-09-02T23:00:00")), 0);
  assert.equal(policy.daysUntilPaymentDue({ payment_due_at: due }, taipei("2026-09-05T09:00:00")), -3);
  assert.equal(policy.daysUntilPaymentDue({ payment_due_at: null }), null);

  const rdue = policy.reviewDueAt(taipei("2026-08-26T14:00:00")); // 8/29
  assert.equal(policy.daysUntilReviewDue({ review_due_at: rdue }, taipei("2026-08-26T14:00:00")), 3);
  assert.equal(policy.daysUntilReviewDue({ review_due_at: null }), null);
});

test("與消費申訴 15 日**完全分離** —— 不共用常數、不共用計算", () => {
  assert.notEqual(policy.PAYMENT_DUE_CALENDAR_DAYS, complaintSla.STATUTORY_HANDLING_DAYS);
  assert.notEqual(policy.PAYMENT_REVIEW_CALENDAR_DAYS, complaintSla.STATUTORY_HANDLING_DAYS);
  assert.equal(complaintSla.STATUTORY_HANDLING_DAYS, 15, "申訴軌道不得被本輪改動");

  // 同一天為起點，三條軌道算出三個不同的末日。
  const t = taipei("2026-08-26T10:00:00");
  const dates = new Set([
    policy.paymentDueDate(t),
    policy.reviewDueDate(t),
    complaintSla.statutoryDueDate(t),
  ]);
  assert.equal(dates.size, 3);

  // 申訴的法源仍是消保法 §43 II；付款政策的依據是產品決策，兩者的說明不得混同。
  assert.match(complaintSla.SLA_POLICY.legalBasis, /§43/);
  assert.doesNotMatch(policy.PAYMENT_TIMING_POLICY.basis, /§43/);
});

test("不使用工作日 —— 不引入國定假日行事曆依賴", () => {
  assert.equal(policy.PAYMENT_TIMING_POLICY.calendarDays, true);
  assert.match(policy.PAYMENT_TIMING_POLICY.basis, /不使用工作日/);
  // 週六下單與週一下單的算法完全相同（純日曆日，不跳過假日）。
  assert.equal(policy.paymentDueDate(taipei("2026-08-29T10:00:00")), "2026-09-05"); // 週六
  assert.equal(policy.paymentDueDate(taipei("2026-08-31T10:00:00")), "2026-09-07"); // 週一
});
