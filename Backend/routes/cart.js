const express = require("express");
const router = express.Router();
const db = require("../config/db");

const { requireAuth } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const { isNotDeliverable, MATERIAL_NOT_DELIVERABLE_MESSAGE } = require("../utils/materialDeliverability");

async function listCart(req, res) {
  try {
    const result = await db.query(
      `SELECT c.id, c.user_id, c.material_id, c.quantity, c.created_at, c.updated_at,
              m.title, m.price, m.status, m.age_range, m.cover_image_url, m.material_features
       FROM cart_items c
       JOIN materials m ON m.id = c.material_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("list cart failed:", err);
    return res.status(500).json({ message: "server error" });
  }
}

router.get("/", requireAuth, listCart);

router.post("/items", requireAuth, async (req, res) => {
  try {
    const { materialId, quantity } = req.body || {};
    const qty = Number(quantity ?? 1);
    if (!materialId || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ message: "materialId and positive integer quantity are required" });
    }

    const material = await db.query(`SELECT id, status, approved_file_id FROM materials WHERE id = $1 LIMIT 1`, [
      String(materialId),
    ]);
    if (material.rows.length === 0) return res.status(404).json({ message: "material not found" });
    if (material.rows[0].status !== "published") {
      return res.status(400).json({ message: "only published material can be added to cart" });
    }
    /*
     * 可交付性防線 #2（見 `utils/materialDeliverability.js`）。
     * `published` 不等於「有檔案可下載」—— 沒有 `approved_file_id` 的教材若讓它進購物車，
     * 買家會一路付完款才在下載時失敗。這裡是買家最早撞到的地方，所以在這裡就講清楚。
     */
    if (isNotDeliverable(material.rows[0])) {
      return res.status(409).json({ message: MATERIAL_NOT_DELIVERABLE_MESSAGE });
    }

    const existed = await db.query(
      `SELECT id FROM cart_items WHERE user_id = $1 AND material_id = $2 LIMIT 1`,
      [req.user.userId, String(materialId)]
    );
    if (existed.rows.length > 0) {
      const updated = await db.query(
        `UPDATE cart_items
         SET quantity = $3, updated_at = NOW()
         WHERE user_id = $1 AND material_id = $2
         RETURNING *`,
        [req.user.userId, String(materialId), qty]
      );
      await writeActivityLog({
        actorId: req.user.userId,
        actorRole: req.user.role,
        targetType: "material",
        targetId: String(materialId),
        action: "cart.added",
        meta: { quantity: qty, upserted: true },
      });
      return res.json(updated.rows[0]);
    }

    const created = await db.query(
      `INSERT INTO cart_items(user_id, material_id, quantity)
       VALUES($1, $2, $3)
       RETURNING *`,
      [req.user.userId, String(materialId), qty]
    );
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "cart.added",
      meta: { quantity: qty },
    });
    return res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("add cart item failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.patch("/items/:id", requireAuth, async (req, res) => {
  try {
    const qty = Number(req.body?.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ message: "quantity must be a positive integer" });
    }
    const updated = await db.query(
      `UPDATE cart_items
       SET quantity = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [String(req.params.id), req.user.userId, qty]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "cart item not found" });
    }
    return res.json(updated.rows[0]);
  } catch (err) {
    console.error("update cart item failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.delete("/items/:id", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM cart_items
       WHERE id = $1 AND user_id = $2
       RETURNING id, material_id`,
      [String(req.params.id), req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "cart item not found" });
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: result.rows[0].material_id,
      action: "cart.removed",
      meta: { cartItemId: result.rows[0].id },
    });
    return res.json({ message: "removed" });
  } catch (err) {
    console.error("remove cart item failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
