const express = require("express");
const router = express.Router();
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { requireAuth, requireParent } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const { uploadProof, createOrderFromCart, resolvePromotion } = require("../services/orderService");
const { sendOrderCreatedEmail, sendProofUploadedEmail } = require("../services/emailService");

const PROOF_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "payment-proofs");
const MAX_PROOF_FILES = 3;
const MAX_PROOF_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const uploadIdempotencyCache = new Map();

fs.mkdirSync(PROOF_UPLOAD_DIR, { recursive: true });

function publicBaseUrl() {
  const explicit = process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL;
  if (explicit && String(explicit).trim()) return String(explicit).replace(/\/$/, "");
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PROOF_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 32);
    const safeExt = /^\.[a-zA-Z0-9]+$/.test(ext) ? ext.toLowerCase() : "";
    cb(null, `${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const uploadProofFiles = multer({
  storage: proofStorage,
  limits: { fileSize: MAX_PROOF_FILE_BYTES, files: MAX_PROOF_FILES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_PROOF_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new Error("only JPG, PNG, WEBP are allowed"));
  },
});

function cleanupUploadedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return;
  for (const f of files) {
    if (!f?.path) continue;
    fs.unlink(f.path, () => {});
  }
}

/** POST /orders — 僅 parent；由 cart_item 建立 order + order_item */
router.post("/", requireAuth, requireParent, async (req, res) => {
  try {
    const { promo_code, invoice_type, invoice_carrier } = req.body || {};
    const result = await createOrderFromCart(req.user.userId, {
      promoCode: promo_code,
      invoiceType: invoice_type,
      invoiceCarrier: invoice_carrier,
    });

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
    void sendOrderCreatedEmail(result.order.id);

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
    if (code === "PROMO_NOT_FOUND") return res.status(404).json({ message: "優惠代碼不存在" });
    if (code === "PROMO_NOT_ACTIVE" || code === "PROMO_INVALID_TYPE") {
      return res.status(400).json({ message: "優惠代碼不可使用" });
    }
    if (code === "INVALID_CARRIER") return res.status(400).json({ message: "手機載具格式不正確" });
    if (code === "CREATE_FAILED") {
      return res.status(500).json({ message: "Failed to create order" });
    }
    console.error("create order unexpected:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

/** POST /orders/promo/validate */
router.post("/promo/validate", requireAuth, requireParent, async (req, res) => {
  try {
    const { code, subtotal } = req.body || {};
    const normalizedSubtotal = Math.max(0, Math.floor(Number(subtotal) || 0));
    const applied = await resolvePromotion(code, normalizedSubtotal);
    return res.json({
      code: applied.promoCode,
      discount_amount: applied.discountAmount,
      subtotal: normalizedSubtotal,
      total_amount: Math.max(0, normalizedSubtotal - applied.discountAmount),
    });
  } catch (err) {
    if (err.code === "PROMO_NOT_FOUND") return res.status(404).json({ message: "優惠代碼不存在" });
    if (err.code === "PROMO_NOT_ACTIVE" || err.code === "PROMO_INVALID_TYPE") {
      return res.status(400).json({ message: "優惠代碼不可使用" });
    }
    console.error("validate promo failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/my", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.id, o.user_id, o.status, o.payment_mode, o.total_amount, o.total_price,
              o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier,
              o.paid_at, o.cancelled_at, o.created_at, o.updated_at,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'pending'),
                0
              ) AS payment_proof_pending_review_count
       FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("list my orders failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const orderId = String(req.params.id);
    const result = await db.query(
      `SELECT o.id, o.user_id, o.status, o.payment_mode, o.total_amount, o.total_price,
              o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier,
              o.paid_at, o.cancelled_at, o.created_at, o.updated_at,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'pending'),
                0
              ) AS payment_proof_pending_review_count
       FROM orders o
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "order not found" });

    const order = result.rows[0];
    const isOwner = String(order.user_id) === String(req.user.userId);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "forbidden" });

    const itemsResult = await db.query(
      `SELECT id, order_id, material_id, title_snapshot AS material_title,
              quantity, COALESCE(price_snapshot, 0)::int AS unit_price,
              COALESCE(subtotal, 0)::int AS subtotal
       FROM order_items
       WHERE order_id = $1
       ORDER BY created_at ASC, id ASC`,
      [orderId]
    );

    return res.json({ order, items: itemsResult.rows });
  } catch (err) {
    console.error("get order detail failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

async function uploadProofHandler(req, res) {
  const orderId = String(req.params.id);
  const files = Array.isArray(req.files) ? req.files : [];
  const idemKey = String(req.get("x-idempotency-key") || "").trim();
  const idemCacheKey = idemKey ? `${req.user.userId}:${orderId}:${idemKey}` : "";
  if (idemCacheKey && uploadIdempotencyCache.has(idemCacheKey)) {
    cleanupUploadedFiles(files);
    return res.status(202).json({
      message: "duplicate upload request ignored",
      orderId,
      duplicate: true,
    });
  }
  try {
    const validated = await uploadProof(orderId, req.user.userId, files.length, MAX_PROOF_FILES);
    const baseUrl = publicBaseUrl();
    const client = await db.pool.connect();
    const createdProofs = [];
    try {
      await client.query("BEGIN");
      for (const file of files) {
        const proofUrl = `${baseUrl}/uploads/payment-proofs/${file.filename}`;
        const created = await client.query(
          `INSERT INTO manual_payment_proofs(
             order_id, proof_url, proof_mime_type, proof_size_bytes, original_filename, review_status, uploaded_at
           )
           VALUES($1, $2, $3, $4, $5, 'pending', NOW())
           RETURNING id, order_id, proof_url, proof_mime_type, proof_size_bytes, original_filename, review_status, uploaded_at, created_at`,
          [orderId, proofUrl, file.mimetype, Number(file.size || 0), file.originalname || null]
        );
        createdProofs.push(created.rows[0]);
      }
      await client.query("COMMIT");
    } catch (dbErr) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      cleanupUploadedFiles(files);
      throw dbErr;
    } finally {
      client.release();
    }

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "order",
      targetId: orderId,
      action: "payment_proof_uploaded",
      meta: {
        proofIds: createdProofs.map((p) => p.id),
        uploadedCount: createdProofs.length,
        totalProofCountAfterUpload: validated.existingProofCount + createdProofs.length,
        idempotencyKey: idemKey || null,
      },
    });
    if (idemCacheKey) {
      uploadIdempotencyCache.set(idemCacheKey, Date.now());
      setTimeout(() => uploadIdempotencyCache.delete(idemCacheKey), 10 * 60 * 1000);
    }
    void sendProofUploadedEmail(orderId);
    return res.status(201).json({
      proofs: createdProofs,
      proof: createdProofs[0] || null,
      orderId,
      uploadedCount: createdProofs.length,
      maxAllowed: MAX_PROOF_FILES,
    });
  } catch (err) {
    cleanupUploadedFiles(files);
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "each proof image must be <= 10MB" });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ message: "up to 3 proof images are allowed per upload" });
      }
      return res.status(400).json({ message: err.message || "upload failed" });
    }
    if (err && err.message === "only JPG, PNG, WEBP are allowed") {
      return res.status(400).json({ message: err.message });
    }
    const code = err.code;
    if (code === "MISSING_PROOF_FILES") {
      return res.status(400).json({ message: "please upload at least one proof image (JPG/JPEG/PNG/WEBP)" });
    }
    if (code === "MAX_PROOFS_EXCEEDED") {
      return res.status(400).json({
        message: "maximum 3 proof images allowed per order",
        meta: err.meta || undefined,
      });
    }
    if (code === "NOT_FOUND") return res.status(404).json({ message: err.message });
    if (code === "FORBIDDEN") return res.status(403).json({ message: err.message });
    if (code === "INVALID_STATUS") return res.status(400).json({ message: err.message });
    console.error("upload order proof failed:", err);
    return res.status(500).json({ message: "server error" });
  }
}

/** POST /orders/:id/upload-proof — legacy path */
router.post("/:id/upload-proof", requireAuth, requireParent, uploadProofFiles.array("proofs", MAX_PROOF_FILES), uploadProofHandler);
/** POST /orders/:id/payment-proof — canonical path */
router.post("/:id/payment-proof", requireAuth, requireParent, uploadProofFiles.array("proofs", MAX_PROOF_FILES), uploadProofHandler);

router.use((err, _req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "each proof image must be <= 10MB" });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: "up to 3 proof images are allowed per upload" });
    }
    return res.status(400).json({ message: err.message || "upload failed" });
  }
  if (err.message === "only JPG, PNG, WEBP are allowed") {
    return res.status(400).json({ message: err.message });
  }
  return next(err);
});

module.exports = router;
