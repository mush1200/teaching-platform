const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const reviewService = require("../services/review.service");

const router = express.Router();

function requireParentReview(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (req.user.role !== "parent") {
    return res.status(403).json({ message: "Only parent can create review" });
  }
  next();
}

router.post("/", requireAuth, requireParentReview, async (req, res) => {
  try {
    const { orderItemId, rating, comment } = req.body || {};
    const { response, audit } = await reviewService.createReview({
      reviewerId: req.user.userId,
      orderItemId,
      rating,
      comment,
    });

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "review",
      targetId: audit.reviewId,
      action: "review_created",
      meta: {
        userId: audit.userId,
        reviewId: audit.reviewId,
        materialId: audit.materialId,
        orderItemId: audit.orderItemId,
      },
    });

    return res.status(201).json(response);
  } catch (err) {
    const code = err.code;
    if (code === "VALIDATION") return res.status(400).json({ message: err.message });
    if (code === "NOT_FOUND") return res.status(404).json({ message: err.message });
    if (code === "FORBIDDEN_OWNER" || code === "FORBIDDEN_STATUS") {
      return res.status(403).json({ message: err.message });
    }
    if (code === "CONFLICT") return res.status(409).json({ message: err.message });
    if (err.code === "23505") return res.status(409).json({ message: "review already exists for this order_item" });
    console.error("create review failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
