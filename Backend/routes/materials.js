const express = require("express");
const db = require("../config/db");
const { requireAuth, optionalAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const reviewService = require("../services/review.service");
const reportRepository = require("../repositories/report.repository");
const { parseOptionalReportStatusQuery } = require("../utils/reportStatusQuery");

const router = express.Router();

function newId() {
  return `mat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeTeachingMethods(value) {
  if (!Array.isArray(value)) return null;
  const methods = value.map((v) => String(v || "").trim()).filter(Boolean);
  return methods.length > 0 ? methods : null;
}

function normalizeContents(value) {
  if (!Array.isArray(value)) return null;
  const items = [];
  for (const row of value) {
    const type = cleanText(row?.type);
    const name = cleanText(row?.name);
    const description = cleanText(row?.description);
    const rawCount = row?.count;
    const count = rawCount === undefined || rawCount === null || rawCount === "" ? null : Number(rawCount);
    items.push({ type, name, description, count });
  }
  return items;
}

function isValidUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeDetailImages(value) {
  if (!Array.isArray(value)) return null;
  const rows = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    const imageUrl = cleanText(typeof row === "string" ? row : row?.image_url ?? row?.imageUrl ?? row?.url);
    const altText = cleanText(typeof row === "string" ? null : row?.alt_text ?? row?.altText);
    const rawSort = typeof row === "string" ? i : row?.sort_order ?? row?.sortOrder ?? i;
    const sortOrder = Number.isFinite(Number(rawSort)) ? Number(rawSort) : i;
    rows.push({ image_url: imageUrl, alt_text: altText, sort_order: sortOrder });
  }
  return rows;
}

function validatePayload(body, { isCreate }) {
  const title = cleanText(body?.title);
  const fileKey = cleanText(body?.fileKey ?? body?.file_key);
  const price = body?.price === undefined || body?.price === null ? null : Number(body.price);
  const teachingObjective = cleanText(body?.teachingObjective ?? body?.teaching_objective);
  const teachingMethods = normalizeTeachingMethods(body?.teachingMethods ?? body?.teaching_methods);
  const usageDuration = cleanText(body?.usageDuration ?? body?.usage_duration);
  const activitySteps = cleanText(body?.activitySteps ?? body?.activity_steps);
  const contents = normalizeContents(body?.contents);
  const coverImageUrl = cleanText(body?.cover_image_url ?? body?.coverImageUrl);
  const detailImages = normalizeDetailImages(body?.detail_images ?? body?.detailImages);
  const demoVideoUrl = cleanText(body?.demo_video_url ?? body?.demoVideoUrl);

  if (isCreate) {
    if (!title) return "title is required";
    if (!Number.isFinite(price) || price <= 0) return "price must be greater than 0";
    if (!fileKey) return "fileKey is required";
    if (!teachingObjective) return "teaching_objective is required";
    if (!teachingMethods || teachingMethods.length < 1) return "teaching_methods must include at least one item";
    if (teachingMethods.length > 4) return "teaching_methods cannot exceed 4 items";
    if (!usageDuration) return "usage_duration is required";
    if (!activitySteps) return "activity_steps is required";
    if (!contents || contents.length < 1) return "contents must include at least one item";
    if (!coverImageUrl) return "cover_image_url is required";
  }

  if (!isCreate && price !== null && (!Number.isFinite(price) || price <= 0)) {
    return "price must be greater than 0";
  }
  if (teachingMethods && teachingMethods.length > 4) return "teaching_methods cannot exceed 4 items";
  if (contents) {
    if (contents.length < 1) return "contents must include at least one item";
    for (const c of contents) {
      if (!c.type) return "content.type is required";
      if (!c.name) return "content.name is required";
      if (c.count !== null && (!Number.isFinite(c.count) || c.count <= 0)) return "content.count must be greater than 0";
    }
  }
  if (coverImageUrl && !isValidUrl(coverImageUrl)) return "cover_image_url must be a valid URL";
  if (detailImages) {
    for (const image of detailImages) {
      if (!image.image_url) return "detail_images.image_url is required";
      if (!isValidUrl(image.image_url)) return "detail_images.image_url must be a valid URL";
    }
  }
  if (demoVideoUrl && !isValidUrl(demoVideoUrl)) return "demo_video_url must be a valid URL";

  return null;
}

async function replaceMaterialContents(materialId, contents) {
  if (!Array.isArray(contents)) return;
  await db.query(`DELETE FROM material_contents WHERE material_id = $1`, [materialId]);
  for (let i = 0; i < contents.length; i += 1) {
    const item = contents[i];
    await db.query(
      `INSERT INTO material_contents(id, material_id, type, name, count, description, sort_order)
       VALUES((gen_random_uuid()::text), $1, $2, $3, $4, $5, $6)`,
      [materialId, item.type, item.name, item.count, item.description, i]
    );
  }
}

async function replaceMaterialImages(materialId, detailImages) {
  if (!Array.isArray(detailImages)) return;
  await db.query(`DELETE FROM material_images WHERE material_id = $1`, [materialId]);
  for (let i = 0; i < detailImages.length; i += 1) {
    const image = detailImages[i];
    await db.query(
      `INSERT INTO material_images(id, material_id, image_url, alt_text, sort_order)
       VALUES((gen_random_uuid()::text), $1, $2, $3, $4)`,
      [materialId, image.image_url, image.alt_text, image.sort_order ?? i]
    );
  }
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const user = req.user || null;
    const canSeeAll = user?.role === "admin";
    const canSeeOwn = user?.role === "teacher";
    const result = await db.query(
      `SELECT id, title, description, price, created_at, updated_at, category, age_range, teacher_id, status, file_key, ip_declaration_accepted, ip_declaration_at,
              teaching_objective, teaching_methods, usage_duration, activity_steps, extension_value, short_description,
              cover_image_url, demo_video_url
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

router.get("/:id/rating", async (req, res) => {
  try {
    const materialId = String(req.params.id);
    const stats = await reviewService.getMaterialRatingStats(materialId);
    return res.json(stats);
  } catch (err) {
    console.error("material rating stats failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** Admin：某教材之檢舉列表（與 GET /admin/materials/:materialId/reports 同欄位／同 optional status）。 */
router.get("/:id/reports", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const parsed = parseOptionalReportStatusQuery(req, res);
    if (!parsed.valid) return;
    const materialId = String(req.params.id);
    const rows = await reportRepository.listReportsByMaterialId(materialId, {
      status: parsed.status,
    });
    return res.json(rows);
  } catch (err) {
    console.error("list material reports failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, description, price, created_at, updated_at, category, age_range, teacher_id, status, file_key, ip_declaration_accepted, ip_declaration_at,
              teaching_objective, teaching_methods, usage_duration, activity_steps, extension_value, short_description,
              cover_image_url, demo_video_url
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
    const contentsResult = await db.query(
      `SELECT type, name, count, description
       FROM material_contents
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [row.id]
    );
    const imagesResult = await db.query(
      `SELECT image_url, alt_text, sort_order
       FROM material_images
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [row.id]
    );
    return res.json({ ...row, contents: contentsResult.rows, detail_images: imagesResult.rows });
  } catch (err) {
    console.error("get material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.post("/", requireAuth, requireRole("teacher"), async (req, res) => {
  try {
    const errMsg = validatePayload(req.body || {}, { isCreate: true });
    if (errMsg) return res.status(400).json({ message: errMsg });
    const { title, description, category, ipDeclarationAccepted } = req.body || {};
    const price = Number(req.body?.price);
    const ageRange = req.body?.ageRange ?? req.body?.age_range;
    const fileKey = req.body?.fileKey ?? req.body?.file_key;
    const teachingObjective = req.body?.teachingObjective ?? req.body?.teaching_objective;
    const teachingMethods = req.body?.teachingMethods ?? req.body?.teaching_methods;
    const usageDuration = req.body?.usageDuration ?? req.body?.usage_duration;
    const activitySteps = req.body?.activitySteps ?? req.body?.activity_steps;
    const extensionValue = req.body?.extensionValue ?? req.body?.extension_value;
    const shortDescription = req.body?.shortDescription ?? req.body?.short_description;
    const coverImageUrl = cleanText(req.body?.coverImageUrl ?? req.body?.cover_image_url);
    const demoVideoUrl = cleanText(req.body?.demoVideoUrl ?? req.body?.demo_video_url);
    const contents = normalizeContents(req.body?.contents) || [];
    const detailImages = normalizeDetailImages(req.body?.detailImages ?? req.body?.detail_images) || [];

    if (ipDeclarationAccepted !== true) {
      return res.status(400).json({ message: "ipDeclarationAccepted must be true" });
    }

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "status")) {
      return res.status(400).json({
        message: "status cannot be set on create; new materials start as pending_review",
      });
    }

    const id = newId();
    const created = await db.query(
      `INSERT INTO materials(
         id, title, description, price, category, age_range, teacher_id, status, file_key,
         ip_declaration_accepted, ip_declaration_at,
         teaching_objective, teaching_methods, usage_duration, activity_steps, extension_value, short_description,
         cover_image_url, demo_video_url
       ) VALUES($1, $2, $3, $4, $5, $6, $7, 'pending_review', $8, true, NOW(), $9, $10::jsonb, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        id,
        cleanText(title),
        cleanText(description),
        price,
        cleanText(category),
        cleanText(ageRange),
        req.user.userId,
        cleanText(fileKey),
        cleanText(teachingObjective),
        JSON.stringify(normalizeTeachingMethods(teachingMethods) || []),
        cleanText(usageDuration),
        cleanText(activitySteps),
        cleanText(extensionValue),
        cleanText(shortDescription),
        coverImageUrl,
        demoVideoUrl,
      ]
    );
    await replaceMaterialContents(id, contents);
    await replaceMaterialImages(id, detailImages);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: id,
      action: "material.created",
      meta: { status: "pending_review" },
    });
    return res.status(201).json({ ...created.rows[0], contents, detail_images: detailImages });
  } catch (err) {
    console.error("create material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

async function updateMaterialHandler(req, res) {
  try {
    const id = String(req.params.id);
    const beforeResult = await db.query(`SELECT * FROM materials WHERE id = $1 LIMIT 1`, [id]);
    if (beforeResult.rows.length === 0) return res.status(404).json({ message: "material not found" });
    const before = beforeResult.rows[0];

    const isOwnerTeacher = req.user.role === "teacher" && String(before.teacher_id) === String(req.user.userId);
    const isAdmin = req.user.role === "admin";
    if (!isOwnerTeacher && !isAdmin) return res.status(403).json({ message: "forbidden" });

    const body = req.body || {};
    const errMsg = validatePayload(body, { isCreate: false });
    if (errMsg) return res.status(400).json({ message: errMsg });
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
           teaching_objective = COALESCE($9, teaching_objective),
           teaching_methods = COALESCE($10::jsonb, teaching_methods),
           usage_duration = COALESCE($11, usage_duration),
           activity_steps = COALESCE($12, activity_steps),
           extension_value = COALESCE($13, extension_value),
           short_description = COALESCE($14, short_description),
           cover_image_url = COALESCE($15, cover_image_url),
           demo_video_url = COALESCE($16, demo_video_url),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        req.body?.title ?? null,
        req.body?.description ?? null,
        req.body?.price ?? null,
        req.body?.category ?? null,
        req.body?.ageRange ?? req.body?.age_range ?? null,
        req.body?.fileKey ?? req.body?.file_key ?? null,
        nextStatus,
        cleanText(req.body?.teachingObjective ?? req.body?.teaching_objective),
        (() => {
          const methods = normalizeTeachingMethods(req.body?.teachingMethods ?? req.body?.teaching_methods);
          return methods ? JSON.stringify(methods) : null;
        })(),
        cleanText(req.body?.usageDuration ?? req.body?.usage_duration),
        cleanText(req.body?.activitySteps ?? req.body?.activity_steps),
        cleanText(req.body?.extensionValue ?? req.body?.extension_value),
        cleanText(req.body?.shortDescription ?? req.body?.short_description),
        cleanText(req.body?.coverImageUrl ?? req.body?.cover_image_url),
        cleanText(req.body?.demoVideoUrl ?? req.body?.demo_video_url),
      ]
    );
    const row = updated.rows[0];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contents")) {
      await replaceMaterialContents(id, normalizeContents(req.body?.contents) || []);
    }
    if (
      Object.prototype.hasOwnProperty.call(req.body || {}, "detail_images") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "detailImages")
    ) {
      await replaceMaterialImages(id, normalizeDetailImages(req.body?.detail_images ?? req.body?.detailImages) || []);
    }

    if (before.status !== row.status) {
      if (row.status === "published") {
        await writeActivityLog({
          actorId: req.user.userId,
          actorRole: req.user.role,
          targetType: "material",
          targetId: row.id,
          action: "material.published",
          meta: { oldStatus: before.status, newStatus: row.status },
        });
      } else if (row.status === "unpublished") {
        await writeActivityLog({
          actorId: req.user.userId,
          actorRole: req.user.role,
          targetType: "material",
          targetId: row.id,
          action: "material.unpublished",
          meta: { oldStatus: before.status, newStatus: row.status },
        });
      }
    }

    const contentsResult = await db.query(
      `SELECT type, name, count, description
       FROM material_contents
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );
    const imagesResult = await db.query(
      `SELECT image_url, alt_text, sort_order
       FROM material_images
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );
    return res.json({ ...row, contents: contentsResult.rows, detail_images: imagesResult.rows });
  } catch (err) {
    console.error("update material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
}

router.put("/:id", requireAuth, updateMaterialHandler);
router.patch("/:id", requireAuth, updateMaterialHandler);

module.exports = router;
