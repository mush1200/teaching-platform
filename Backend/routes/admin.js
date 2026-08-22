const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const { sendPaymentApprovedEmail, sendPaymentRejectedEmail } = require("../services/emailService");
const reportRepository = require("../repositories/report.repository");
const reportAdminService = require("../services/reportAdmin.service");
const { parseOptionalReportStatusQuery } = require("../utils/reportStatusQuery");
const { resolveReportingRange, InvalidDateRangeError } = require("../utils/reportingRange");
const adminDashboardService = require("../services/adminDashboard.service");
const adminTrendsService = require("../services/adminTrends.service");
const adminOrdersService = require("../services/adminOrders.service");
const adminMaterialsService = require("../services/adminMaterials.service");
const adminPaymentProofsService = require("../services/adminPaymentProofs.service");
const { optionalString } = require("../utils/adminQuery");
const { parseRejection, REJECTION_REASON_TEXT } = require("../utils/paymentProofReview");
const reportWorkflow = require("../utils/reportWorkflow");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

/**
 * GET /admin/materials?status=pending_review|published|unpublished&q=&sort=&page=&limit=
 *
 * Server-side 篩選 / 搜尋 / 排序 / 分頁（Epic §5、§6）。舊版沒有 LIMIT，
 * 資料量一大就會把整張 materials 表送到瀏覽器。
 *
 * 回應仍是 `{ items }`，**額外**帶 `pagination` 與 `statusCounts`：
 *   - `pagination` —— 與 `/admin/payment-proofs`、`/admin/activity-logs` 同一份契約
 *   - `statusCounts` —— 全表計數，**不受 status / q / 分頁影響**。
 *     需要總數的 caller（Dashboard 教材 KPI）讀這裡，不得抓整份清單自己 filter().length。
 *
 * 非法 `status` / `sort` → 400（與 `/admin/orders`、`/admin/payment-proofs` 一致），
 * 不得靜默回空集合。
 */
