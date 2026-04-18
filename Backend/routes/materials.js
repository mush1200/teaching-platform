const express = require("express");
const db = require("../config/db");
const { requireAuth, optionalAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const reviewService = require("../services/review.service");

const router = express.Router();

function newId() {
  return `mat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const user = req.user || null;
    const canSeeAll = user?.role === "admin";
    const canSeeOwn = user?.role === "teacher";
    const result = await db.query(
      `SELECT id, title, description, price, created_at, updated_at, category, age_range, teacher_id, status, file_key, ip_declaration_accepted, ip_declaration_at
       FROM materials
       WHERE ($1::boolean = true)
          OR ($2::boolean = true AND teacher_id = $3)
          OR status = 'published'
       ORDER BY created_at DESC`,
      [canSeeAll, canSeeOwn, user?.userId || null]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("list materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id/reviews", async (req, res) => {
  try {
    const materialId = String(req.params.id);
    const items = await reviewService.listMaterialReviews(materialId);
    return res.json(items);
  } catch (err) {
    console.error("list material reviews failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, description, price, created_at, updated_at, category, age_range, teacher_id, status, file_key, ip_declaration_accepted, ip_declaration_at
       FROM materials WHERE id = $1 LIMIT 1`,
      [String(req.params.id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "material not found" });
    const row = result.rows[0];
    const user = req.user || null;
    const allowed =
      row.status === "published" ||
      user?.role === "admin" ||
      (user?.role === "teacher" && String(row.teacher_id) === String(user.userId));
    if (!allowed) return res.status(403).json({ message: "forbidden" });
    return res.json(row);
  } catch (err) {
    console.error("get material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.post("/", requireAuth, requireRole("teacher"), async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      ageRange,
      fileKey,
      ipDeclarationAccepted,
    } = req.body || {};
    if (!title || price === undefined || !fileKey) {
      return res.status(400).json({ message: "title, price, fileKey are required" });
    }
    if (ipDeclarationAccepted !== true) {
      return res.status(400).json({ message: "ipDeclarationAccepted must be true" });
    }

    const id = newId();
    const created = await db.query(
      `INSERT INTO materials(
         id, title, description, price, category, age_range, teacher_id, status, file_key,
         ip_declaration_accepted, ip_declaration_at
       ) VALUES($1, $2, $3, $4, $5, $6, $7, 'pending_review', $8, true, NOW())
       RETURNING *`,
      [id, title, description || null, Number(price), category || null, ageRange || null, req.user.userId, fileKey]
    );

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: id,
      action: "material.created",
      meta: { status: "pending_review" },
    });
    return res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("create material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const beforeResult = await db.query(`SELECT * FROM materials WHERE id = $1 LIMIT 1`, [id]);
    if (beforeResult.rows.length === 0) return res.status(404).json({ message: "material not found" });
    const before = beforeResult.rows[0];

    const isOwnerTeacher = req.user.role === "teacher" && String(before.teacher_id) === String(req.user.userId);
    const isAdmin = req.user.role === "admin";
    if (!isOwnerTeacher && !isAdmin) return res.status(403).json({ message: "forbidden" });

    const body = req.body || {};
    if (!isAdmin && Object.prototype.hasOwnProperty.call(body, "status")) {
      return res.status(403).json({ message: "only admin can change material status" });
    }

    const nextStatus = isAdmin ? (body.status !== undefined && body.status !== null ? String(body.status) : before.status) : before.status;
    const allowedStatus = new Set(["pending_review", "published", "unpublished"]);
    if (!allowedStatus.has(nextStatus)) return res.status(400).json({ message: "invalid status" });

    const updated = await db.query(
      `UPDATE materials
       SET title = COALESCE($2, title),
           description = COALESCE($3, description),
           price = COALESCE($4, price),
           category = COALESCE($5, category),
           age_range = COALESCE($6, age_range),
           file_key = COALESCE($7, file_key),
           status = $8,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        req.body?.title ?? null,
        req.body?.description ?? null,
        req.body?.price ?? null,
        req.body?.category ?? null,
        req.body?.ageRange ?? null,
        req.body?.fileKey ?? null,
        nextStatus,
      ]
    );
    const row = updated.rows[0];

    if (before.status !== row.status) {
      const action = row.status === "published" ? "material.published" : "material.unpublished";
      await writeActivityLog({
        actorId: req.user.userId,
        actorRole: req.user.role,
        targetType: "material",
        targetId: row.id,
        action,
        meta: { oldStatus: before.status, newStatus: row.status },
      });
    }

    return res.json(row);
  } catch (err) {
    console.error("update material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
