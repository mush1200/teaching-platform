/**
 * 消費申訴的買家端點（P1-09 Gate 3）。
 *
 * 掛在 `/me/complaints`（見 `index.js`）—— **刻意不開新的 root prefix**，
 * 因為 `me` 已經在 `/api/backend/[...path]` proxy 的 `ALLOW_ROOT` 內
 * （CLAUDE.md §5：新增 Backend route prefix 必須同步加進 `ALLOW_ROOT`，
 * 否則前端會拿到 proxy 自己產生的 403 而 Backend 完全沒被呼叫）。
 *
 * ## 為什麼**不套** `requireActiveAccount`
 *
 * 延續 Wave 1 #4 的判準（`middlewares/accountStatus.js`）：閘門保護的是
 * 「會產生金錢後果、授權後果，或對外不可逆之公開內容的寫入」。
 * 提出消費申訴三者皆非。
 *
 * 更重要的是：**被凍結的帳號恰恰可能正是帳號遭冒用／付款爭議的當事人。**
 * 應記載事項第十二點要求平台在知悉冒用時立即暫停交易處理 ——
 * 如果同一個機制也擋住申訴管道，被害人就失去了唯一的求助入口。
 *
 * 仍然要求 `requireAuth` ＋ ownership：只能對自己的訂單申訴、只能看自己的申訴。
 */

const express = require("express");
const multer = require("multer");
const { Readable } = require("stream");

const { requireAuth } = require("../middlewares/auth");
const complaints = require("../services/consumerComplaint.service");
const policy = require("../utils/paymentProofPolicy");
const { getPrivateFileStorage, readPaymentProofMaxBytes } = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");
const { normalizeUploadedFilenames } = require("../utils/multipartFilename");
const { sendFileDownload } = require("../utils/fileDownloadResponse");
const { writeActivityLog } = require("../utils/activityLog");

const router = express.Router();

const MAX_EVIDENCE_FILE_BYTES = readPaymentProofMaxBytes();

/**
 * 證據附件沿用**付款憑證的型別政策**（`utils/paymentProofPolicy.js`）——
 * 兩者要承接的東西一樣：匯款截圖、ATM 明細、網銀畫面。
 * **不另寫一份 allowlist。**
 *
 * PDF 目前**刻意未開放**（與付款憑證一致）。銀行的 PDF 交易證明確實常見，
 * 但開放 PDF 是產品與安全決策，不在本輪 scope；
 * 買家仍可用 `externalReference` 以文字提供該證明的來源與案號。
 */
const uploadEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1 },
});

function statusFor(code) {
  if (code === "complaint_not_found" || code === "order_not_found") return 404;
  if (code === "order_not_owned") return 403;
  if (code === "complaint_closed") return 409;
  return 400;
}

/** POST /me/complaints —— 提出申訴。 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const result = await complaints.createComplaint({
      // **申訴人永遠是登入者本人** —— 不讀 body 的 buyerId。
      buyerId: req.user.userId,
      orderId: b.orderId ?? null,
      orderItemId: b.orderItemId ?? null,
      complaintType: b.complaintType,
      subject: b.subject,
      statement: b.statement,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      return res.status(statusFor(result.code)).json({ code: result.code, message: result.message });
    }
    return res.status(201).json({ complaint: result.complaint });
  } catch (err) {
    console.error("create complaint failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /me/complaints —— 自己的申訴清單。 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const items = await complaints.listComplaints({
      buyerId: req.user.userId,
      status: req.query.status || null,
    });
    return res.json({ items });
  } catch (err) {
    console.error("list complaints failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /me/complaints/:id —— 自己的申訴詳情（歷程已濾掉內部註記）。 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const complaint = await complaints.getComplaint(req.params.id);
    if (!complaint) return res.status(404).json({ message: "complaint not found" });
    if (complaint.buyer_id !== req.user.userId) {
      return res.status(403).json({ message: "forbidden" });
    }
    const [events, evidence] = await Promise.all([
      complaints.listEvents(req.params.id, { forBuyer: true }),
      complaints.listEvidence(req.params.id),
    ]);
    return res.json({ complaint, events, evidence });
  } catch (err) {
    console.error("read complaint failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /me/complaints/:id/evidence —— 提供外部證據。
 *
 * `multipart/form-data` 帶 `evidence` 檔案，或 JSON 帶 `externalReference`。
 * **付款爭議不得只以平台自己的紀錄為唯一認定依據**（`N3` / `R7`）。
 */
