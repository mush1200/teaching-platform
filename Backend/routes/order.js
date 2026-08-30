const express = require("express");
const router = express.Router();
const db = require("../config/db");
const multer = require("multer");
const { requireAuth, requireParent } = require("../middlewares/auth");
const { requireActiveAccount } = require("../middlewares/accountStatus");
const refundRemedyService = require("../services/refundRemedy.service");
const { writeActivityLog } = require("../utils/activityLog");
const { validateReportedPayment } = require("../utils/reportedPayment");
const paymentTimingPolicy = require("../utils/paymentTimingPolicy");
const { uploadProof, createOrderFromCart, resolvePromotion } = require("../services/orderService");
const { sendOrderCreatedEmail, sendProofUploadedEmail } = require("../services/emailService");
const paymentProofService = require("../services/paymentProof.service");
const proofPolicy = require("../utils/paymentProofPolicy");
const { readPaymentProofMaxBytes } = require("../config/privateFileStorage");
const { sendFileDownload } = require("../utils/fileDownloadResponse");
const { normalizeUploadedFilenames } = require("../utils/multipartFilename");

/*
 * 付款憑證的上限。張數是產品規則（一筆訂單最多 3 張），單檔大小由
 * `MAX_PAYMENT_PROOF_BYTES` 設定（預設 10 MB）。前端 `payment-proof/page.tsx`
 * 有一份對應的 client-side 檢查，作用只是提早給回饋 —— 真正的把關在這裡。
 */
const MAX_PROOF_FILES = 3;
const MAX_PROOF_FILE_BYTES = readPaymentProofMaxBytes();
const uploadIdempotencyCache = new Map();

/**
 * 憑證上傳改用 **memoryStorage**。
 *
 * 舊實作是 `multer.diskStorage`，直接把檔案寫進 `uploads/payment-proofs/` ——
 * 而 `index.js` 用 `express.static` 公開整個 `uploads/`，等於**任何知道檔名的人
 * 都能不經授權取得別人的付款憑證**。這個 milestone 要消滅的就是那條路徑。
 *
 * 現在 multer 只把位元組留在記憶體，由 `paymentProof.service` 驗過 magic bytes
 * 之後寫進私有儲存。憑證上限 10 MB × 3，緩衝在記憶體是可接受的；教材本體
 * （100 MB）才需要自訂 streaming storage engine（見 `routes/teacherUpload.js`）。
 *
 * `fileFilter` 只做**宣告值**的粗篩（擋掉明顯不是圖片的東西，讓錯誤早點回來）。
 * 副檔名 + MIME + magic bytes 的三層驗證在服務層，因為前兩層都是 client 說了算。
 */
const uploadProofFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_FILE_BYTES, files: MAX_PROOF_FILES },
  fileFilter: (_req, file, cb) => {
    if (proofPolicy.findTypeByMimeType(file.mimetype)) return cb(null, true);
    return cb(new Error("only JPG, PNG, WEBP are allowed"));
  },
});

