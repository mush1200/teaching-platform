const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getPaymentBankInfo } = require("../config/paymentBankInfo");

const router = express.Router();

/**
 * GET /payment/bank-info —— 人工轉帳的收款帳戶。
 *
 * 前端（結帳 Step 2、付款憑證頁）先前各自硬編碼一份帳號，與通知信共三份。
 * 這個端點讓它們改讀 Backend 的唯一來源（`config/paymentBankInfo.js`）。
 *
 * **`requireAuth` 而非公開**：只有登入的買家會走到匯款指示（結帳與付款憑證都在
 * 登入後），沒有理由讓匿名流量抓取平台的收款帳戶。這不是機密，但也不是公開資訊。
 *
 * 未設定時回 **200 ＋ `configured: false`**，不是 404 也不是 500 ——
 * 「尚未設定」是一個前端要能明確渲染的正常狀態（顯示「付款資訊尚未設定」並擋住
 * 匯款指示），不是錯誤。`missing` 只在非 production 回傳：它列的是 env 變數名稱，
 * 對本機開發是直接的修復指引，但沒有理由外流到 production 的瀏覽器。
 */
router.get("/bank-info", requireAuth, (req, res) => {
  const info = getPaymentBankInfo();

  if (!info.configured) {
    const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    return res.json({ configured: false, ...(isProduction ? {} : { missing: info.missing }) });
  }

  return res.json({
    configured: true,
    bank_name: info.bankName,
    bank_code: info.bankCode,
    account_number: info.accountNumber,
    account_name: info.accountName,
  });
});

module.exports = router;
