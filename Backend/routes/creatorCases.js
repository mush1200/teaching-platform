const express = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const reportRepository = require("../repositories/report.repository");
const reportAdminService = require("../services/reportAdmin.service");
const reportWorkflow = require("../utils/reportWorkflow");

/**
 * Creator 端的平台案件（moderation case）介面 —— Epic §2 的「創作者溝通」。
 *
 * ## 這**不是**聊天室
 *
 * 沒有 WebSocket、沒有輪詢、沒有 typing indicator。它是 case-based response：
 * Admin 在案件上留下一則「要求補充說明」，創作者在自己的後台看到待回覆案件，
 * 提交一段文字說明，案件回到 Admin 手上。這是 MVP 能真正做完的最小形狀。
 *
 * ## 授權
 *
 * `requireRole("teacher")` 只擋角色；**真正的資料邊界在 SQL 的
 * `materials.teacher_id = req.user.userId`**（見 report.repository）。
 * 不是自己教材上的案件一律 404 —— 回 403 會洩漏「這個 case id 存在」。
 *
 * ## 目前**沒有** push notification
 *
 * 平台沒有 notifications 資料表；`services/emailService.js` 只涵蓋訂單／付款事件。
 * 因此創作者是**主動來看**（pull），不是被通知。這是刻意的 MVP 邊界，
 * 不是被遺漏 —— 見最終報告的 Remaining product decisions。
 */

const router = express.Router();
router.use(requireAuth, requireRole("teacher"));

/** Creator 視角的「待我回覆」；其餘狀態一律歸入歷史案件。 */
const CREATOR_ACTION_STATUSES = Object.freeze(["awaiting_creator"]);

function parseScope(raw) {
  const value = raw == null ? "" : String(raw).trim();
  if (!value || value === "all") return { valid: true, statuses: null };
  if (value === "action_required") return { valid: true, statuses: [...CREATOR_ACTION_STATUSES] };
  if (value === "open") return { valid: true, statuses: [...reportWorkflow.OPEN_REPORT_STATUSES] };
  return { valid: false };
}

/** GET /creator/cases?scope=action_required|open|all&page=&limit= */
router.get("/", async (req, res) => {
  const parsed = parseScope(req.query?.scope);
  if (!parsed.valid) {
    return res.status(400).json({ message: 'scope must be one of action_required|open|all' });
  }
  try {
    const list = await reportRepository.listCreatorCases({
      creatorId: req.user.userId,
      statuses: parsed.statuses,
      page: req.query?.page,
      limit: req.query?.limit,
    });
    const actionRequired = await reportRepository.listCreatorCases({
      creatorId: req.user.userId,
      statuses: [...CREATOR_ACTION_STATUSES],
      page: 1,
      limit: 1,
    });
    return res.json({
      items: list.items,
      pagination: list.pagination,
      // 側欄／頁首的「待回覆」徽章讀這個數字，不要靠 items.length 推算（那只是一頁）。
      actionRequiredCount: actionRequired.pagination.total,
    });
  } catch (err) {
    console.error("creator list cases failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /creator/cases/:id — 案件詳情 + 創作者可見的時間軸（不含 Admin 內部筆記）。 */
router.get("/:id", async (req, res) => {
  try {
    const reportId = String(req.params.id);
    const found = await reportRepository.findCreatorCase({
      reportId,
      creatorId: req.user.userId,
    });
    if (!found) return res.status(404).json({ message: "case not found" });
    const events = await reportRepository.listCreatorVisibleEvents(reportId);
    return res.json({
      case: found,
      events,
      canRespond: found.status === "awaiting_creator",
    });
  } catch (err) {
    console.error("creator get case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /creator/cases/:id/respond — 提交說明。Body: `{ message }`
 *
 * `awaiting_creator → investigating`：球回到 Admin 手上。
 * 不在 `awaiting_creator` 的案件回 409（不是 400）—— 這是狀態衝突，不是格式錯誤。
 */
router.post("/:id/respond", async (req, res) => {
  try {
    const result = await reportAdminService.submitCreatorResponse(
      String(req.params.id),
      req.user,
      { message: (req.body || {}).message }
    );
    if (result.ok) return res.json(result);
    const status = reportAdminService.ERROR_STATUS[result.code] ?? 400;
    return res.status(status).json({ error: result.code, message: result.message });
  } catch (err) {
    console.error("creator respond to case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
