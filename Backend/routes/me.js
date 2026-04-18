const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const reviewService = require("../services/review.service");

const router = express.Router();

router.get("/reviews", requireAuth, async (req, res) => {
  try {
    const items = await reviewService.listMyReviews(req.user.userId);
    return res.json(items);
  } catch (err) {
    console.error("list my reviews failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
