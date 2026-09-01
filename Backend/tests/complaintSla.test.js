/**
 * 消費申訴法定期限的單元測試（P1-09 Gate 3）。
 *
 * 這裡鎖的是：**十五日這個數字與計算方式只有一個定義來源，而且算對。**
 *
 * ## 2026-08-26 修正（Wave 2 #6 CORRECTION）
 *
 * 初版是 `submittedAt + 16 × 24h`，把 2026-08-26 的末日算成 **9/11**。
 * 正確是 **9/10**（§120 II 始日不算入 → 8/27 是 Day 1 → 9/10 是 Day 15），
 * 且期間終止在**末日終了**（§121 I），不是同一時刻。
 *
 * 因此本檔第一組測試就是那個回歸案例。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const sla = require("../utils/complaintSla");

/** 台北牆上時間 → 時間點（台灣固定 UTC+8）。 */
const taipei = (s) => new Date(`${s}+08:00`);

test("SLA 常數來自消保法 §43 II 的十五日，且未混入其他 SLA", () => {
  assert.equal(sla.STATUTORY_HANDLING_DAYS, 15);
  assert.equal(sla.SLA_POLICY.days, 15);
  assert.equal(sla.SLA_POLICY.timezone, "Asia/Taipei");
  assert.equal(sla.SLA_POLICY.calendarDays, true);
  assert.equal(sla.SLA_POLICY.excludeFirstDay, true, "民法 §120 II");
  assert.equal(sla.SLA_POLICY.dueAtEndOfLastDay, true, "民法 §121 I");
  assert.match(sla.SLA_POLICY.legalBasis, /§43/);
  // **不得出現第二個 SLA 日數。** baseline N2 只鎖定一個。
  assert.equal(
    Object.values(sla.SLA_POLICY).filter((v) => typeof v === "number").length,
    1,
    "policy 只能有一個日數 —— 多一個就是自行決定 SLA"
  );
});

test("回歸：2026-08-26 提出 → 末日為 2026-09-10，**不是** 2026-09-11", () => {
  const submitted = taipei("2026-08-26T10:37:00");
  assert.equal(sla.statutoryDueDate(submitted), "2026-09-10");
  assert.notEqual(sla.statutoryDueDate(submitted), "2026-09-11", "初版的 +16 天是錯的");

  // 逐日展開，確認 8/27 是 Day 1、9/10 是 Day 15（§120 II 始日不算入）。
  const submittedDay = sla.taiwanCalendarDate(submitted);
  assert.equal(sla.addCalendarDays(submittedDay, 1), "2026-08-27", "Day 1");
  assert.equal(sla.addCalendarDays(submittedDay, 15), "2026-09-10", "Day 15");
});

test("§121 I：期間終止在末日之終了（台北 23:59:59.999），不是提出的同一時刻", () => {
  const submitted = taipei("2026-08-26T10:37:00");
  const due = sla.statutoryDueAt(submitted);

  // 台北 2026-09-10 23:59:59.999 ＝ UTC 2026-09-10 15:59:59.999
  assert.equal(due.toISOString(), "2026-09-10T15:59:59.999Z");
  assert.equal(sla.taiwanCalendarDate(due), "2026-09-10");
  assert.notEqual(
    due.getTime(),
    submitted.getTime() + 15 * 24 * 60 * 60 * 1000,
    "不得是「加 15×24 小時」——那會在末日 10:37 就到期"
  );
  // 末日當天稍早仍未逾期；跨過午夜才逾期。
  const open = { status: "under_review", statutory_due_at: due };
  assert.equal(sla.isOverdue(open, taipei("2026-09-10T23:59:59")), false);
  assert.equal(sla.isOverdue(open, taipei("2026-09-11T00:00:00")), true);
});

test("跨月：2026-01-20 → 2026-02-04；2026-08-31 → 2026-09-15", () => {
  assert.equal(sla.statutoryDueDate(taipei("2026-01-20T09:00:00")), "2026-02-04");
  assert.equal(sla.statutoryDueDate(taipei("2026-08-31T09:00:00")), "2026-09-15");
  // 二月：平年 2026 年 2/20 + 15 天 → 3/7
  assert.equal(sla.statutoryDueDate(taipei("2026-02-20T09:00:00")), "2026-03-07");
  // 閏年 2028 年 2/20 + 15 天 → 3/6（多了 2/29）
  assert.equal(sla.statutoryDueDate(taipei("2028-02-20T09:00:00")), "2028-03-06");
});

test("跨年：2026-12-25 → 2027-01-09", () => {
  assert.equal(sla.statutoryDueDate(taipei("2026-12-25T09:00:00")), "2027-01-09");
  assert.equal(sla.statutoryDueDate(taipei("2026-12-31T23:00:00")), "2027-01-15");
  assert.equal(
    sla.statutoryDueAt(taipei("2026-12-31T23:00:00")).toISOString(),
    "2027-01-15T15:59:59.999Z"
  );
});