router.get("/materials", async (req, res) => {
  const parsedStatus = adminMaterialsService.parseStatusQuery(req.query?.status);
  if (!parsedStatus.valid) {
    return res.status(400).json({ message: adminMaterialsService.INVALID_STATUS_MESSAGE });
  }
  const parsedSort = adminMaterialsService.parseSortQuery(req.query?.sort);
  if (!parsedSort.valid) {
    return res.status(400).json({ message: adminMaterialsService.INVALID_SORT_MESSAGE });
  }

  try {
    const [list, statusCounts] = await Promise.all([
      adminMaterialsService.listMaterials({
        status: parsedStatus.status,
        q: optionalString(req.query || {}, "q"),
        sort: parsedSort.sort,
        page: req.query?.page,
        limit: req.query?.limit,
      }),
      adminMaterialsService.getStatusCounts(),
    ]);
    return res.json({ items: list.items, pagination: list.pagination, statusCounts });
  } catch (err) {
    console.error("admin list materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /admin/orders?status=awaiting_payment|pending_review|payment_rejected|approved|cancelled
 *
 * `status` 篩的是 **Admin operational state**（`orders.status` + payment proof 衍生），
 * 不是 `orders.status` 原始值 —— 定義只有一份，在 `services/adminOrders.service.js`。
 * 前端不得再自行 mapping（曾經的 `pending_review → paid` 就是這樣長出來的 dead filter），
 * 也不得抓全部訂單再依憑證自行過濾。
 *
 * 未帶 `status` → 全部訂單；非法值 → 400（與 `/admin/payment-proofs` 行為一致），
 * **不得**靜默回 `{ items: [] }`。
 */
router.get("/orders", async (req, res) => {
  const parsed = adminOrdersService.parseOperationalStatusQuery(req.query?.status);
  if (!parsed.valid) {
    return res.status(400).json({ message: adminOrdersService.INVALID_STATUS_MESSAGE });
  }

  try {
    const items = await adminOrdersService.listOrders({ status: parsed.status });
    return res.json({ items });
  } catch (err) {
    console.error("admin list orders failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * summary 與 trends **必須**共用同一個 resolver 與同一套錯誤行為。
 * 兩個 endpoint 各自解析期間，就會出現「同一個 URL 在 KPI 與圖表上代表不同期間」。
 *
 * 解析失敗時回 400 並結束回應，回傳 `null` 讓 caller 直接 return。
 */
function resolvePeriodOrFail(req, res) {
  try {
    return resolveReportingRange(req.query || {});
  } catch (err) {
    if (err instanceof InvalidDateRangeError) {
      // `error` 供程式判讀，`message` 沿用 repo 既有的錯誤欄位慣例。
      res.status(400).json({ error: err.code, message: err.message });
      return null;
    }
    throw err;
  }
}

/**
 * GET /admin/dashboard/summary?range=today|7d|30d|this_month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 回傳三類數字：
 *   - period metrics（`periodRevenueAmount` / `new*Count`）受所選期間控制
 *   - comparison（`previous*` / `*DeltaPercent`）對照緊鄰前一等長期間；`this_month` 為上月同期
 *   - snapshot / all-time（`*Count` / `revenueAmount` / `pending*Count`）完全不受期間影響
 *
 * 期間一律以 **Asia/Taipei 日曆日**解讀，查詢邊界為 half-open `[from 00:00, to+1 00:00)`。
 * 未帶任何參數時採預設近 30 天（向後相容既有 caller），並在 response 中回傳
 * 實際解析出的 `periodFrom` / `periodTo` / `periodTimezone` 與 `previousPeriodFrom` /
 * `previousPeriodTo`，讓 caller 知道真正的統計範圍與比較基準。
 */
router.get("/dashboard/summary", async (req, res) => {
  const period = resolvePeriodOrFail(req, res);
  if (!period) return undefined;

  try {
    return res.json(await adminDashboardService.getDashboardSummary(period));
  } catch (err) {
    console.error("admin dashboard summary failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /admin/dashboard/trends?range=...&from=...&to=...
 *
 * 與 summary 完全相同的期間契約（含 400 行為）。分開成兩支 endpoint 是為了讓
 * 較重的分組查詢不拖慢 KPI，且圖表可以有獨立的 loading / error 狀態 ——
 * summary 失敗不該讓圖表消失，反之亦然。
 *
 * 兩條序列的事件不同：`revenue` 依 `orders.paid_at`（核准），
 * `orders` 依 `orders.created_at`（建立、不分狀態）。granularity 由期間長度決定，
 * 缺口一律補 0（見 docs/mvp_rules.md §16）。
 */
router.get("/dashboard/trends", async (req, res) => {
  const period = resolvePeriodOrFail(req, res);
  if (!period) return undefined;

  try {
    return res.json(await adminTrendsService.getDashboardTrends(period));
  } catch (err) {
    console.error("admin dashboard trends failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /admin/payment-proofs?status=pending|approved|rejected&q=&page=1&limit=20
 *
 * `q` 是 **human-friendly lookup**（Epic §3）：訂單編號 / 買家 email / 憑證 id。
 * Admin 不應被要求知道 internal identifier 才能找到案件；internal id 仍然可用，
 * 但只是搜尋面之一，不是唯一入口。
 *
 * 回應 `items` 除了憑證本身，另含判斷所需的訂單 context（應付金額、買家 email、
 * 建立時間、付款期限）—— 見 `services/adminPaymentProofs.service.js`。
 */
router.get("/payment-proofs", async (req, res) => {
  const parsed = adminPaymentProofsService.parseReviewStatus(req.query?.status);
  if (!parsed.valid) {
    return res.status(400).json({ message: adminPaymentProofsService.INVALID_STATUS_MESSAGE });
  }

  try {
    const [list, statusCounts] = await Promise.all([
      adminPaymentProofsService.listProofs({
        status: parsed.status,
        q: optionalString(req.query || {}, "q"),
        page: req.query?.page,
        limit: req.query?.limit,
      }),
      adminPaymentProofsService.getStatusCounts(),
    ]);
    return res.json({ items: list.items, pagination: list.pagination, statusCounts });
  } catch (err) {
    console.error("admin list payment proofs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /admin/payment-proofs/:id — 單筆審核的完整 decision context。
 *
 * 回傳憑證 + 訂單 + 買家 + 訂單明細 + **同一張訂單的其他憑證**。
 * 最後一項是必要的：買家在被退回後會重新上傳，Admin 必須看得到上一次的退回理由。
 */
router.get("/payment-proofs/:id", async (req, res) => {
  try {
    const detail = await adminPaymentProofsService.getProofDetail(String(req.params.id));
    if (!detail) return res.status(404).json({ message: "payment proof not found" });
    return res.json(detail);
  } catch (err) {
    console.error("admin get payment proof failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** POST /admin/payment-proofs/:id/approve */
router.post("/payment-proofs/:id/approve", async (req, res) => {
  const proofId = String(req.params.id);
  const { note } = req.body || {};
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const proofResult = await client.query(
      `SELECT mpp.id, mpp.order_id, mpp.review_status, o.status AS order_status
       FROM manual_payment_proofs mpp
       JOIN orders o ON o.id = mpp.order_id
       WHERE mpp.id = $1
       FOR UPDATE`,
      [proofId]
    );
    if (proofResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "payment proof not found" });
    }
    const pr = proofResult.rows[0];

    if (pr.order_status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "order already approved" });
    }
    if (pr.review_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "proof is not pending" });
    }
    if (pr.order_status !== "pending_payment") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "order is not pending_payment" });
    }

    await client.query(
      `UPDATE manual_payment_proofs
       SET review_status = 'approved',
           reviewed_at = NOW(),
           reviewed_by = $2,
           note = COALESCE($3, note)
       WHERE id = $1`,
      [proofId, req.user.userId, note != null ? String(note) : null]
    );

    await client.query(
      `UPDATE manual_payment_proofs
       SET review_status = 'rejected',
           reviewed_at = NOW(),
           reviewed_by = $2,
           note = 'superseded by approved proof'
       WHERE order_id = $1 AND id <> $3 AND review_status = 'pending'`,
      [pr.order_id, req.user.userId, proofId]
    );

    const updatedOrder = await client.query(
      `UPDATE orders
       SET status = 'approved',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending_payment'
       RETURNING id, status, paid_at`,
      [pr.order_id]
    );

    if (updatedOrder.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "order cannot be approved" });
    }

    await client.query("COMMIT");

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "order",
      targetId: pr.order_id,
      action: "payment_proof.approved",
      meta: { proofId },
    });
    void sendPaymentApprovedEmail(pr.order_id);

    const o = updatedOrder.rows[0];
    return res.json({
      proofId,
      order: {
        id: o.id,
        status: o.status,
        paid_at: o.paid_at,
      },
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("approve payment proof failed:", err);
    return res.status(500).json({ message: "server error" });
  } finally {
    client.release();
  }
});

/**
 * POST /admin/payment-proofs/:id/reject — 訂單狀態不變
 *
 * Body: `{ rejection_reason: amount_mismatch|unreadable|payment_not_found|invalid_proof|other,
 *          note?: string }`
 *
 * `rejection_reason` **必填**（Epic §4）。舊版只有自由文字 `note`，前端自己擋
 * 「拒絕時需填寫原因」，Backend 完全不驗 —— 直接打 API 就能留下沒有理由的退件，
 * 而買家在 `/me/orders/:id` 只會看到一片空白。
 *
 * `note` 在 `reason = other` 時必填；其餘情況為選填的補充說明。
 * 兩者都會寫進 `manual_payment_proofs`，並經 `payment_proof_rejected_reason` /
 * `payment_proof_rejected_note` 回到買家的訂單詳情。
 */
router.post("/payment-proofs/:id/reject", async (req, res) => {
  const proofId = String(req.params.id);
  const parsedRejection = parseRejection(req.body || {});
  if (!parsedRejection.ok) {
    return res.status(400).json({ message: parsedRejection.message });
  }
  const { reason: rejectionReason, note } = parsedRejection;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const proofResult = await client.query(
      `SELECT mpp.id, mpp.order_id, mpp.review_status
       FROM manual_payment_proofs mpp
       JOIN orders o ON o.id = mpp.order_id
       WHERE mpp.id = $1
       FOR UPDATE`,
      [proofId]
    );
    if (proofResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "payment proof not found" });
    }
    if (proofResult.rows[0].review_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "proof is not pending" });
    }

    const updated = await client.query(
      `UPDATE manual_payment_proofs
       SET review_status = 'rejected',
           reviewed_at = NOW(),
           reviewed_by = $2,
           rejection_reason = $3,
           note = $4
       WHERE id = $1
       RETURNING id, review_status, rejection_reason, note`,
      [proofId, req.user.userId, rejectionReason, note ?? ""]
    );

    await client.query("COMMIT");

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "order",
      targetId: proofResult.rows[0].order_id,
      action: "payment_proof.rejected",
      meta: { proofId, rejectionReason },
    });
    void sendPaymentRejectedEmail(
      proofResult.rows[0].order_id,
      note || REJECTION_REASON_TEXT[rejectionReason] || ""
    );

    const p = updated.rows[0];
    return res.json({
      proof: {
        id: p.id,
        review_status: p.review_status,
        rejection_reason: p.rejection_reason,
        note: p.note,
      },
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("reject payment proof failed:", err);
    return res.status(500).json({ message: "server error" });
  } finally {
    client.release();
  }
});

/**
 * GET /admin/reports?status=pending|reviewed
 *
 * **Legacy shape** —— 回傳的是**裸陣列**，不是 `{ items }`。既有 caller
 * （Postman collection、`docs/teaching-platform-mvp-spec-v1.4.md` §9）依賴它，
 * 因此形狀與 `status` allowlist（僅 `pending` / `reviewed`）都維持不變。
 *
 * 新的案件佇列請用 `GET /admin/report-cases`：有分頁、有搜尋、支援完整的
 * 五狀態 workflow，且回傳教材／創作者／檢舉人的可讀資訊。
 */
router.get("/reports", async (req, res) => {
  try {
    const parsed = parseOptionalReportStatusQuery(req, res);
    if (!parsed.valid) return;
    const rows = await reportRepository.listReports({ status: parsed.status });
    return res.json(rows);
  } catch (err) {
    console.error("admin list reports failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * `?status=` 支援單值或逗號分隔多值，另接受 `open` 這個別名
 * （= 所有需要 Admin 行動的狀態）。非法值 → 400。
 */
function parseCaseStatusQuery(raw) {
  if (raw == null) return { valid: true, statuses: null };
  const value = String(raw).trim();
  if (!value || value === "all") return { valid: true, statuses: null };
  if (value === "open") return { valid: true, statuses: [...reportWorkflow.OPEN_REPORT_STATUSES] };
  const statuses = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (statuses.length === 0) return { valid: true, statuses: null };
  if (!statuses.every(reportWorkflow.isReportStatus)) return { valid: false };
  return { valid: true, statuses };
}

const INVALID_CASE_STATUS_MESSAGE = `status must be "all", "open", or a comma-separated subset of ${reportWorkflow.REPORT_STATUSES.join("|")}`;

/**
 * GET /admin/report-cases?status=open|all|<csv>&q=&page=&limit=
 *
 * 檢舉案件佇列（Epic §2）。預設**不篩選**；UI 預設帶 `status=open`，
 * 讓 Admin 一進來就看到需要行動的案件，而不是自己從「全部」裡撈。
 */
router.get("/report-cases", async (req, res) => {
  const parsed = parseCaseStatusQuery(req.query?.status);
  if (!parsed.valid) return res.status(400).json({ message: INVALID_CASE_STATUS_MESSAGE });

  try {
    const [list, statusCounts] = await Promise.all([
      reportRepository.listReportCases({
        statuses: parsed.statuses,
        q: optionalString(req.query || {}, "q"),
        page: req.query?.page,
        limit: req.query?.limit,
      }),
      reportRepository.countReportsByStatus(),
    ]);
    return res.json({ items: list.items, pagination: list.pagination, statusCounts });
  } catch (err) {
    console.error("admin list report cases failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/report-cases/:id — 案件詳情 + 完整處理歷程（含 Admin 內部筆記）。 */
router.get("/report-cases/:id", async (req, res) => {
  try {
    const reportId = String(req.params.id);
    const report = await reportRepository.findEnrichedReportById(reportId);
    if (!report) return res.status(404).json({ message: "report not found" });
    const events = await reportRepository.listReportEvents(reportId);
    return res.json({
      report,
      events,
      // allowlist 隨回應一起送，UI 不必自己維護一份可能過期的處置清單。
      availableResolutions: reportWorkflow.REPORT_RESOLUTIONS,
      allowedTransitions: reportWorkflow.ALLOWED_TRANSITIONS[report.status] ?? [],
    });
  } catch (err) {
    console.error("admin get report case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** 服務層結果 → HTTP。錯誤碼對照集中在 service，route 不再各自猜 status code。 */
function sendCaseResult(res, result) {
  if (result.ok) return res.json(result);
  const status = reportAdminService.ERROR_STATUS[result.code] ?? 400;
  return res.status(status).json({ error: result.code, message: result.message });
}

function caseHandler(run) {
  return async (req, res) => {
    try {
      return sendCaseResult(res, await run(req));
    } catch (err) {
      console.error("admin report case action failed:", err);
      return res.status(500).json({ message: "server error" });
    }
  };
}

/** POST /admin/report-cases/:id/investigate — 接手案件（pending → investigating）。 */
router.post(
  "/report-cases/:id/investigate",
  caseHandler((req) =>
    reportAdminService.startInvestigation(String(req.params.id), req.user, {
      note: (req.body || {}).note,
    })
  )
);

/** POST /admin/report-cases/:id/request-response — 要求創作者補充說明。Body: `{ message }` */
router.post(
  "/report-cases/:id/request-response",
  caseHandler((req) =>
    reportAdminService.requestCreatorResponse(String(req.params.id), req.user, {
      message: (req.body || {}).message,
    })
  )
);

/** POST /admin/report-cases/:id/notes — Admin 內部調查筆記（不改狀態、創作者看不到）。 */
router.post(
  "/report-cases/:id/notes",
  caseHandler((req) =>
    reportAdminService.addAdminNote(String(req.params.id), req.user, {
      message: (req.body || {}).message,
    })
  )
);

/**
 * POST /admin/report-cases/:id/resolve — 最終處置。
 * Body: `{ resolution: dismissed|warning|request_changes|unpublish_material, note? }`
 */
router.post(
  "/report-cases/:id/resolve",
  caseHandler((req) =>
    reportAdminService.resolveReport(String(req.params.id), req.user, {
      resolution: (req.body || {}).resolution,
      note: (req.body || {}).note,
    })
  )
);

/** 依教材查檢舉；可選 query status=pending|reviewed（非法值 → 400）。 */
router.get("/materials/:materialId/reports", async (req, res) => {
  try {
    const parsed = parseOptionalReportStatusQuery(req, res);
    if (!parsed.valid) return;
    const materialId = String(req.params.materialId);
    const rows = await reportRepository.listReportsByMaterialId(materialId, {
      status: parsed.status,
    });
    return res.json(rows);
  } catch (err) {
    console.error("admin list material reports failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * 將檢舉標為已讀：pending → reviewed（不代表下架教材）。
 * Body: { "status": "reviewed" }
 */
router.patch("/reports/:id", async (req, res) => {
  try {
    const reportId = String(req.params.id);
    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, "status")) {
      return res.status(400).json({ message: "status is required" });
    }
    const { status } = body;
    if (status !== "reviewed") {
      return res.status(400).json({ message: "only status \"reviewed\" is allowed" });
    }

    const result = await reportAdminService.reviewReport(reportId, req.user);
    if (!result.ok) {
      if (result.code === "not_found") {
        return res.status(404).json({ message: "report not found" });
      }
      return res.status(409).json({ message: "report already reviewed" });
    }
    return res.json(result.report);
  } catch (err) {
    console.error("patch report failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
