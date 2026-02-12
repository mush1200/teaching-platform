const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middlewares/auth");

const purchases = [];
// { id, userId, productId, status, createdAt, reviewedAt, reviewedBy }

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// ✅ 1) 使用者申請：POST /purchase
router.post("/", requireAuth, (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "Missing productId" });
  }

  const userId = req.user.userId; // ⭐ 你的 decoded 結構是 userId

  const exists = purchases.find(
    (p) =>
      p.userId === userId &&
      p.productId === productId &&
      (p.status === STATUS.PENDING || p.status === STATUS.APPROVED)
  );

  if (exists) {
    return res.status(400).json({
      message: "Already requested or already approved",
      existing: exists,
    });
  }

  const purchase = {
    id: newId(),
    userId,
    productId,
    status: STATUS.PENDING,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
  };

  purchases.push(purchase);
  return res.json(purchase);
});

// ✅ 2) 使用者看自己的：GET /purchase/me
router.get("/me", requireAuth, (req, res) => {
  const userId = req.user.userId;
  const mine = purchases.filter((p) => p.userId === userId);
  return res.json({ items: mine });
});

// ✅ 3) admin 看清單：GET /purchase/admin/list?status=pending
router.get("/admin/list", requireAuth, requireRole("admin"), (req, res) => {
  const status = req.query.status;
  const items = status
    ? purchases.filter((p) => p.status === status)
    : purchases;

  return res.json({ items });
});

// ✅ 4) admin 審核：PATCH /purchase/admin/:id
router.patch("/admin/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  if (![STATUS.APPROVED, STATUS.REJECTED].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const purchase = purchases.find((p) => p.id === id);
  if (!purchase) return res.status(404).json({ message: "Not found" });

  if (purchase.status !== STATUS.PENDING) {
    return res.status(400).json({ message: "Already processed", purchase });
  }

  purchase.status = status;
  purchase.reviewedAt = new Date().toISOString();
  purchase.reviewedBy = req.user.userId;

  return res.json(purchase);
});

module.exports = router;
