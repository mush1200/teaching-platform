const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const reviewService = require("../services/review.service");

const router = express.Router();

function requireParentReviewer(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (req.user.role !== "parent") {
    return res.status(403).json({ message: "Only parent can create review" });
  }
  next();
}

router.post("/", requireAuth, requireParentReviewer, async (req, res) => {
  try {
    const body = req.body || {};
    const materialId = body.material_id ?? body.materialId;
    const { rating, comment } = body;

    const { response, audit } = await reviewService.createReview({
      parentId: req.user.userId,
      materialId,
      rating,
      comment,
    });

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: audit.materialId,
      action: "review_created",
      meta: {
        rating: audit.rating,
      },
    });

    return res.status(201).json(response);
  } catch (err) {
    const code = err.code;
    if (code === "VALIDATION") return res.status(400).json({ message: err.message });
    if (code === "MATERIAL_NOT_FOUND") return res.status(404).json({ message: err.message });
    if (code === "FORBIDDEN_ENTITLEMENT") return res.status(403).json({ message: err.message });
    if (code === "CONFLICT") return res.status(409).json({ message: err.message });
    if (err.code === "23505") return res.status(409).json({ message: "already reviewed" });
    console.error("create review failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
