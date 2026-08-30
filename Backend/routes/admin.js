const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const {
  FREEZE_REASONS,
  FREEZE_REASON_LABEL,
  validateFreezeRequest,
} = require("../utils/accountFreezePolicy");
const { sendPaymentApprovedEmail, sendPaymentRejectedEmail } = require("../services/emailService");
const materialReviewService = require("../services/materialReview.service");
const materialRightsReviewService = require("../services/materialRightsReview.service");
const { recordFulfillmentSnapshot } = require("../services/orderService");
const entitlementService = require("../services/entitlement.service");
const refundRemedyService = require("../services/refundRemedy.service");
const materialFileRetention = require("../services/materialFileRetention.service");
const complaints = require("../services/consumerComplaint.service");
const materialFileService = require("../services/materialFile.service");
const { sendFileDownload } = require("../utils/fileDownloadResponse");
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
 * GET /admin/orders?status=awaiting_payment|pending_review|payment_rejected|approved|cancelled&q=&page=&limit=
 *
 * `status` 篩的是 **Admin operational state**（`orders.status` + payment proof 衍生），
 * 不是 `orders.status` 原始值 —— 定義只有一份，在 `services/adminOrders.service.js`。
 * 前端不得再自行 mapping（曾經的 `pending_review → paid` 就是這樣長出來的 dead filter），
 * 也不得抓全部訂單再依憑證自行過濾。
 *
 * 未帶 `status` → 全部訂單；非法值 → 400（與 `/admin/payment-proofs` 行為一致），
 * **不得**靜默回 `{ items: [] }`。
 *
 * `q` 搜尋**訂單編號或買家 Email** —— 客訴進來時 Admin 手上就是這兩樣東西。
 * `pagination` 與 `/admin/materials`、`/admin/payment-proofs`、`/admin/activity-logs`
 * 同一份契約（`utils/adminQuery.js`）。回應仍以 `items` 為主體，`pagination` 是**額外**欄位，
 * 因此既有 caller（Dashboard 的「需要注意的訂單」）不會因為這次擴充而讀不到資料。
 */
router.get("/orders", async (req, res) => {
  const parsed = adminOrdersService.parseOperationalStatusQuery(req.query?.status);
  if (!parsed.valid) {
    return res.status(400).json({ message: adminOrdersService.INVALID_STATUS_MESSAGE });
  }

  try {
    const list = await adminOrdersService.listOrders({
      status: parsed.status,
      q: optionalString(req.query || {}, "q"),
      page: req.query?.page,
      limit: req.query?.limit,
    });
    return res.json({ items: list.items, pagination: list.pagination });
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

/**
 * POST /admin/payment-proofs/:id/approve
 *
 * `paymentReceivedAt`（選填）＝ Admin 在銀行帳戶上**實際觀察到的入帳時間**。
 *
 * 它與 `orders.paid_at` 是**兩件事**，不得互相冒充：
 *   - `paid_at`             這一刻（Admin 按下核准）—— 既有語意，營收認列依據
 *   - `payment_received_at` 銀行實際入帳的那一刻 —— 稅務憑證時點依此
 *
 * **沒有提供時一律保持 NULL，絕不預設為 NOW()** ——
 * 那正是 `paid_at` 目前被混用的成因；寧可誠實地「不知道」，
 * 也不要製造一個看起來精確但其實是猜的時間。
 * Admin UI 的輸入欄位屬下一個 wave；本輪先讓後端有明確的寫入路徑。
 */
router.post("/payment-proofs/:id/approve", async (req, res) => {
  const proofId = String(req.params.id);
  const { note, paymentReceivedAt } = req.body || {};

  let paymentReceived = null;
  if (paymentReceivedAt != null && String(paymentReceivedAt).trim() !== "") {
    const parsed = new Date(String(paymentReceivedAt));
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ code: "invalid_payment_received_at", message: "paymentReceivedAt is not a valid date" });
    }
    // 已經發生的事不可能在未來。允許一天的時差寬容（時區／時鐘偏差）。
    if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ code: "invalid_payment_received_at", message: "paymentReceivedAt cannot be in the future" });
    }
    paymentReceived = parsed.toISOString();
  }

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

    // `paid_at = NOW()` 是**既有語意，不動** —— 它是 Admin 核准時間，
    // 也是 adminDashboard / adminTrends / teacherSales 的營收認列依據。
    // `payment_received_at` 只在 Admin 明確提供時才寫入；未提供則保持既有值（多為 NULL）。
    const updatedOrder = await client.query(
      `UPDATE orders
       SET status = 'approved',
           paid_at = NOW(),
           payment_received_at = COALESCE($2::timestamptz, payment_received_at),
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending_payment'
       RETURNING id, status, paid_at, payment_received_at`,
      [pr.order_id, paymentReceived]
    );

    if (updatedOrder.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "order cannot be approved" });
    }

    /*
     * 買家的下載授權**正是在這一刻成立**，因此「實際交付了哪個教材版本」
     * 必須在**同一個 transaction** 內記下來（P1-09 Gate 7 / PRE-04.1）。
     * 分開寫會出現「有授權但不知道交付了什麼」的中間狀態。
     *
     * 沒有已核准檔案的教材**不寫入**（legacy `published` 但無檔的教材確實存在）——
     * 猜一個版本等於製造假的履約證據。已有 snapshot 的品項也不覆寫。
     */
    await recordFulfillmentSnapshot(client, pr.order_id);

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
        payment_received_at: o.payment_received_at,
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