router.post("/:id/evidence", requireAuth, uploadEvidence.single("evidence"), normalizeUploadedFilenames, async (req, res) => {
  const storage = getPrivateFileStorage();
  let writtenKey = null;
  try {
    const complaint = await complaints.getComplaint(req.params.id);
    if (!complaint) return res.status(404).json({ message: "complaint not found" });
    if (complaint.buyer_id !== req.user.userId) {
      return res.status(403).json({ message: "forbidden" });
    }

    let filePayload = null;
    if (req.file) {
      const declared = policy.validateDeclaredFile({
        originalFilename: req.file.originalname,
        declaredMimeType: req.file.mimetype,
      });
      if (!declared.valid) {
        return res.status(400).json({ code: declared.code, message: declared.message });
      }
      const buffer = Buffer.isBuffer(req.file.buffer) ? req.file.buffer : Buffer.alloc(0);
      if (buffer.length === 0) {
        return res.status(400).json({ code: "empty_file", message: "檔案是空的，請重新選擇。" });
      }
      // magic bytes —— client 無法只靠改名偽造。
      const signature = policy.validateFileSignature(
        declared.type,
        buffer.subarray(0, policy.SIGNATURE_PROBE_BYTES)
      );
      if (!signature.valid) {
        return res.status(400).json({ code: signature.code, message: signature.message });
      }

      const stored = await storage.put(Readable.from(buffer), {
        namespace: NAMESPACES.COMPLAINT_EVIDENCE,
      });
      writtenKey = stored.storageKey;
      filePayload = {
        storageKey: stored.storageKey,
        originalFilename: String(req.file.originalname),
        mimeType: policy.canonicalMimeType(declared.type),
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
      };
    }

    const result = await complaints.addEvidence({
      complaintId: req.params.id,
      uploadedBy: req.user.userId,
      file: filePayload,
      externalReference: req.body?.externalReference ?? null,
      note: req.body?.note ?? null,
      actorRole: req.user.role,
    });
    if (!result.ok) {
      // DB 沒收下就不該留下孤兒物件 —— 這條路徑上沒有任何人知道那個 key。
      if (writtenKey) await storage.delete(writtenKey).catch(() => {});
      return res.status(statusFor(result.code)).json({ code: result.code, message: result.message });
    }
    return res.status(201).json({ evidence: result.evidence });
  } catch (err) {
    if (writtenKey) await storage.delete(writtenKey).catch(() => {});
    console.error("add complaint evidence failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * 證據檔案的位元組。**Buyer 與 Admin 兩條路由共用同一個 resolver**
 * （`consumerComplaint.service.js` 的 `resolveEvidenceForAccess`），
 * 差別只在 `req.user` —— 授權判斷只有一份，不會兩邊各寫一套然後漂移。
 *
 * 預設 `inline`（要看的是影像本身）；`?download=1` 改成 `attachment`
 * **並且只有那個時候才寫稽核** —— 與付款憑證同一 convention：
 * 每次 `<img>` 載入都記一筆只會把 activity log 淹掉，
 * 讓真正重要的「有人把原始證據取走了」看不見。
 *
 * 回應一律 `private, no-store` ＋ `nosniff`（`utils/fileDownloadResponse.js`）。
 */
async function deliverComplaintEvidence(req, res, { complaintId, evidenceId }) {
  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId,
    evidenceId,
    user: req.user,
  });
  if (!resolved.ok) {
    return res
      .status(complaints.statusForEvidenceCode(resolved.code))
      .json({ error: resolved.code, message: resolved.message });
  }

  const opened = await complaints.openEvidenceForDelivery(resolved.evidence);
  if (!opened.ok) {
    return res
      .status(complaints.statusForEvidenceCode(opened.code))
      .json({ error: opened.code, message: opened.message });
  }

  const asDownload = ["1", "true", "yes"].includes(String(req.query.download || "").toLowerCase());
  if (asDownload) {
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "consumer_complaint",
      targetId: String(complaintId),
      action: "complaint_evidence_downloaded",
      // storage key 不記錄 —— 稽核要回答的是「誰取走了哪一份證據」，不是它存在哪裡。
      meta: { evidenceId, originalFilename: resolved.evidence.original_filename },
    });
  }

  return sendFileDownload(res, {
    file: {
      mime_type: resolved.evidence.mime_type,
      original_filename: resolved.evidence.original_filename,
    },
    stream: opened.stream,
    sizeBytes: opened.sizeBytes,
    disposition: asDownload ? "attachment" : "inline",
  });
}

/** GET /me/complaints/:id/evidence/:evidenceId/file —— 買家讀自己申訴的證據。 */
router.get("/:id/evidence/:evidenceId/file", requireAuth, async (req, res) => {
  try {
    return await deliverComplaintEvidence(req, res, {
      complaintId: String(req.params.id),
      evidenceId: String(req.params.evidenceId),
    });
  } catch (err) {
    console.error("complaint evidence delivery failed:", err);
    if (!res.headersSent) return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
