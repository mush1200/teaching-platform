const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middlewares/auth");
const reviewService = require("../services/review.service");
const buyerOrders = require("../services/buyerOrders.service");

const router = express.Router();

/**
 * GET /me/materials — 已購買且訂單已核准之教材（我的教材庫）
 *
 * **列表保留「曾經買過」的事實，但明確標示「現在是否可用」**（P1-09 Gate 14）。
 *
 * `entitlementStatus` 為該買家對這份教材目前**最有利**的授權狀態
 * （同一份教材可能有多筆訂單品項；只要有一筆 `active` 就代表現在可用）。
 *
 * **刻意不過濾掉非 active 的教材** —— 授權被暫停不代表購買事實消失，
 * 讓它從列表無聲蒸發會讓買家失去「我買過這個」的可見性。
 * 真正的門在下載授權（`materialFile.service.hasPurchaseEntitlement`），
 * 那裡已經會擋下非 `active` 的存取。
 *
 * UI 如何呈現非 active 的項目（灰階／標示／隱藏）是產品決策，屬後續 wave；
 * 後端先誠實提供狀態。
 */
router.get("/materials", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         oi.material_id,
         MAX(m.title) AS title,
         MAX(m.cover_image_url) AS cover_image_url,
         MAX(m.updated_at) AS material_updated_at,
         MIN(o.created_at) AS purchased_at,
         MAX(NULLIF(TRIM(SPLIT_PART(COALESCE(u.email, ''), '@', 1)), '')) AS author_name,
         BOOL_OR(oi.entitlement_status = 'active') AS has_active_entitlement
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
      // 目前是否仍可取得平台交付。false 代表已被暫停或撤銷 —— 下載會被拒絕。
      entitlementActive: row.has_active_entitlement === true,
    }));
    return res.json({ items });
  } catch (err) {
    console.error("list my materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /me/orders — alias of /orders/my。
 *
 * `order_progress_state`（含 latest-proof 語意）由 `services/buyerOrders.service.js`
 * 定義；detail 走同一份 SQL，列表與詳情不會再各自演化出不同答案。
 */
router.get("/orders", requireAuth, async (req, res) => {
  try {
    const items = await buyerOrders.listBuyerOrders(req.user.userId);
    return res.json({ items });
  } catch (err) {
    console.error("list /me/orders failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /me/orders/:orderId — alias of /orders/:id for owner */
router.get("/orders/:orderId", requireAuth, async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const order = await buyerOrders.getBuyerOrder(orderId);
    if (!order) return res.status(404).json({ message: "order not found" });
    if (String(order.user_id) !== String(req.user.userId)) {
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
    return res.json({ order, items: itemsResult.rows });
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
