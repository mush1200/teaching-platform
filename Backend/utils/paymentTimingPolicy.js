/**
 * 付款期限與人工核帳 SLA（canonical）。
 *
 * **這裡是唯一的定義來源。** route、service、測試、前端顯示文案都從這裡（或它產生的
 * API 資料）取值，**不得**在任何地方重寫 `7` 或 `3`，也不得就地重算期限。
 *
 * ## 已拍板的兩個數字（2026-08-26 產品決策）
 *
 * | 決策 | 值 | 起算 |
 * | --- | --- | --- |
 * | Buyer 付款期限 | **7 個日曆日** | `orders.created_at` |
 * | 人工核帳 SLA | **3 個日曆日** | `orders.payment_info_submitted_at` |
 *
 * 兩者都採**日曆日**，**不是工作日** —— 工作日需要權威國定假日行事曆，
 * 那正是 `LEGAL-01` / 民法 §122 刻意延後的那份資料。用日曆日就不引入該依賴。
 *
 * ## 「通常 1 個工作日」不是 deadline
 *
 * 對買家的文案是「通常 1 個工作日內完成，最遲 3 個日曆日內完成」。
 * 前半句是 **expected service level（期待值）**，後半句才是**可稽核的承諾**。
 * `EXPECTED_REVIEW_COPY_ONLY` 之所以不是常數，就是為了讓它**永遠進不了計算**：
 * backend 的 deadline 只有 3 個日曆日。
 *
 * ## 與消費申訴 15 日**完全分離**
 *
 * `utils/complaintSla.js` 是消保法 §43 II 的**法定申訴處理期限**；
 * 本模組是**日常人工核帳的營運 SLA**。兩者不共用常數、不共用計算、不共用欄位。
 * 唯一共用的是 `utils/taiwanCalendar.js` 的日期算術（「怎麼在台灣曆上加天數」），
 * 那不是 SLA。
 *
 * ## 期限模型：**末日終了**（不是 +N×24h）
 *
 * ```text
 * 訂單建立（台灣日曆日）  2026-08-26
 * 付款期限日              2026-09-02   ＝ 建立日 + 7 個日曆日
 * 期限終止                2026-09-02 23:59:59.999（台北）
 * ```
 *
 * 三個理由：
 *
 *   1. **與產品文案一致** —— 買家看到的是「請於 2026/09/02 前完成匯款」，
 *      一個**日期**；`+7×24h` 會產生 `09/02 10:37` 這種無法自然表達的期限。
 *   2. **符合 §18 I(2) 的「付款期日」** —— 法條要求揭露的是期日，不是時刻。
 *   3. **永遠不會比較短** —— `+7×24h` 會讓 23:50 下單的買家實質只有 6 天又 10 分鐘的最後一天。
 *
 * 附帶結果：這個模型與民法 §120 II（始日不算入）＋ §121 I（末日終了）**算出來完全相同**
 * （8/26 建立 → 8/27 是第 1 日 → 9/2 是第 7 日），因此不需要在兩種模型之間選邊。
 *
 * ## 期限必須「存下來」，不得每次即時計算
 *
 * 期限是**對買家揭露過的承諾**（消保法 §18 I(2)）。政策日後調整時，
 * 既有訂單必須維持當初承諾的期限，**不得追溯變動**。
 * 因此 `orders.payment_due_at` / `orders.review_due_at` 是實體欄位，
 * 而不是 SELECT 時的推算值 —— 舊的 `PAYMENT_DUE_DAYS = 3` 就是後者，已於本輪移除。
 *
 * ## Legacy 訂單一律 NULL
 *
 * 政策生效前建立的訂單**沒有**被揭露過任何期限，
 * 因此 `payment_due_at` 保持 NULL，**不得 backfill**。
 * 未被揭露的歷史狀態不得事後補成契約事實。
 */

const {
  taiwanCalendarDate,
  addCalendarDays,
  endOfTaiwanDay,
  calendarDaysBetween,
  toDate,
} = require("./taiwanCalendar");

/** Buyer 付款期限（日曆日）。自 `orders.created_at` 起算。**不得在別處重寫。** */
const PAYMENT_DUE_CALENDAR_DAYS = 7;

/** 人工核帳 SLA（日曆日）。自 `orders.payment_info_submitted_at` 起算。**不得在別處重寫。** */
const PAYMENT_REVIEW_CALENDAR_DAYS = 3;

/**
 * 對買家的期待值文案用語 —— **僅供顯示，永遠不參與任何計算**。
 * 故意是字串而非數字，避免有人把它當成 deadline 來源。
 */
const EXPECTED_REVIEW_COPY_ONLY = "通常 1 個工作日內完成";

