const express = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { resolveReportingRange, InvalidDateRangeError } = require("../utils/reportingRange");
const teacherSalesService = require("../services/teacherSales.service");

const router = express.Router();

/**
 * Creator（teacher）銷售統計。
 *
 * 三支 endpoint 共用**同一個** reporting range resolver（`utils/reportingRange.js`）與
 * 同一個 eligible-sale 定義（`services/teacherSales.service.js`），與 Admin dashboard
 * 完全一致：Asia/Taipei 日曆日、half-open `[start, end)`、`range` / `from` / `to` 契約、
 * 不合法 → 400 `INVALID_DATE_RANGE`、未帶參數 → 預設近 30 天。
 *
 * 語意（見 docs/mvp_rules.md §18）：
 *   金額 = SUM(order_items.subtotal)（**折扣前** Creator Gross Sales）
 *   狀態 = orders.status = 'approved'（`completed` 為 dead status，已移除）
 *   日期 = orders.paid_at（成交／核准日，非下單日）
 *
 * 刻意**不再**提供 `status` query 參數：canonical 定義已固定為 approved + paid_at，
 * 其餘狀態的訂單沒有 `paid_at`，任何 status 篩選都只會回傳空集合。
 */

function toPositiveInt(value, fallback) {
  const num = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function parsePagination(query) {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(100, toPositiveInt(query.limit, 20));
  return { page, limit };
}

/**
 * 與 Admin dashboard 相同的期間解析與錯誤行為。
 * 解析失敗時回 400 並結束回應，回傳 `null` 讓 caller 直接 return。
 */
function resolvePeriodOrFail(req, res) {
  try {
    return resolveReportingRange(req.query || {});
  } catch (err) {
    if (err instanceof InvalidDateRangeError) {
      res.status(400).json({ error: err.code, message: err.message });
      return null;
    }
    throw err;
  }
}

/** GET /teacher/sales/summary?range=today|7d|30d|this_month|custom&from=&to= */
router.get("/summary", requireAuth, requireRole("teacher"), async (req, res) => {
  const period = resolvePeriodOrFail(req, res);
  if (!period) return undefined;

  try {
    return res.json(await teacherSalesService.getSalesSummary(period, req.user.userId));
  } catch (err) {
    console.error("teacher sales summary failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /teacher/sales/materials?range=…&search=&page=&limit= */
router.get("/materials", requireAuth, requireRole("teacher"), async (req, res) => {
  const period = resolvePeriodOrFail(req, res);
  if (!period) return undefined;

  const { page, limit } = parsePagination(req.query || {});
  const search = req.query.search ? String(req.query.search).trim() : "";

  try {
    return res.json(await teacherSalesService.getSalesByMaterial(period, req.user.userId, { search, page, limit }));
  } catch (err) {
    console.error("teacher sales by materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /teacher/sales/records?range=…&materialId=&page=&limit= */
router.get("/records", requireAuth, requireRole("teacher"), async (req, res) => {
  const period = resolvePeriodOrFail(req, res);
  if (!period) return undefined;

  const { page, limit } = parsePagination(req.query || {});
  const materialId = req.query.materialId ? String(req.query.materialId).trim() : "";

  try {
    return res.json(await teacherSalesService.getSalesRecords(period, req.user.userId, { materialId, page, limit }));
  } catch (err) {
    console.error("teacher sales records failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