/* ------------------------------------------------------------------ *
 * 教材上架審核（Material Review MVP Phase 1）
 *
 * 這兩支是**唯一**正式的教材審核入口。
 *
 * 為什麼不繼續用 generic 的 `PUT/PATCH /materials/:id { status }`：
 * 那是部分更新端點，沒有轉移規則、沒有退回原因、沒有 reviewer 快照，
 * 而且轉回 `pending_review` 時完全不寫稽核。審核是有語意的業務動作。
 *
 * **下架不在這裡。** `published → unpublished` 只能經由檢舉處置
 * （`POST /admin/report-cases/:id/resolve` 的 `unpublish_material`）——
 * 那條路徑必然帶著 reportId 與案件歷程。在教材頁再開一個下架入口，
 * 會產生一批沒有案件、沒有原因、卻共用同一個 action name 的下架事件。
 * ------------------------------------------------------------------ */

/** 服務層結果 → HTTP。錯誤碼對照集中在 service，route 不自己猜 status code。 */
function materialReviewHandler(run) {
  return async (req, res) => {
    try {
      const result = await run(req);
      if (!result.ok) {
        const status = materialReviewService.ERROR_STATUS[result.code] || 400;
        return res.status(status).json({ message: result.message, error: result.code });
      }
      return res.json({ material: result.material, ...(result.firstPublish !== undefined ? { firstPublish: result.firstPublish } : {}) });
    } catch (err) {
      console.error("admin material review action failed:", err);
      return res.status(500).json({ message: "server error" });
    }
  };
}

/**
 * POST /admin/materials/:id/approve — 核准上架。
 *
 * 只允許 `pending_review → published`；其餘狀態一律 409（含重複核准）。
 * Body（選填）：`{ note }` —— 內部備註，寫進 activity log，不寄給創作者。
 */
router.post(
  "/materials/:id/approve",
  materialReviewHandler((req) =>
    materialReviewService.approveMaterial(String(req.params.id), req.user, {
      note: (req.body || {}).note,
    })
  )
);

/**
 * POST /admin/materials/:id/request-changes — 退回修改。
 *
 * 只允許 `pending_review → changes_requested`。
 * Body（必填）：`{ reasonCode, note }`；`note` trim 後至少 10 字 ——
 * 一個沒有具體說明的退回等於把教材永久卡死在創作者手上。
 */
router.post(
  "/materials/:id/request-changes",
  materialReviewHandler((req) =>
    materialReviewService.requestChanges(String(req.params.id), req.user, {
      reasonCode: (req.body || {}).reasonCode ?? (req.body || {}).reason_code,
      note: (req.body || {}).note,
    })
  )
);

/**
 * GET /admin/materials/:id/file?slot=pending|approved — 審核用的教材檔案下載。
 *
 * ## 為什麼 Admin 需要真的下載
 *
 * 「審核教材」如果只能看標題與描述，那不是審核，是核對表單。`file_problem` 這個
 * 退回原因要能誠實成立，Admin 必須能實際打開創作者交的檔案。
 *
 * ## 兩個 slot
 *
 *   pending  —— 這次待審的候選檔（審核時看的就是它）
 *   approved —— 目前買家實際下載到的檔案（處理檢舉、事故調查時看的）
 *
 * 兩者分開指定而不是「給我這份教材的檔案」：審核中的教材同時存在兩個不同的檔案，
 * 讓端點自己猜要給哪一個，遲早會在某個狀態下猜錯 —— 而猜錯的後果是
 * Admin 以為自己審了新檔，其實看的是舊檔。
 *
 * 每一次下載都寫稽核：付費教材的內容經由這條路徑離開平台，必須留下誰在什麼時候取走。
 * **不記 storage key** —— 稽核需要的是「誰取走了哪份教材的哪個檔」，不是它存在哪裡。
 */