/** 政策快照。供文件、測試與 API 揭露使用。 */
const PAYMENT_TIMING_POLICY = Object.freeze({
  paymentDueCalendarDays: PAYMENT_DUE_CALENDAR_DAYS,
  paymentDueFrom: "orders.created_at",
  reviewCalendarDays: PAYMENT_REVIEW_CALENDAR_DAYS,
  reviewFrom: "orders.payment_info_submitted_at",
  timezone: "Asia/Taipei",
  calendarDays: true,
  dueAtEndOfLastDay: true,
  expectedReviewCopyOnly: EXPECTED_REVIEW_COPY_ONLY,
  decidedAt: "2026-08-26",
  basis: "產品決策（Gate 6 Product Decision Round）；§18 I(2) 揭露義務；不使用工作日以避免國定假日行事曆依賴",
});

/* -------------------------------------------------------------------------- */
/* 付款期限的 enforcement（Wave 2 #12，Option A + A2）                          */
/* -------------------------------------------------------------------------- */
/**
 * ## 政策（2026-08-27 產品拍板）
 *
 * 付款期限限制的是：**買家必須在 `payment_due_at` 以前完成第一次有效付款憑證提交。**
 *
 * ```text
 * payment_due_at IS NULL                              → allow（legacy exempt）
 * now <= payment_due_at                               → allow
 * now >  payment_due_at ＋ 曾有期限前成功提交            → allow（退件後可重傳）
 * now >  payment_due_at ＋ 從未有期限前成功提交          → reject
 * ```
 *
 * 第三條（**A2**）的理由：期限管的是「買家有沒有在期限內行動」。
 * 已在期限內提交過的訂單代表買家已行動；Admin 在期限之後才退件是**平台側的時程**，
 * 不得因此剝奪買家的補件權利。canonical §7 的「逾期未付款訂單失效」
 * 對**從未提交過**的訂單依然完整成立。
 *
 * ## 為什麼不新增 `expired` status
 *
 * canonical §7 規定的是**行為**（不得再付款、不無條件復活、要買請建新訂單），
 * 不是狀態表示法。而本 repo 既有的慣例就是「買家／Admin 看到的訂單狀態是 derived」
 * （`buyerOrders.service.js` 的 `order_progress_state`、
 * `adminOrders.service.js` 的 `operational_status`）——
 * 新增 `orders.status` 值會破壞五 bucket partition、需要 migration，
 * 且引入讀取時改寫狀態的 race，換不到任何表達力。
 *
 * ## 「曾在期限內成功提交」的 canonical evidence
 *
 * **`manual_payment_proofs` 的每一列 = 一次被 backend 接受的提交**，
 * 且**永不覆寫**（退件後重傳建立新列，見 `mvp_rules.md` §12.3.1）。
 * 列只在 `paymentProof.service.storeUploads()` 的 transaction 內寫入 ——
 * 驗證失敗會 rollback 並刪掉已寫入的物件，因此**有列 ⇒ 該次提交確實被接受**。
 *
 * **不得改用 `orders.payment_info_submitted_at`** —— 它每次提交都被覆寫
 * （實測 17 張訂單的該欄已被後續提交蓋掉），**證明不了首次提交時間**。
 *
 * `COALESCE(uploaded_at, created_at)`：`created_at` 為 `NOT NULL`（358/358），
 * `uploaded_at` 有 5 筆 legacy NULL，因此以前者兜底。
 */

/** 「這張訂單曾有至少一次在期限前被接受的提交」。**必須看全部憑證列，不是最新一筆。** */
const TIMELY_SUBMISSION_SQL = `EXISTS (
        SELECT 1 FROM manual_payment_proofs mpp_t
         WHERE mpp_t.order_id = o.id
           AND COALESCE(mpp_t.uploaded_at, mpp_t.created_at) <= o.payment_due_at
      )`;

/** 付款期限是否已過。legacy（NULL）**永遠不算逾期**。 */
const PAYMENT_DEADLINE_EXPIRED_SQL = `(o.payment_due_at IS NOT NULL AND o.payment_due_at < NOW())`;

/**
 * **買家現在是否還能提交付款憑證** —— canonical 判準，前端不得自行計算。
 *
 * 三個 consumer 共用：`orderService.uploadProof()` 的 enforcement、
 * 買家 API 的 `payment_submission_allowed`、Admin API 的同名欄位。
 * 各寫一份就會出現「UI 說可以、backend 拒絕」的矛盾。
 */
const PAYMENT_SUBMISSION_ALLOWED_SQL = `(
      o.status = 'pending_payment'
      AND (
        o.payment_due_at IS NULL
        OR o.payment_due_at >= NOW()
        OR ${TIMELY_SUBMISSION_SQL}
      )
    )`;