/** POST /orders — 僅 parent；由 cart_item 建立 order + order_item */
router.post("/", requireAuth, requireParent, requireActiveAccount, async (req, res) => {
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
    /* 可交付性防線 #3 的對外回應：409，訊息就是買家看得懂的那一句。 */
    if (code === "MATERIALS_NOT_DELIVERABLE") {
      return res.status(409).json({ message: err.message });
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

/**
 * POST /orders/:id/payment-proof —— 收下付款憑證，寫進**私有儲存**。
 *
 * 流程沒有改變（買家上傳 → pending → Admin 核准／退回）；改變的只有
 * 「檔案存在哪裡、怎麼讀回來」：
 *
 *   舊：multer 直接寫 `uploads/payment-proofs/`（express.static 公開），DB 存公開 URL
 *   新：驗 magic bytes → 寫 `private-storage/payment-proofs/`，DB 存 opaque storage key
 *
 * 回應**不含** storage key、路徑或任何公開 URL，只給 `proof_file_path`
 * （由 order id + proof id 組成的受保護讀取路徑）。
 */
async function uploadProofHandler(req, res) {
  const orderId = String(req.params.id);
  const files = Array.isArray(req.files) ? req.files : [];
  const idemKey = String(req.get("x-idempotency-key") || "").trim();
  const idemCacheKey = idemKey ? `${req.user.userId}:${orderId}:${idemKey}` : "";
  if (idemCacheKey && uploadIdempotencyCache.has(idemCacheKey)) {
    return res.status(202).json({
      message: "duplicate upload request ignored",
      orderId,
      duplicate: true,
    });
  }
  try {
    /*
     * **買家申報的付款辨識資訊**（P1-09 Gate 6，2026-08-26 接線）。
     *
     * 四個欄位全部選填 —— 既有流程允許只上傳圖片，新增欄位不得把它變成必填。
     * 但只要有填就必須合格（見 `utils/reportedPayment.js`）。
     *
     * `multipart/form-data` 的值一律是字串，因此金額與時間由 validator 轉型。
     */
    const reportedCheck = validateReportedPayment({
      reportedBankName: req.body?.reportedBankName,
      reportedAccountLast4: req.body?.reportedAccountLast4,
      reportedAmount: req.body?.reportedAmount,
      reportedTransferAt: req.body?.reportedTransferAt,
    });
    if (!reportedCheck.valid) {
      return res.status(400).json({ error: reportedCheck.code, message: reportedCheck.message });
    }

    // 訂單擁有權 / 訂單狀態 / 張數上限（既有業務規則，完全未動）
    const validated = await uploadProof(orderId, req.user.userId, files.length, MAX_PROOF_FILES);

    const stored = await paymentProofService.storeUploads({
      orderId,
      uploadedBy: req.user.userId,
      files,
      reported: reportedCheck.provided ? reportedCheck.value : null,
    });
    if (!stored.ok) {
      return res
        .status(paymentProofService.statusForCode(stored.code))
        .json({ error: stored.code, message: stored.message });
    }
    const createdProofs = stored.proofs;

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
        // 只記「有沒有申報」，**不把申報值抄進稽核 meta** ——
        // 那是憑證列上的事實，重複一份只會多一個會不同步的來源。
        reportedPaymentProvided: reportedCheck.provided,
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
    /*
     * 付款期限已過且從未在期限內提交過（Wave 2 #12）。
     *
     * **409 而不是 400** —— 這不是請求格式錯誤，是「訂單目前的狀態不接受這個動作」，
     * 與 `/materials/:id/file` 在 `published` 時回 409 的既有慣例一致。
     * `error` 用 deterministic code，前端據此顯示對應文案，**不比對訊息字串**。
     */
    if (code === "PAYMENT_DEADLINE_EXPIRED") {
      return res.status(409).json({
        error: paymentTimingPolicy.PAYMENT_DEADLINE_EXPIRED_CODE,
        message: "付款期限已過，此訂單無法再提交付款憑證。如仍要購買，請重新建立訂單。",
        meta: err.meta || undefined,
      });
    }
    console.error("upload order proof failed:", err);
    return res.status(500).json({ message: "server error" });
  }
}

/** POST /orders/:id/upload-proof — legacy path */
router.post("/:id/upload-proof", requireAuth, requireParent, requireActiveAccount, uploadProofFiles.array("proofs", MAX_PROOF_FILES), normalizeUploadedFilenames, uploadProofHandler);
/** POST /orders/:id/payment-proof — canonical path */
router.post("/:id/payment-proof", requireAuth, requireParent, requireActiveAccount, uploadProofFiles.array("proofs", MAX_PROOF_FILES), normalizeUploadedFilenames, uploadProofHandler);

/*
 * -----------------------------------------------------------------------------
 * 憑證讀取（**唯一**取得憑證影像的方式）
 * -----------------------------------------------------------------------------
 *
 * 兩支都掛在 `/orders/*` 而不是分成 buyer 版與 admin 版：授權規則只有一條
 * （Admin **或** 訂單擁有者），寫兩次就等於留兩個會分歧的地方。角色差異只影響
 * 稽核紀錄（Admin 明確下載原始檔會留痕），不影響能不能讀。
 *
 * `requireAuth` 而不是 `requireParent`：Admin 也要能走同一條路。
 */

/** GET /orders/:orderId/payment-proofs — 這筆訂單的憑證清單（metadata，不含位元組）。 */
router.get("/:orderId/payment-proofs", requireAuth, async (req, res) => {
  try {
    const result = await paymentProofService.listOrderProofs({
      orderId: String(req.params.orderId),
      user: req.user,
    });
    if (!result.ok) {
      return res
        .status(paymentProofService.statusForCode(result.code))
        .json({ error: result.code, message: result.message });
    }
    return res.json({ orderId: String(req.params.orderId), items: result.proofs });
  } catch (err) {
    console.error("list order payment proofs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /orders/:orderId/payment-proofs/:proofId/file — 憑證影像的位元組。
 *
 * 預設 `inline`（Admin 審核與買家檢視要看的是影像本身）；`?download=1` 改成
 * `attachment`，並且只有在那個時候才寫稽核 —— Admin 每次載入 `<img>` 都記一筆
 * 只會把 activity log 淹掉，讓真正重要的「有人把原始憑證取走了」看不見。
 *
 * 回應一律 `Cache-Control: private, no-store`（見 `utils/fileDownloadResponse.js`）：
 * 付款憑證不該被任何 CDN 或共享快取留下副本。
 */
router.get("/:orderId/payment-proofs/:proofId/file", requireAuth, async (req, res) => {
  const orderId = String(req.params.orderId);
  const proofId = String(req.params.proofId);
  try {
    const resolved = await paymentProofService.resolveProofForAccess({
      orderId,
      proofId,
      user: req.user,
    });
    if (!resolved.ok) {
      return res
        .status(paymentProofService.statusForCode(resolved.code))
        .json({ error: resolved.code, message: resolved.message });
    }

    const opened = await paymentProofService.openProofForDelivery(resolved.proof);
    if (!opened.ok) {
      return res
        .status(paymentProofService.statusForCode(opened.code))
        .json({ error: opened.code, message: opened.message });
    }

    const asDownload = ["1", "true", "yes"].includes(String(req.query.download || "").toLowerCase());
    if (asDownload) {
      await writeActivityLog({
        actorId: req.user.userId,
        actorRole: req.user.role,
        targetType: "order",
        targetId: orderId,
        action: "payment_proof_downloaded",
        // storage key 不記錄 —— 稽核要回答的是「誰取走了哪一張憑證」，不是它存在哪裡。
        meta: { proofId, originalFilename: resolved.proof.original_filename },
      });
    }

    return sendFileDownload(res, {
      file: {
        mime_type: resolved.proof.proof_mime_type,
        original_filename: resolved.proof.original_filename,
      },
      stream: opened.stream,
      sizeBytes: opened.sizeBytes,
      disposition: asDownload ? "attachment" : "inline",
    });
  } catch (err) {
    console.error("payment proof delivery failed:", err);
    if (!res.headersSent) return res.status(500).json({ message: "server error" });
  }
});

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

/* -------------------------------------------------------------------------- */
/* 退款／補救案件（P1-09 Gate 14）                                             */
/* -------------------------------------------------------------------------- */
/*
 * 建立案件是**提出請求**，不是執行 —— 它不動訂單狀態、不動授權、不移動任何金錢。
 * 實際的核准與退款由 Admin 明示操作。
 *
 * 因此**刻意不掛 `requireActiveAccount`**：依 Wave 1 #4 的判準，
 * 凍結所禁止的是「會產生金錢後果、授權後果或對外不可逆公開內容的寫入」，
 * 而提出救濟請求三者皆非；且帳號被凍結的使用者本來就可能正需要這個管道。
 * 金錢的控制點在 Admin 審核。
 */

/** POST /orders/:orderId/remedy-cases — 買家提出退款／補救請求 */
router.post("/:orderId/remedy-cases", requireAuth, async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const owner = await db.query(`SELECT user_id FROM orders WHERE id = $1`, [orderId]);
    if (owner.rows.length === 0) return res.status(404).json({ message: "order not found" });
    if (owner.rows[0].user_id !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { orderItemId, caseType, statement, requestedAmount } = req.body || {};
    const result = await refundRemedyService.createCase({
      orderId,
      orderItemId: orderItemId ?? null,
      caseType,
      buyerStatement: statement ?? null,
      requestedAmount: requestedAmount ?? null,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      const status = result.code === "order_not_found" ? 404 : 400;
      return res.status(status).json({ code: result.code, message: result.message });
    }
    return res.status(201).json({ case: result.case });
  } catch (err) {
    console.error("create remedy case failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /orders/:orderId/remedy-cases — 買家查看自己這張訂單的案件 */
router.get("/:orderId/remedy-cases", requireAuth, async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const owner = await db.query(`SELECT user_id FROM orders WHERE id = $1`, [orderId]);
    if (owner.rows.length === 0) return res.status(404).json({ message: "order not found" });
    if (owner.rows[0].user_id !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const cases = await refundRemedyService.listCases({ orderId });
    return res.json({ items: cases });
  } catch (err) {
    console.error("list remedy cases failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
