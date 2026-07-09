const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const { sendPaymentApprovedEmail, sendPaymentRejectedEmail } = require("../services/emailService");
const reportRepository = require("../repositories/report.repository");
const reportAdminService = require("../services/reportAdmin.service");
const { parseOptionalReportStatusQuery } = require("../utils/reportStatusQuery");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/materials", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, teacher_id, status, created_at, updated_at, material_features
       FROM materials
       ORDER BY created_at DESC`
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("admin list materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const base = `SELECT id, user_id, status, payment_mode, total_amount, total_price,
        promo_code, discount_amount, invoice_type, invoice_carrier,
        paid_at, cancelled_at, created_at, updated_at
       FROM orders`;
    const result = status
      ? await db.query(`${base} WHERE status = $1 ORDER BY created_at DESC`, [status])
      : await db.query(`${base} ORDER BY created_at DESC`);
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("admin list orders failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/dashboard/summary", async (_req, res) => {
  try {
    const [materialsRes, ordersRes, reviewsRes, usersRes, pendingProofsRes, pendingReportsRes] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS c FROM materials`),
      db.query(`SELECT COUNT(*)::int AS c, COALESCE(SUM(COALESCE(total_amount, total_price, 0)), 0)::bigint AS revenue FROM orders`),
      db.query(`SELECT COUNT(*)::int AS c FROM review`),
      db.query(`SELECT COUNT(*)::int AS c FROM users`),
      db.query(`SELECT COUNT(*)::int AS c FROM manual_payment_proofs WHERE review_status = 'pending'`),
      db.query(`SELECT COUNT(*)::int AS c FROM reports WHERE status = 'pending'`),
    ]);
    const currentWeekRes = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM review
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    );
    const previousWeekRes = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM review
       WHERE created_at >= NOW() - INTERVAL '14 days'
         AND created_at < NOW() - INTERVAL '7 days'`
    );
    const currentWeek = Number(currentWeekRes.rows[0]?.c || 0);
    const previousWeek = Number(previousWeekRes.rows[0]?.c || 0);
    const wowReviewDeltaPercent = previousWeek > 0 ? Math.round(((currentWeek - previousWeek) / previousWeek) * 100) : (currentWeek > 0 ? 100 : 0);

    return res.json({
      materialsCount: Number(materialsRes.rows[0]?.c || 0),
      ordersCount: Number(ordersRes.rows[0]?.c || 0),
      revenueAmount: Number(ordersRes.rows[0]?.revenue || 0),
      reviewsCount: Number(reviewsRes.rows[0]?.c || 0),
      usersCount: Number(usersRes.rows[0]?.c || 0),
      pendingProofsCount: Number(pendingProofsRes.rows[0]?.c || 0),
      pendingReportsCount: Number(pendingReportsRes.rows[0]?.c || 0),
      wowReviewDeltaPercent,
    });
  } catch (err) {
    console.error("admin dashboard summary failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

function parsePaymentProofStatus(raw) {
  if (raw == null) return null;
  const status = String(raw).trim();
  if (!status) return null;
  const allowed = new Set(["pending", "approved", "rejected"]);
  return allowed.has(status) ? status : "__INVALID__";
}

function parsePagination(query) {
  let page = Number.parseInt(String(query.page ?? "1"), 10);
  let limit = Number.parseInt(String(query.limit ?? "20"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  return { page, limit, offset: (page - 1) * limit };
}

/** GET /admin/payment-proofs?status=pending|approved|rejected&page=1&limit=20 */
router.get("/payment-proofs", async (req, res) => {
  try {
    const status = parsePaymentProofStatus(req.query?.status);
    if (status === "__INVALID__") {
      return res.status(400).json({ message: "status must be one of pending|approved|rejected" });
    }

    const { page, limit, offset } = parsePagination(req.query || {});
    const where = [];
    const params = [];
    let idx = 1;
    if (status) {
      where.push(`mpp.review_status = $${idx}`);
      params.push(status);
      idx += 1;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await db.query(
      `SELECT COUNT(*)::bigint AS c
       FROM manual_payment_proofs mpp
       ${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0].c);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const listResult = await db.query(
      `SELECT
         mpp.id,
         mpp.order_id,
         mpp.proof_url,
         mpp.proof_mime_type,
         mpp.proof_size_bytes,
         mpp.original_filename,
         mpp.review_status,
         mpp.uploaded_at,
         mpp.created_at,
         mpp.reviewed_at,
         mpp.reviewed_by,
         mpp.note,
         o.user_id,
         o.status AS order_status
       FROM manual_payment_proofs mpp
       JOIN orders o ON o.id = mpp.order_id
       ${whereSql}
       ORDER BY COALESCE(mpp.uploaded_at, mpp.created_at) DESC, mpp.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const items = listResult.rows.map((row) => ({
      id: String(row.id),
      order_id: row.order_id,
      user_id: row.user_id,
      order_status: row.order_status,
      proof_url: row.proof_url,
      proof_mime_type: row.proof_mime_type,
      proof_size_bytes: row.proof_size_bytes,
      original_filename: row.original_filename,
      review_status: row.review_status,
      uploaded_at: row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : row.uploaded_at,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      reviewed_at: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at,
      reviewed_by: row.reviewed_by,
      note: row.note,
    }));

    return res.json({
      items,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    console.error("admin list payment proofs failed:", err);
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

/** POST /admin/payment-proofs/:id/reject — 訂單狀態不變 */
router.post("/payment-proofs/:id/reject", async (req, res) => {
  const proofId = String(req.params.id);
  const { note } = req.body || {};
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
           note = $3
       WHERE id = $1
       RETURNING id, review_status, note`,
      [proofId, req.user.userId, note != null ? String(note).trim() : ""]
    );

    await client.query("COMMIT");

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "order",
      targetId: proofResult.rows[0].order_id,
      action: "payment_proof.rejected",
      meta: { proofId },
    });
    void sendPaymentRejectedEmail(proofResult.rows[0].order_id, note != null ? String(note).trim() : "");

    const p = updated.rows[0];
    return res.json({
      proof: {
        id: p.id,
        review_status: p.review_status,
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
