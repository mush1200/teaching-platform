const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middlewares/auth");
const reviewService = require("../services/review.service");

const router = express.Router();

/** GET /me/materials — 已購買且訂單已核准之教材（我的教材庫） */
router.get("/materials", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         oi.material_id,
         MAX(m.title) AS title,
         MAX(m.cover_image_url) AS cover_image_url,
         MAX(m.updated_at) AS material_updated_at,
         MIN(o.created_at) AS purchased_at,
         MAX(NULLIF(TRIM(SPLIT_PART(COALESCE(u.email, ''), '@', 1)), '')) AS author_name
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id AND o.status = 'approved'
       INNER JOIN materials m ON m.id = oi.material_id
       LEFT JOIN users u ON u.id = m.teacher_id
       WHERE o.user_id = $1
       GROUP BY oi.material_id
       ORDER BY MAX(o.created_at) DESC`,
      [req.user.userId]
    );
    const items = result.rows.map((row) => ({
      materialId: row.material_id,
      title: row.title,
      coverImageUrl: row.cover_image_url,
      materialUpdatedAt: row.material_updated_at,
      purchasedAt: row.purchased_at,
      authorName: row.author_name || null,
    }));
    return res.json({ items });
  } catch (err) {
    console.error("list my materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /me/orders — alias of /orders/my */
router.get("/orders", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.id, o.user_id, o.status, o.payment_mode, o.total_amount, o.total_price,
              o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier,
              o.paid_at, o.cancelled_at, o.created_at, o.updated_at,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'pending'),
                0
              ) AS payment_proof_pending_review_count,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id),
                0
              ) AS payment_proof_uploaded_count,
              (SELECT m.review_status
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id
               ORDER BY COALESCE(m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_latest_status,
              (SELECT COALESCE(m.uploaded_at, m.created_at)
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id
               ORDER BY COALESCE(m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_latest_uploaded_at,
              CASE
                WHEN o.status = 'approved' THEN 'approved'
                WHEN EXISTS (
                  SELECT 1 FROM manual_payment_proofs m
                  WHERE m.order_id = o.id AND m.review_status = 'rejected'
                ) THEN 'rejected'
                WHEN EXISTS (
                  SELECT 1 FROM manual_payment_proofs m
                  WHERE m.order_id = o.id AND m.review_status = 'pending'
                ) THEN 'reviewing'
                WHEN EXISTS (
                  SELECT 1 FROM manual_payment_proofs m
                  WHERE m.order_id = o.id
                ) THEN 'proof_uploaded'
                ELSE 'pending'
              END AS order_progress_state
       FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("list /me/orders failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /me/orders/:orderId — alias of /orders/:id for owner */
router.get("/orders/:orderId", requireAuth, async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const orderResult = await db.query(
      `SELECT o.id, o.user_id, o.status, o.payment_mode, o.total_amount, o.total_price,
              o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier,
              o.paid_at, o.cancelled_at, o.created_at, o.updated_at,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'pending'),
                0
              ) AS payment_proof_pending_review_count,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id),
                0
              ) AS payment_proof_uploaded_count,
              (SELECT m.review_status
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id
               ORDER BY COALESCE(m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_latest_status,
              (SELECT m.note
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id AND m.review_status = 'rejected'
               ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_rejected_note,
              (SELECT COALESCE(m.uploaded_at, m.created_at)
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id
               ORDER BY COALESCE(m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_latest_uploaded_at,
              (SELECT m.reviewed_at
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id
               ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_latest_reviewed_at,
              CASE
                WHEN o.status = 'approved' THEN 'approved'
                WHEN EXISTS (
                  SELECT 1 FROM manual_payment_proofs m
                  WHERE m.order_id = o.id AND m.review_status = 'rejected'
                ) THEN 'rejected'
                WHEN EXISTS (
                  SELECT 1 FROM manual_payment_proofs m
                  WHERE m.order_id = o.id AND m.review_status = 'pending'
                ) THEN 'reviewing'
                WHEN EXISTS (
                  SELECT 1 FROM manual_payment_proofs m
                  WHERE m.order_id = o.id
                ) THEN 'proof_uploaded'
                ELSE 'pending'
              END AS order_progress_state
       FROM orders o
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ message: "order not found" });
    if (String(orderResult.rows[0].user_id) !== String(req.user.userId)) {
      return res.status(403).json({ message: "forbidden" });
    }
    const itemsResult = await db.query(
      `SELECT id, order_id, material_id, title_snapshot AS material_title,
              quantity, COALESCE(price_snapshot, 0)::int AS unit_price,
              COALESCE(subtotal, 0)::int AS subtotal
       FROM order_items
       WHERE order_id = $1
       ORDER BY created_at ASC, id ASC`,
      [orderId]
    );
    return res.json({ order: orderResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    console.error("get /me/orders/:orderId failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/reviews", requireAuth, async (req, res) => {
  try {
    const items = await reviewService.listMyReviews(req.user.userId);
    return res.json(items);
  } catch (err) {
    console.error("list my reviews failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/favorites", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.id, f.material_id, f.created_at,
              m.title, m.description, m.price, m.category, m.age_range, m.status, m.teacher_id,
              m.teaching_objective, m.teaching_methods, m.usage_duration, m.activity_steps,
              m.extension_value, m.short_description, m.material_features, m.cover_image_url,
              m.demo_video_url, m.created_at AS material_created_at
       FROM user_favorites f
       INNER JOIN materials m ON m.id = f.material_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("list favorites failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.post("/favorites/:materialId", requireAuth, async (req, res) => {
  try {
    const materialId = String(req.params.materialId);
    const materialRes = await db.query(`SELECT id, status FROM materials WHERE id = $1 LIMIT 1`, [materialId]);
    if (materialRes.rows.length === 0) return res.status(404).json({ message: "material not found" });
    if (materialRes.rows[0].status !== "published") return res.status(400).json({ message: "only published material can be favorited" });
    const result = await db.query(
      `INSERT INTO user_favorites(user_id, material_id)
       VALUES($1, $2)
       ON CONFLICT (user_id, material_id) DO NOTHING
       RETURNING id, user_id, material_id, created_at`,
      [req.user.userId, materialId]
    );
    if (result.rows.length > 0) return res.status(201).json(result.rows[0]);
    return res.json({ message: "already favorited" });
  } catch (err) {
    console.error("add favorite failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.delete("/favorites/:materialId", requireAuth, async (req, res) => {
  try {
    const materialId = String(req.params.materialId);
    await db.query(`DELETE FROM user_favorites WHERE user_id = $1 AND material_id = $2`, [req.user.userId, materialId]);
    return res.json({ message: "removed" });
  } catch (err) {
    console.error("remove favorite failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
