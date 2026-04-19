const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/materials", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, teacher_id, status, created_at, updated_at
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
  if (!note || String(note).trim() === "") {
    return res.status(400).json({ message: "note is required" });
  }
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
      [proofId, req.user.userId, String(note).trim()]
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

router.get("/logs", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, actor_id, actor_role, target_type, target_id, action, meta, created_at
       FROM activity_logs ORDER BY created_at DESC LIMIT 200`
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("admin list logs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/reports", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, reporter_id, material_id, reason, status, created_at, reviewed_at, reviewed_by
       FROM reports ORDER BY created_at DESC`
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("admin list reports failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** 依教材查檢舉（與 GET /materials/:id/reports 相同資料，掛在 /admin 以避免部分環境路由未載入）。 */
router.get("/materials/:materialId/reports", async (req, res) => {
  try {
    const materialId = String(req.params.materialId);
    const result = await db.query(
      `SELECT id, reason, status, created_at, reviewed_at
       FROM reports
       WHERE material_id = $1
       ORDER BY created_at DESC`,
      [materialId]
    );
    return res.json(result.rows);
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
    const { status } = req.body || {};
    if (status !== "reviewed") {
      return res.status(400).json({ message: "only status \"reviewed\" is allowed" });
    }

    const updated = await db.query(
      `UPDATE reports
       SET status = 'reviewed',
           reviewed_at = NOW(),
           reviewed_by = $2
       WHERE id = $1 AND status = 'pending'
       RETURNING id, material_id, reporter_id, reason, status, created_at, reviewed_at, reviewed_by`,
      [reportId, req.user.userId]
    );

    if (updated.rows.length === 0) {
      const existing = await db.query(`SELECT id, status FROM reports WHERE id = $1 LIMIT 1`, [reportId]);
      if (existing.rows.length === 0) return res.status(404).json({ message: "report not found" });
      return res.status(409).json({ message: "report already reviewed" });
    }

    const row = updated.rows[0];
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "report",
      targetId: row.id,
      action: "report_reviewed",
      meta: { material_id: row.material_id },
    });

    return res.json(row);
  } catch (err) {
    console.error("patch report failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
