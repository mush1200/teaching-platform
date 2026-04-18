const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");

const router = express.Router();

function newId() {
  return `rep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const { materialId, reason } = req.body || {};
    if (!materialId || !reason) return res.status(400).json({ message: "materialId and reason are required" });
    const material = await db.query(`SELECT id FROM materials WHERE id = $1 LIMIT 1`, [String(materialId)]);
    if (material.rows.length === 0) return res.status(404).json({ message: "material not found" });

    const created = await db.query(
      `INSERT INTO reports(id, user_id, material_id, reason)
       VALUES($1, $2, $3, $4)
       RETURNING *`,
      [newId(), req.user.userId, String(materialId), String(reason)]
    );

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "report.created",
      meta: { reason: String(reason) },
    });
    return res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("create report failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
