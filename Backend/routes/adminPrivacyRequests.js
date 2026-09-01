const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const privacyRequests = require("../services/privacyRequest.service");
const policy = require("../utils/privacyRequestPolicy");

/**
 * 個資權利請求的管理端點（`OPS-04` / `DEC-LEGAL-13`）。
 *
 * ## 為什麼是自己的 namespace
 *
 * `/admin/privacy-requests`，**不是** `/admin/complaints?type=privacy`。
 * Owner 明訂消費申訴與個資請求是不同的 domain；如果唯一的區隔是一個
 * query string，那個區隔遲早會在某次重構裡消失。
 *
 * ## Admin only
 *
 * 對外入口是 Privacy Email（`DEC-LEGAL-07`）。本輪**未新增**任何
 * public / anonymous 提交端點 —— 建案一律由 Admin 依收到的信件執行。
 *
 * ## 這裡沒有的東西
 *
 * 沒有期限、沒有逾期告警、沒有身分驗證狀態、沒有刪除執行 ——
 * 三者的法律結論都尚未取得（見 `utils/privacyRequestPolicy.js` 檔頭）。
 */

router.use(requireAuth, requireRole("admin"));

function statusForCode(code) {
  switch (code) {
    case "request_not_found":
      return 404;
    case "already_in_state":
    case "invalid_transition":
      return 409;
    default:
      return 400;
  }
}

function respondFailure(res, result) {
  return res.status(statusForCode(result.code)).json({
    code: result.code,
    message: result.message,
    from: result.from,
    allowed: result.allowed,
  });
}

/**
 * GET /admin/privacy-requests?status=&limit=&offset=
 *
 * 一併回傳 taxonomy，讓前端不必維護第二份選項清單。
 */
router.get("/privacy-requests", async (req, res) => {
  try {
    const result = await privacyRequests.listRequests({
      status: req.query.status ? String(req.query.status) : null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (result.ok === false) return respondFailure(res, result);

    return res.json({
      items: result.items.map(privacyRequests.toAdminView),
      total: result.total,
      requestTypeOptions: policy.PRIVACY_REQUEST_TYPES.map((code) => ({
        code,
        label: policy.PRIVACY_REQUEST_TYPE_LABEL[code],
      })),
      statusOptions: policy.PRIVACY_REQUEST_STATUSES.map((code) => ({
        code,
        label: policy.PRIVACY_REQUEST_STATUS_LABEL[code],
      })),
    });
  } catch (err) {
    console.error("list privacy requests failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/privacy-requests/:id —— 詳情 ＋ 完整歷程。 */
router.get("/privacy-requests/:id", async (req, res) => {
  try {
    const row = await privacyRequests.getRequest(String(req.params.id));
    if (!row) return res.status(404).json({ code: "request_not_found", message: "privacy request not found" });
    const events = await privacyRequests.listEvents(row.id);
    return res.json({
      request: privacyRequests.toAdminView(row),
      events: events.map(privacyRequests.toEventView),
    });
  } catch (err) {
    console.error("read privacy request failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/privacy-requests
 * body: { requestType, requesterReference, summary, receivedAt, source? }
 *
 * **資料最小化**：只收回覆請求真正需要的欄位。不收出生日期、身分證、
 * 護照、政府證件或金融資訊 —— 草稿未揭露平台會蒐集那些。
 */
router.post("/privacy-requests", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await privacyRequests.createRequest({
      requestType: b.requestType,
      requesterReference: b.requesterReference,
      summary: b.summary,
      receivedAt: b.receivedAt,
      source: b.source,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) return respondFailure(res, result);

    /*
     * 稽核為**營運紀錄**，不是法律結論。
     * 刻意不寫 requesterReference（那是請求者的聯絡資料，
     * 已存在案件本身；稽核不需要再複製一份個資）。
     */
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "privacy_request",
      targetId: result.request.id,
      action: "privacy_request.created",
      meta: {
        requestType: result.request.request_type,
        source: result.request.source,
        receivedAt: result.request.received_at,
      },
    });
    return res.status(201).json(privacyRequests.toAdminView(result.request));
  } catch (err) {
    console.error("create privacy request failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/privacy-requests/:id/transition
 * body: { status, note? }
 *
 * 狀態只描述處理進度。`completed` 代表「平台已處理完這個請求」，
 * **不代表**「資料已全部刪除」—— 帳號刪除語意仍為 `SCHEMA-02` / `O-22`（blocked）。
 */
router.post("/privacy-requests/:id/transition", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await privacyRequests.transition({
      requestId: String(req.params.id),
      toStatus: b.status,
      note: b.note,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) return respondFailure(res, result);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "privacy_request",
      targetId: result.request.id,
      action: "privacy_request.status_changed",
      meta: { from: result.from, to: result.to, requestType: result.request.request_type },
    });
    return res.json({
      request: privacyRequests.toAdminView(result.request),
      from: result.from,
      to: result.to,
    });
  } catch (err) {
    console.error("transition privacy request failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** POST /admin/privacy-requests/:id/notes —— body: { note } */
router.post("/privacy-requests/:id/notes", async (req, res) => {
  try {
    const result = await privacyRequests.addNote({
      requestId: String(req.params.id),
      note: (req.body || {}).note,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) return respondFailure(res, result);
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("add privacy request note failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
