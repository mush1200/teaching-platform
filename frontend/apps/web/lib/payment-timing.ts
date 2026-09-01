/**
 * 付款期限與核帳 SLA 的**買家可見文案**（前端單一來源）。
 *
 * 數字的 canonical source 是 Backend 的 `utils/paymentTimingPolicy.js`；
 * 實際期限一律由 API 的 `payment_due_at` / `review_due_at` 提供。
 * 這裡**只放文案**，不重算任何期限 —— 前端不得再創造第三個數字來源。
 *
 * ## 「通常 1 個工作日」不是 deadline
 *
 * 產品拍板的可稽核承諾是 **3 個日曆日**；「通常 1 個工作日」是
 * expected service level（期待值）。兩者在同一句話裡出現，
 * 但**只有後者**是 backend 的 deadline。
 *
 * 2026-08-26 之前，四處買家文案承諾了一個從未被拍板的小時級審核時間 ——
 * 沒有任何 backend 追蹤，而且比實際 SLA 更緊。已全數改為本檔的常數。
 * （該舊字串刻意不在此重述，好讓「全 repo 不得再出現」的斷言保持有效。）
 */

/** 核帳 SLA 的完整說明（詳情頁、說明區塊）。 */
export const PAYMENT_REVIEW_SLA_TEXT = "通常 1 個工作日內完成，最遲 3 個日曆日內完成";

/** 核帳 SLA 的精簡說明（狀態列 helper，空間有限）。 */
export const PAYMENT_REVIEW_SLA_SHORT = "通常 1 個工作日，最遲 3 個日曆日";

/** 沒有付款期限時（legacy 訂單）的誠實文案 —— **不得**顯示推算出來的假期限。 */
export const PAYMENT_DUE_UNSET_TEXT = "未設定付款期限（舊訂單）";

/**
 * 付款期限已過且**從未在期限內提交過**時的買家文案（Wave 2 #12）。
 *
 * 刻意**不寫「訂單已取消」** —— backend 的 canonical state 仍是 `pending_payment`，
 * 本輪沒有新增 `expired` status，UI 不得創造一個 backend 不存在的訂單狀態。
 *
 * 是否顯示這段文案，由 backend 的 `payment_submission_allowed` 決定，
 * **不是**前端比較日期 —— 逾期但曾在期限內提交過的訂單仍可重傳。
 */
export const PAYMENT_DEADLINE_EXPIRED_TITLE = "付款期限已過";
export const PAYMENT_DEADLINE_EXPIRED_BODY =
  "此訂單目前無法再提交付款憑證。如仍要購買，請重新建立訂單。";