router.get("/materials/:id/file", async (req, res) => {
  const materialId = String(req.params.id);
  const slot = String(req.query.slot || "pending");
  if (!["pending", "approved"].includes(slot)) {
    return res.status(400).json({ error: "invalid_slot", message: "slot must be pending or approved" });
  }

  try {
    const exists = await db.query(`SELECT id FROM materials WHERE id = $1`, [materialId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ message: "material not found" });
    }

    const file = await materialFileService.getSlotFile(materialId, slot);
    if (!file) {
      return res.status(409).json({
        error: "material_file_unavailable",
        message:
          slot === "pending"
            ? "這份教材目前沒有待審核的教材檔案。"
            : "這份教材目前沒有已核准的教材檔案。",
      });
    }

    const opened = await materialFileService.openFileForDelivery(file);
    if (!opened.ok) {
      return res
        .status(materialFileService.statusForCode(opened.code))
        .json({ error: opened.code, message: opened.message });
    }

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "admin.material_file_downloaded",
      meta: {
        slot,
        fileId: file.id,
        originalFilename: file.original_filename,
        sizeBytes: Number(file.size_bytes),
      },
    });

    sendFileDownload(res, { file, stream: opened.stream, sizeBytes: opened.sizeBytes });
  } catch (err) {
    console.error("admin material file download failed:", err);
    if (!res.headersSent) return res.status(500).json({ message: "server error" });
  }
});

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
 * **@deprecated legacy** —— 將檢舉標為已讀：`pending → reviewed`（不代表下架教材）。
 * Body: `{ "status": "reviewed" }`
 *
 * ## 為什麼還在
 *
 * 純粹是 backward compatibility：這支端點在新版案件流程之前就存在，可能仍有外部
 * caller。**正式產品 UI 已經沒有任何入口會呼叫它**（`/admin/materials/:id/reports`
 * 的「標記已處理」按鈕已移除），Postman 的正式 happy path 也不再使用它。
 *
 * ## 它產生的東西為什麼是債
 *
 * `reviewed` 只代表「有人按過已讀」：沒有 resolution、沒有處置說明、沒有完整案件歷程。
 * 正式流程請改用：
 *   `POST /admin/report-cases/:id/investigate` → `/request-response` → `/resolve`
 *
 * 既有的 `reviewed` 資料**保留不回填**（見 `utils/reportWorkflow.js`）。
 *
 * 回應會帶 `Deprecation: true`，讓仍在呼叫它的 client 有機會發現。
 */