test("時區邊界：台灣日曆日，不是 UTC 日曆日，也不是主機本地日", () => {
  // 台北 2026-08-27 00:30 ＝ UTC 2026-08-26 16:30。
  // 用 UTC 日算會得到申訴日 8/26 → 末日 9/10（少一天）。
  const earlyMorning = new Date("2026-08-26T16:30:00Z");
  assert.equal(earlyMorning.toISOString().slice(0, 10), "2026-08-26", "UTC 日是 8/26");
  assert.equal(sla.taiwanCalendarDate(earlyMorning), "2026-08-27", "但台灣日是 8/27");
  assert.equal(sla.statutoryDueDate(earlyMorning), "2026-09-11");

  // 台北 2026-08-26 23:30 ＝ UTC 2026-08-26 15:30（同一 UTC 日，末日 9/10）。
  const lateNight = new Date("2026-08-26T15:30:00Z");
  assert.equal(sla.taiwanCalendarDate(lateNight), "2026-08-26");
  assert.equal(sla.statutoryDueDate(lateNight), "2026-09-10");

  // 兩者只差一小時，卻落在不同的法定末日 —— 這正是必須用 Asia/Taipei 的理由。
  assert.notEqual(sla.statutoryDueDate(lateNight), sla.statutoryDueDate(earlyMorning));

  // 跨年邊界：台北 2027-01-01 00:30 ＝ UTC 2026-12-31 16:30。
  const newYear = new Date("2026-12-31T16:30:00Z");
  assert.equal(sla.taiwanCalendarDate(newYear), "2027-01-01");
  assert.equal(sla.statutoryDueDate(newYear), "2027-01-16");
});

test("台灣無日光節約時間 —— 固定 UTC+8 的假設在一月與七月皆成立", () => {
  // `endOfTaiwanDay` 直接用固定 +8 偏移，這個假設必須是真的。
  for (const day of ["2026-01-15", "2026-07-15"]) {
    const offsetMinutes = (() => {
      const probe = new Date(`${day}T12:00:00Z`);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(probe);
      return Number(parts.find((p) => p.type === "hour").value) - 12;
    })();
    assert.equal(offsetMinutes, sla.TAIWAN_UTC_OFFSET_HOURS, `${day} 的 Asia/Taipei 偏移必須是 +8`);
    assert.equal(sla.endOfTaiwanDay(day).toISOString(), `${day}T15:59:59.999Z`);
  }
});

test("§122 末日展延：**尚未實作**，且回傳值必須誠實標示為最早可能末日", () => {
  assert.equal(
    sla.REST_DAY_EXTENSION,
    "NOT_IMPLEMENTED",
    "沒有權威假日來源之前不得宣稱已處理 §122"
  );
  assert.equal(sla.SLA_POLICY.restDayExtension, "NOT_IMPLEMENTED");
  assert.match(sla.SLA_POLICY.legalBasis, /§122[^）]*尚未實作/);

  // 2026-09-05 提出 → 末日 9/20，而 9/20 是**星期日** ——
  // §122 若實作，末日應展延為 9/21。這裡把「目前不展延」釘住，
  // 避免日後有人「順手」加半套假日邏輯卻沒更新 REST_DAY_EXTENSION。
  const dueOnSunday = sla.statutoryDueDate(taipei("2026-09-05T09:00:00"));
  assert.equal(new Date(`${dueOnSunday}T12:00:00+08:00`).getUTCDay(), 0, "2026-09-20 確實是星期日");
  assert.equal(
    dueOnSunday,
    "2026-09-20",
    "目前不展延；實作 §122 後應改為 2026-09-21 並同步更新 REST_DAY_EXTENSION"
  );
});

test("isOverdue: 只有未結案且已過期限才算逾期", () => {
  const now = taipei("2026-09-20T10:00:00");
  const past = { statutory_due_at: sla.endOfTaiwanDay("2026-09-11") };
  const future = { statutory_due_at: sla.endOfTaiwanDay("2026-09-30") };

  for (const status of ["submitted", "under_review", "responded"]) {
    assert.equal(sla.isOverdue({ ...past, status }, now), true, `${status} 已過期限應為逾期`);
    assert.equal(sla.isOverdue({ ...future, status }, now), false);
  }
  // 已處理完的案件不再是待辦告警 —— 對它回報逾期會讓告警失去訊號。
  for (const status of ["resolved", "closed"]) {
    assert.equal(sla.isOverdue({ ...past, status }, now), false, `${status} 不應再被視為逾期`);
  }
  assert.equal(sla.isOverdue(null, now), false);
  assert.equal(sla.isOverdue({ status: "submitted" }, now), false, "沒有期限就無從判斷逾期");
});

test("daysUntilDue: 以台灣日曆日相減，末日當天為 0", () => {
  const now = taipei("2026-09-20T10:00:00");
  assert.equal(sla.daysUntilDue({ statutory_due_at: sla.endOfTaiwanDay("2026-09-25") }, now), 5);
  assert.equal(sla.daysUntilDue({ statutory_due_at: sla.endOfTaiwanDay("2026-09-20") }, now), 0, "末日當天是 0，不是 -1");
  assert.equal(sla.daysUntilDue({ statutory_due_at: sla.endOfTaiwanDay("2026-09-17") }, now), -3);
  // 末日當天深夜仍是 0（不因時分而變）。
  assert.equal(
    sla.daysUntilDue({ statutory_due_at: sla.endOfTaiwanDay("2026-09-20") }, taipei("2026-09-20T23:00:00")),
    0
  );
  assert.equal(sla.daysUntilDue(null, now), null);
});

test("輸入形式：Date / ISO 字串 / epoch 皆可；無效輸入拋錯", () => {
  const d = taipei("2026-08-26T10:37:00");
  const expected = sla.statutoryDueAt(d).getTime();
  assert.equal(sla.statutoryDueAt(d.toISOString()).getTime(), expected);
  assert.equal(sla.statutoryDueAt(d.getTime()).getTime(), expected);
  assert.throws(() => sla.statutoryDueAt("not-a-date"), /invalid date/);
});