/** enforcement 被拒絕時的 error code。**deterministic，前後端共用同一個字串。** */
const PAYMENT_DEADLINE_EXPIRED_CODE = "payment_deadline_expired";

/**
 * JS 側的同一個判準（enforcement path 已經有 row，不必再繞回 SQL）。
 *
 * @param {{paymentDueAt: Date|string|null, hasTimelySubmission: boolean}} input
 * @param {Date} [now]
 * @returns {{allowed: boolean, reason: "no_deadline"|"within_deadline"|"timely_resubmit"|"deadline_expired"}}
 */
function evaluatePaymentSubmission({ paymentDueAt, hasTimelySubmission } = {}, now = new Date()) {
  // legacy：從未被揭露過期限的訂單不受 enforcement 影響（Wave 2 #9 canonical）。
  if (paymentDueAt == null) return { allowed: true, reason: "no_deadline" };
  const due = toDate(paymentDueAt, "payment_due_at");
  if (due.getTime() >= toDate(now, "now").getTime()) {
    return { allowed: true, reason: "within_deadline" };
  }
  // A2：期限內曾成功提交過 → 退件後仍可重傳。
  if (hasTimelySubmission) return { allowed: true, reason: "timely_resubmit" };
  return { allowed: false, reason: "deadline_expired" };
}

/** 付款期限的**日期**（台灣日曆日字串）。 */
function paymentDueDate(orderCreatedAt) {
  return addCalendarDays(taiwanCalendarDate(orderCreatedAt), PAYMENT_DUE_CALENDAR_DAYS);
}

/** 付款期限的**終止時點**（末日的台北 23:59:59.999）。寫進 `orders.payment_due_at`。 */
function paymentDueAt(orderCreatedAt) {
  return endOfTaiwanDay(paymentDueDate(orderCreatedAt));
}

/** 人工核帳期限的**日期**（台灣日曆日字串）。 */
function reviewDueDate(paymentInfoSubmittedAt) {
  return addCalendarDays(taiwanCalendarDate(paymentInfoSubmittedAt), PAYMENT_REVIEW_CALENDAR_DAYS);
}

/** 人工核帳期限的**終止時點**。寫進 `orders.review_due_at`。 */
function reviewDueAt(paymentInfoSubmittedAt) {
  return endOfTaiwanDay(reviewDueDate(paymentInfoSubmittedAt));
}

/**
 * 訂單是否已過付款期限。
 *
 * **`payment_due_at` 為 NULL 一律回 `false`** —— legacy 訂單沒有被揭露過期限，
 * 不得被當成逾期。這是「未知不等於違規」。
 */
function isPaymentOverdue(order, now = new Date()) {
  if (!order || !order.payment_due_at) return false;
  if (order.status !== "pending_payment") return false;
  return toDate(order.payment_due_at, "payment_due_at").getTime() < toDate(now, "now").getTime();
}

/**
 * 這筆訂單的人工核帳是否已逾時。
 *
 * **核准後不再逾時** —— 逾時的意義是「還沒審完而期限已過」；
 * 對已處理完的訂單回報逾時只會讓告警失去訊號。
 * `review_due_at` 為 NULL（legacy 或尚未提交付款資訊）同樣回 `false`。
 */
function isReviewOverdue(order, now = new Date()) {
  if (!order || !order.review_due_at) return false;
  if (order.status !== "pending_payment") return false;
  return toDate(order.review_due_at, "review_due_at").getTime() < toDate(now, "now").getTime();
}

/** 距離付款期限還有幾個台灣日曆日（負數 = 已逾期）。 */
function daysUntilPaymentDue(order, now = new Date()) {
  if (!order || !order.payment_due_at) return null;
  return calendarDaysBetween(now, order.payment_due_at);
}

/** 距離核帳期限還有幾個台灣日曆日（負數 = 已逾時）。 */
function daysUntilReviewDue(order, now = new Date()) {
  if (!order || !order.review_due_at) return null;
  return calendarDaysBetween(now, order.review_due_at);
}

module.exports = {
  TIMELY_SUBMISSION_SQL,
  PAYMENT_DEADLINE_EXPIRED_SQL,
  PAYMENT_SUBMISSION_ALLOWED_SQL,
  PAYMENT_DEADLINE_EXPIRED_CODE,
  evaluatePaymentSubmission,
  PAYMENT_DUE_CALENDAR_DAYS,
  PAYMENT_REVIEW_CALENDAR_DAYS,
  EXPECTED_REVIEW_COPY_ONLY,
  PAYMENT_TIMING_POLICY,
  paymentDueDate,
  paymentDueAt,
  reviewDueDate,
  reviewDueAt,
  isPaymentOverdue,
  isReviewOverdue,
  daysUntilPaymentDue,
  daysUntilReviewDue,
};
