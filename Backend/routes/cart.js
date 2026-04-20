const express = require("express");
const router = express.Router();
const db = require("../config/db");

const { requireAuth } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");

async function listCart(req, res) {
  try {
    const result = await db.query(
      `SELECT c.id, c.user_id, c.material_id, c.quantity, c.created_at, c.updated_at,
              m.title, m.price, m.status
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

    const material = await db.query(`SELECT id, status FROM materials WHERE id = $1 LIMIT 1`, [String(materialId)]);
    if (material.rows.length === 0) return res.status(404).json({ message: "material not found" });
    if (material.rows[0].status !== "published") {
      return res.status(400).json({ message: "only published material can be added to cart" });
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
