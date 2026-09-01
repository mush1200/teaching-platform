const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");

const router = express.Router();

function newId() {
  return `rep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 建立檢舉：status 固定為 pending（案件已建立，尚未被 Admin 接手；流程見 docs/mvp_rules.md §6）。 */
router.post("/", requireAuth, requireRole("parent"), async (req, res) => {
  try {
    const body = req.body || {};
    const materialId = body.material_id ?? body.materialId;
    const { reason } = body;

    if (
      materialId === undefined ||
      materialId === null ||
      String(materialId).trim() === "" ||
      reason === undefined ||
      reason === null ||
      String(reason).trim() === ""
    ) {
      return res.status(400).json({ message: "material_id and reason are required" });
    }

    const trimmedReason = String(reason).trim();

    const material = await db.query(`SELECT id FROM materials WHERE id = $1 LIMIT 1`, [String(materialId)]);
    if (material.rows.length === 0) return res.status(404).json({ message: "material not found" });

    const id = newId();
    const created = await db.query(
      `INSERT INTO reports(id, material_id, reporter_id, reason, status)
       VALUES($1, $2, $3, $4, 'pending')
       RETURNING id, material_id, reporter_id, reason, status, created_at`,
      [id, String(materialId), req.user.userId, trimmedReason]
    );

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: String(materialId),
      action: "report_created",
      meta: { reason: trimmedReason },
    });

    return res.status(201).json(created.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Already reported" });
    }
    console.error("create report failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
