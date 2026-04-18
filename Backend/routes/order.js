const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { requireAuth, requireParent } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const { uploadProof, createOrderFromCart } = require("../services/orderService");

/** POST /orders — 僅 parent；由 cart_item 建立 order + order_item */
router.post("/", requireAuth, requireParent, async (req, res) => {
  try {
    const result = await createOrderFromCart(req.user.userId);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "order",
      targetId: result.order.id,
      action: "order_created",
      meta: {
        order_item_count: result.items.length,
        total_amount: result.order.total_amount,
      },
    });

    return res.status(201).json({
      message: "Order created successfully",
      data: {
        order: result.order,
        items: result.items,
      },
    });
  } catch (err) {
    const code = err.code;
    if (code === "CART_EMPTY") return res.status(400).json({ message: "Cart is empty" });
    if (code === "MATERIALS_UNAVAILABLE") {
      return res.status(409).json({ message: "One or more materials are unavailable" });
    }
    if (code === "CREATE_FAILED") {
      return res.status(500).json({ message: "Failed to create order" });
    }
    console.error("create order unexpected:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

router.get("/my", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, user_id, status, payment_mode, total_amount, total_price,
              paid_at, cancelled_at, created_at, updated_at
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("list my orders failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** POST /orders/:id/upload-proof — 僅新增 manual_payment_proofs；訂單維持 pending_payment */
router.post("/:id/upload-proof", requireAuth, async (req, res) => {
  const orderId = String(req.params.id);
  const { proofUrl } = req.body || {};
  try {
    const row = await uploadProof(orderId, req.user.userId, proofUrl);
    const created = await db.query(
      `INSERT INTO manual_payment_proofs(order_id, proof_url, review_status, uploaded_at)
       VALUES($1, $2, 'pending', NOW())
       RETURNING id, order_id, proof_url, review_status, uploaded_at, created_at`,
      [orderId, row.proofUrl]
    );
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "order",
      targetId: orderId,
      action: "payment_proof_uploaded",
      meta: { proofId: created.rows[0].id },
    });
    return res.status(201).json({ proof: created.rows[0], orderId });
  } catch (err) {
    const code = err.code;
    if (code === "MISSING_PROOF_URL") return res.status(400).json({ message: err.message });
    if (code === "NOT_FOUND") return res.status(404).json({ message: err.message });
    if (code === "FORBIDDEN") return res.status(403).json({ message: err.message });
    if (code === "INVALID_STATUS") return res.status(400).json({ message: err.message });
    console.error("upload order proof failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