router.patch("/reports/:id", async (req, res) => {
  try {
    // RFC 8594 風格的提示；行為完全不變，只是讓 caller 看得到它已被標記淘汰。
    res.set("Deprecation", "true");
    res.set("Link", '</admin/report-cases>; rel="successor-version"');

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

/* -------------------------------------------------------------------------- */
/* 退款／補救案件（P1-09 Gate 14）                                             */
/* -------------------------------------------------------------------------- */
/*
 * **與 `reports` 是不同的東西。** `reports` 是內容檢舉（moderation）：
 * 一定針對某份教材、一人一材一次、結論全是下架／警告類。
 * 消費者救濟案件的 owner 是買家、對象是訂單、結論涉及金錢，兩者不共用。
 *
 * **這裡沒有法律判斷** —— 法定解除是否成立、金額多少，取決於個案與
 * External Legal Gate 尚未完成的部分。這裡只是可稽核的案件容器。
 *
 * **`approved` 不等於錢已退**：必須再經 `remedy_pending` 才能 `completed`。
 * **本輪不執行任何實際匯款，也不自動變更 entitlement。**
 */

/** GET /admin/remedy-cases?status=&orderId=&buyerId= */
router.get("/remedy-cases", async (req, res) => {
  try {
    const items = await refundRemedyService.listCases({
      status: req.query.status || null,
      orderId: req.query.orderId || null,
      buyerId: req.query.buyerId || null,
      limit: req.query.limit,
    });
    return res.json({ items });
  } catch (err) {
    console.error("admin list remedy cases failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/remedy-cases/:id — 案件 ＋ 狀態變更歷程 */
router.get("/remedy-cases/:id", async (req, res) => {
  try {
    const found = await refundRemedyService.getCase(String(req.params.id));
    if (!found) return res.status(404).json({ message: "case not found" });
    const history = await refundRemedyService.listHistory(String(req.params.id));
    return res.json({ case: found, history });
  } catch (err) {
    console.error("admin get remedy case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/remedy-cases/:id/transition
 * body: { status, note, approvedAmount?, entitlementAction?, refundMethod?, refundReference?, refundPaidAt? }
 *
 * `entitlementAction` **只是記錄**這個案件應該對授權做什麼；
 * 實際轉移一律另行呼叫 `POST /admin/order-items/:id/entitlement`，由人明示操作。
 */
router.post("/remedy-cases/:id/transition", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await refundRemedyService.transition({
      caseId: String(req.params.id),
      toStatus: b.status,
      note: b.note,
      approvedAmount: b.approvedAmount ?? null,
      entitlementAction: b.entitlementAction ?? null,
      // 付款證據**不從這裡寫入** —— 走 POST /admin/remedy-cases/:id/execute-refund。
      refundPaidAt: b.refundPaidAt ?? null,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const notFound = result.code === "case_not_found";
      const conflict = result.code === "already_in_state" || result.code === "invalid_transition";
      return res
        .status(notFound ? 404 : conflict ? 409 : 400)
        .json({ code: result.code, message: result.message, from: result.from, allowed: result.allowed });
    }
    return res.json({ caseId: result.case.id, from: result.from, to: result.to, case: result.case });
  } catch (err) {
    console.error("admin transition remedy case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/remedy-cases/:id/execute-refund
 * body: { amount, paymentReference, paidAt?, note? }
 *
 * 記錄一筆**已經在行外完成**的人工銀行退款。這個端點不會匯錢。
 *
 * **Admin only**（本 router 已由 index.js 掛上 requireAuth + requireRole("admin")）。
 * 買家沒有任何路徑可以自行把案件標成已退款 —— 買家端只有建立與查詢。
 *
 * 完成後**不自動**撤銷 entitlement。回應中的 `pendingEntitlementAction`
 * 只是案件先前記錄的意圖，實際轉移仍須走
 * `POST /admin/order-items/:id/entitlement` 由人明示操作。
 */
router.post("/remedy-cases/:id/execute-refund", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await refundRemedyService.executeRefund({
      caseId: String(req.params.id),
      amount: b.amount,
      paymentReference: b.paymentReference,
      paidAt: b.paidAt ?? null,
      note: b.note ?? null,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const notFound = result.code === "case_not_found";
      const conflict =
        result.code === "invalid_state" ||
        result.code === "already_executed" ||
        result.code === "non_cash_remedy" ||
        result.code === "case_not_approved";
      return res.status(notFound ? 404 : conflict ? 409 : 400).json({
        code: result.code,
        message: result.message,
        status: result.status,
        approvedAmount: result.approvedAmount,
      });
    }
    return res.json({
      caseId: result.case.id,
      case: result.case,
      pendingEntitlementAction: result.pendingEntitlementAction,
    });
  } catch (err) {
    console.error("admin execute refund failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 買家授權狀態（P1-09 Gate 14）                                               */
/* -------------------------------------------------------------------------- */
/*
 * **與 `orders.status` 正交。** 暫停或撤銷單一買家對單一教材的存取一律走這裡；
 * 不得取消訂單、不得改動已核准訂單狀態、不得動 `paid_at`。
 * 正確結果是：訂單仍是 `approved`，但存取被拒絕。
 *
 * 這裡只有**管理能力**，沒有法律判斷 —— 「什麼時候應該撤銷」
 * （法定解除是否成立、退款是否核准）屬 Gate 14 尚未完成的部分與 External Legal Gate。
 */

/** POST /admin/order-items/:id/entitlement — body: { status, reason } */
router.post("/order-items/:id/entitlement", async (req, res) => {
  try {
    const { status, reason } = req.body || {};
    const result = await entitlementService.changeStatus({
      orderItemId: String(req.params.id),
      toStatus: status,
      reason,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const notFound = result.code === "order_item_not_found";
      const conflict = result.code === "already_in_state" || result.code === "invalid_transition";
      return res
        .status(notFound ? 404 : conflict ? 409 : 400)
        .json({ code: result.code, message: result.message, from: result.from, allowed: result.allowed });
    }
    return res.json({
      orderItemId: result.orderItem.id,
      from: result.from,
      to: result.to,
      entitlementStatus: result.orderItem.entitlement_status,
      // 履約事實不因狀態變更而改變。
      fulfilledMaterialVersionId: result.orderItem.fulfilled_material_version_id,
    });
  } catch (err) {
    console.error("admin change entitlement failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/order-items/:id/entitlement — 目前狀態 ＋ 變更歷程 */
router.get("/order-items/:id/entitlement", async (req, res) => {
  try {
    const orderItemId = String(req.params.id);
    const current = await entitlementService.getEntitlement(orderItemId);
    if (!current) return res.status(404).json({ message: "order item not found" });
    const history = await entitlementService.listStatusHistory(orderItemId);
    return res.json({ current, history });
  } catch (err) {
    console.error("admin get entitlement failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 教材權利審查（P1-09 Gate 2 / D5）                                           */
/* -------------------------------------------------------------------------- */
/*
 * **刻意與 `POST /admin/materials/:id/approve` 分開。**
 *
 * 那條路徑是**一般內容審核**的狀態機（上架 / 退回）。
 * 權利審查是**不同的事**：平台對權利風險做過什麼審查、發現什麼、依據什麼證據。
 *
 * 若把它做成核准的副作用，會產生兩個問題：
 *   1. 「核准上架」等同於「權利審查通過」—— Platform-as-Seller 下平台自身的
 *      交付行為不受 ISP 免責事由保護，權利審查是平台自己的防線，不能是副作用。
 *   2. 目前沒有讓審查者輸入 risk flags 與證據的介面，自動寫入只會產生
 *      空 flags、無證據的空殼記錄 —— **看起來像盡職紀錄，實際上什麼都沒審**。
 *
 * 因此權利審查是**明示的行為**。Admin UI 屬後續 wave。
 */

/** POST /admin/materials/:id/rights-review */
router.post("/materials/:id/rights-review", async (req, res) => {
  try {
    const { reviewResult, riskFlags, notes, declarationVersion, evidenceReference } = req.body || {};
    const result = await materialRightsReviewService.recordReview({
      materialId: String(req.params.id),
      reviewedBy: req.user.userId,
      reviewResult,
      riskFlags: riskFlags ?? [],
      notes: notes ?? null,
      declarationVersion: declarationVersion ?? null,
      evidenceReference: evidenceReference ?? null,
    });
    if (!result.ok) {
      const status = result.code === "material_not_found" ? 404 : 400;
      return res.status(status).json({ code: result.code, message: result.message });
    }

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: String(req.params.id),
      action: "material.rights_reviewed",
      meta: { result: result.review.review_result, riskFlags: result.review.risk_flags },
    });

    return res.status(201).json({ review: result.review });
  } catch (err) {
    console.error("admin material rights review failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/materials/:id/rights-reviews — 完整審查歷程（新到舊） */
router.get("/materials/:id/rights-reviews", async (req, res) => {
  try {
    const materialId = String(req.params.id);
    const history = await materialRightsReviewService.listReviewHistory(materialId);
    return res.json({
      materialId,
      // 沒有任何審查記錄是**合法狀態** —— 既有教材本來就沒有，且刻意不 backfill。
      latest: history[0] ?? null,
      history,
    });
  } catch (err) {
    console.error("admin list material rights reviews failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 帳號凍結（P1-09 Gate 1）                                                    */
/* -------------------------------------------------------------------------- */
/*
 * 應記載事項第十二點要求：知悉帳號密碼被冒用時，**立即**暫停該帳號所生交易之
 * 處理及後續利用。強制點在 `middlewares/accountStatus.js`（即時查 DB，
 * 不放進 JWT —— token 有效期 7 天，塞進去會讓凍結延遲至多 7 天生效）。
 *
 * 這裡只提供最小的 backend capability。Admin Users 管理頁屬後續 wave；
 * 本輪不為此重做整個 Admin UI。
 *
 * **不得凍結 admin 帳號** —— admin 只能由維運 CLI 建立，
 * 把 admin 鎖在門外會讓解凍本身變得不可能。
 */

async function setAccountStatus(req, res, { freeze }) {
  const targetId = String(req.params.id);

  /*
   * `OPS-02`：凍結原因改為 **standardized taxonomy**（`utils/accountFreezePolicy.js`）。
   *
   * 驗證一律在此執行 —— **前端的下拉選單不是驗證**。未知代碼、缺 `other` 說明
   * 都必須在 backend 被擋下，否則 taxonomy 只是個裝飾。
   *
   * **向後相容：** `users.freeze_reason` 維持人類可讀文字（存 `reasonText`），
   * 結構化的 code/note 寫進 `activity_logs.meta`。歷史自由文字資料不動、不回填。
   */
  let freezeInput = null;
  if (freeze) {
    const validated = validateFreezeRequest(req.body || {});
    if (!validated.valid) {
      return res.status(400).json({ code: validated.code, message: validated.message });
    }
    freezeInput = validated;
  }

  if (targetId === req.user.userId) {
    return res.status(400).json({ code: "cannot_freeze_self", message: "cannot change own account status" });
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id, role, account_status FROM users WHERE id = $1 FOR UPDATE`,
      [targetId]
    );
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "user not found" });
    }
    const target = found.rows[0];
    if (target.role === "admin") {
      await client.query("ROLLBACK");
      return res.status(400).json({ code: "cannot_freeze_admin", message: "admin accounts cannot be frozen" });
    }

    const nextStatus = freeze ? "frozen" : "active";
    if (target.account_status === nextStatus) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "already_in_state", message: `account is already ${nextStatus}` });
    }

    const updated = freeze
      ? await client.query(
          `UPDATE users
              SET account_status = 'frozen', frozen_at = NOW(), frozen_by = $2, freeze_reason = $3
            WHERE id = $1
            RETURNING id, account_status, frozen_at, freeze_reason`,
          [targetId, req.user.userId, freezeInput.reasonText]
        )
      : await client.query(
          // 解凍**保留** frozen_at / frozen_by / freeze_reason —— 那是稽核軌跡，
          // 不因解凍而抹去「這個帳號曾經被凍結過、原因是什麼」。
          `UPDATE users
              SET account_status = 'active', unfrozen_at = NOW(), unfrozen_by = $2
            WHERE id = $1
            RETURNING id, account_status, frozen_at, freeze_reason, unfrozen_at`,
          [targetId, req.user.userId]
        );

    await client.query("COMMIT");

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "user",
      targetId,
      action: freeze ? "account.frozen" : "account.unfrozen",
      /*
       * 稽核必須能回答：誰、何時、對誰、做了什麼、**標準化原因代碼**、補充說明。
       * `reason` 沿用既有欄位名（人類可讀），新增 `reasonCode` / `note` 提供機器可讀。
       * **不寫任何法律判定** —— 這是營運處置紀錄，不是法律結論。
       */
      meta: freeze
        ? {
            reason: freezeInput.reasonText,
            reasonCode: freezeInput.reasonCode,
            note: freezeInput.note,
          }
        : {},
    });

    return res.json({ user: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("admin set account status failed:", err);
    return res.status(500).json({ message: "server error" });
  } finally {
    client.release();
  }
}

/**
 * GET /admin/users/:id/account-status —— 帳號狀態與凍結稽核脈絡（`OPS-02`）。
 *
 * ## 為什麼是新端點，而不是「使用者管理 API」
 *
 * Admin UI 需要知道「這個帳號現在是不是凍結、上次為什麼被凍結」才畫得出
 * 正確的操作面板。但 `IA-07` 已刻意判定平台**還不做**使用者管理模組，
 * 因此這裡只開**凍結面板真正需要的欄位**，不做 list、不做搜尋、
 * 不吐 email 以外的任何個資，也不新增 schema。
 *
 * `currentReasonCode` 取自最近一筆 `account.frozen` 稽核紀錄的 meta ——
 * 那是「當下做了什麼決定」的事實來源。**排序用 `created_at`，不用 `id`**
 * （`CLAUDE.md` §4.4：`activity_logs.id` 是 identity 不是 time）。
 * 本 taxonomy 上線前的凍結沒有 code，這裡就回 `null` ——
 * **不假裝歷史自由文字已經有分類**。
 */
router.get("/users/:id/account-status", async (req, res) => {
  try {
    const targetId = String(req.params.id);
    const { rows } = await db.query(
      `SELECT id, email, role, account_status,
              frozen_at, frozen_by, freeze_reason, unfrozen_at, unfrozen_by
         FROM users WHERE id = $1`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "user not found" });
    const user = rows[0];

    let currentReasonCode = null;
    let currentNote = null;
    if (user.account_status === "frozen") {
      const log = await db.query(
        `SELECT meta FROM activity_logs
          WHERE target_type = 'user' AND target_id = $1 AND action = 'account.frozen'
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [targetId]
      );
      const meta = log.rows[0]?.meta;
      const parsed = typeof meta === "string" ? JSON.parse(meta) : meta;
      currentReasonCode = parsed?.reasonCode ?? null;
      currentNote = parsed?.note ?? null;
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        accountStatus: user.account_status,
        frozenAt: user.frozen_at,
        frozenBy: user.frozen_by,
        freezeReason: user.freeze_reason,
        unfrozenAt: user.unfrozen_at,
        unfrozenBy: user.unfrozen_by,
        currentReasonCode,
        currentNote,
      },
      // UI 的選項一律由 backend 提供，避免前後端各維護一份 taxonomy。
      reasonOptions: FREEZE_REASONS.map((code) => ({ code, label: FREEZE_REASON_LABEL[code] })),
      // 前端據此 disable 不合法操作；**backend 仍會各自再擋一次**。
      canFreeze: user.role !== "admin" && user.id !== req.user.userId,
    });
  } catch (err) {
    console.error("admin read account status failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** POST /admin/users/:id/freeze  —— body: { reasonCode, note? }（`OPS-02`） */
router.post("/users/:id/freeze", (req, res) => setAccountStatus(req, res, { freeze: true }));

/** POST /admin/users/:id/unfreeze */
router.post("/users/:id/unfreeze", (req, res) => setAccountStatus(req, res, { freeze: false }));

// ---------------------------------------------------------------------------
// 教材檔案 legal hold（P1-09 Gate 14 / Wave 2 #4）
// ---------------------------------------------------------------------------
//
// 只有三個動作：set / release / read。**沒有 orchestration** ——
// 本輪不假設任何 refund case 或 report case 一定要 hold，那是尚未做出的判斷。
//
// 授權：Admin only（本 router 已由 index.js 掛上 requireAuth + requireRole("admin")）。
// hold 是保存義務的宣告，不得由創作者或買家設定或解除。

/** POST /admin/material-files/:id/legal-hold  —— body: { reason } */
router.post("/material-files/:id/legal-hold", async (req, res) => {
  try {
    const result = await materialFileRetention.setLegalHold({
      fileId: req.params.id,
      reason: req.body?.reason,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const status = result.code === "file_not_found" ? 404 : 400;
      return res.status(status).json({ message: result.message, code: result.code });
    }
    return res.json({ file: result.file });
  } catch (err) {
    console.error("admin set legal hold failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** POST /admin/material-files/:id/release-legal-hold  —— body: { reason } */
router.post("/material-files/:id/release-legal-hold", async (req, res) => {
  try {
    const result = await materialFileRetention.releaseLegalHold({
      fileId: req.params.id,
      reason: req.body?.reason,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const status = result.code === "file_not_found" ? 404 : result.code === "not_on_hold" ? 409 : 400;
      return res.status(status).json({ message: result.message, code: result.code });
    }
    return res.json({ file: result.file });
  } catch (err) {
    console.error("admin release legal hold failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /admin/material-files/:id/retention
 *
 * 回傳 hold 現況、hold 歷程，以及**刪除資格判斷的完整理由**。
 * 這是 Wave 2 #4 的稽核入口：任何人都能直接看到「這個檔案為什麼刪不掉」，
 * 不需要去讀 cleanup 腳本的輸出。
 */
router.get("/material-files/:id/retention", async (req, res) => {
  try {
    const file = await materialFileRetention.getLegalHold(req.params.id);
    if (!file) return res.status(404).json({ message: "material file not found" });
    const verdict = await materialFileRetention.canPhysicallyDeleteMaterialFile(req.params.id);
    const history = await materialFileRetention.listHoldHistory(req.params.id);
    return res.json({
      file,
      deletable: verdict.deletable,
      reasons: verdict.reasons,
      checks: verdict.checks,
      history,
    });
  } catch (err) {
    console.error("admin read retention failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// ---------------------------------------------------------------------------
// 消費申訴（P1-09 Gate 3）
// ---------------------------------------------------------------------------
//
// 消保法 §43 II：申訴之日起**十五日內**妥適處理。期限由 `utils/complaintSla.js`
// 單一計算，逾期偵測用 DB 條件（不是把全表撈出來過濾）。
//
// **與 `/admin/reports`（內容檢舉）、`/admin/remedy-cases`（退款補救）三者分離。**
// 處理申訴**不會**自動建立 remedy case、不改訂單狀態、不動授權、不退款。
// 需要退款時由人另建 remedy case，再用 `link-remedy-case` 寫入關聯。

/** GET /admin/complaints —— 依法定期限由近而遠排序；`?overdue=1` 只看已逾期。 */
router.get("/complaints", async (req, res) => {
  try {
    const items = await complaints.listComplaints({
      status: req.query.status || null,
      buyerId: req.query.buyerId || null,
      overdueOnly: req.query.overdue === "1" || req.query.overdue === "true",
      limit: req.query.limit,
    });
    return res.json({ items });
  } catch (err) {
    console.error("admin list complaints failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/complaints/:id —— 詳情 ＋ 完整歷程（含內部註記）＋ 證據清單。 */
router.get("/complaints/:id", async (req, res) => {
  try {
    const complaint = await complaints.getComplaint(req.params.id);
    if (!complaint) return res.status(404).json({ message: "complaint not found" });
    const [events, evidence] = await Promise.all([
      complaints.listEvents(req.params.id),
      complaints.listEvidence(req.params.id),
    ]);
    return res.json({ complaint, events, evidence });
  } catch (err) {
    console.error("admin read complaint failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/complaints/:id/transition
 * body: { status, message, resolutionSummary?, visibleToBuyer? }
 *
 * `message` 必填 —— 「妥適處理」必須留得下內容。
 * `resolved` / `closed` 另外必填 `resolutionSummary`。
 */
router.post("/complaints/:id/transition", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await complaints.transition({
      complaintId: String(req.params.id),
      toStatus: b.status,
      message: b.message,
      resolutionSummary: b.resolutionSummary ?? null,
      visibleToBuyer: b.visibleToBuyer !== false,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const notFound = result.code === "complaint_not_found";
      const conflict = result.code === "already_in_state" || result.code === "invalid_transition";
      return res.status(notFound ? 404 : conflict ? 409 : 400).json({
        code: result.code,
        message: result.message,
        from: result.from,
        allowed: result.allowed,
      });
    }
    return res.json({ complaintId: result.complaint.id, from: result.from, to: result.to, complaint: result.complaint });
  } catch (err) {
    console.error("admin transition complaint failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/complaints/:id/link-remedy-case  —— body: { remedyCaseId }
 *
 * **只寫關聯，不建立、不退款。** remedy case 必須先由人透過
 * `POST /orders/:orderId/remedy-cases` 建立。
 */
/**
 * GET /admin/complaints/:id/evidence/:evidenceId/file —— Admin 讀取申訴證據。
 *
 * 授權：本 router 已由 index.js 掛上 `requireAuth` + `requireRole("admin")`，
 * 因此非 Admin 連 handler 都進不來（買家打這條路由得到 403）。
 * 資源綁定仍走與買家完全相同的 `resolveEvidenceForAccess` —— 它會再驗一次
 * `evidence.complaint_id === :id`，Admin 身分不會豁免 IDOR 綁定。
 *
 * `?download=1` → `attachment` ＋ 稽核；inline 預覽不寫 log（同付款憑證 convention）。
 */
router.get("/complaints/:id/evidence/:evidenceId/file", async (req, res) => {
  const complaintId = String(req.params.id);
  const evidenceId = String(req.params.evidenceId);
  try {
    const resolved = await complaints.resolveEvidenceForAccess({
      complaintId,
      evidenceId,
      user: req.user,
    });
    if (!resolved.ok) {
      return res
        .status(complaints.statusForEvidenceCode(resolved.code))
        .json({ error: resolved.code, message: resolved.message });
    }

    const opened = await complaints.openEvidenceForDelivery(resolved.evidence);
    if (!opened.ok) {
      return res
        .status(complaints.statusForEvidenceCode(opened.code))
        .json({ error: opened.code, message: opened.message });
    }

    const asDownload = ["1", "true", "yes"].includes(
      String(req.query.download || "").toLowerCase()
    );
    if (asDownload) {
      await writeActivityLog({
        actorId: req.user.userId,
        actorRole: req.user.role,
        targetType: "consumer_complaint",
        targetId: complaintId,
        action: "complaint_evidence_downloaded",
        meta: { evidenceId, originalFilename: resolved.evidence.original_filename },
      });
    }

    return sendFileDownload(res, {
      file: {
        mime_type: resolved.evidence.mime_type,
        original_filename: resolved.evidence.original_filename,
      },
      stream: opened.stream,
      sizeBytes: opened.sizeBytes,
      disposition: asDownload ? "attachment" : "inline",
    });
  } catch (err) {
    console.error("admin complaint evidence delivery failed:", err);
    if (!res.headersSent) return res.status(500).json({ message: "server error" });
  }
});

router.post("/complaints/:id/link-remedy-case", async (req, res) => {
  try {
    const result = await complaints.linkRemedyCase({
      complaintId: String(req.params.id),
      remedyCaseId: req.body?.remedyCaseId,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const notFound = result.code === "complaint_not_found" || result.code === "remedy_case_not_found";
      return res.status(notFound ? 404 : 400).json({ code: result.code, message: result.message });
    }
    return res.json({ complaint: result.complaint });
  } catch (err) {
    console.error("admin link remedy case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
