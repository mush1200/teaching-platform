const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middlewares/auth");
const db = require("../config/db");
const { writeActivityLog } = require("../utils/activityLog");

router.get("/:materialId", requireAuth, async (req, res) => {
  try {
    const materialId = String(req.params.materialId);
    const result = await db.query(
      `SELECT o.id AS order_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
         AND o.status = 'approved'
         AND oi.material_id = $2
       LIMIT 1`,
      [req.user.userId, materialId]
    );

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "download.attempted",
      meta: {},
    });

    if (result.rows.length === 0) {
      await writeActivityLog({
        actorId: req.user.userId,
        actorRole: req.user.role,
        targetType: "material",
        targetId: materialId,
        action: "download.denied",
        meta: {},
      });
      return res.status(403).json({ message: "No download permission" });
    }

    const signedUrl = `https://download.local/materials/${encodeURIComponent(materialId)}?token=mock-${Date.now()}`;
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "download.allowed",
      meta: { orderId: result.rows[0].order_id },
    });
    return res.json({ materialId, signedUrl, expiresInSeconds: 300 });
  } catch (err) {
    console.error("download permission check failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
