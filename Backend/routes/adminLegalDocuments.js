const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const legalDocuments = require("../services/legalDocument.service");

/**
 * 法律文件的管理端點（P1-09 Legal Foundation）。
 *
 * **Admin only。** 法律文件正文雖然是 public-readable，
 * 但寫入路徑是完整的 security boundary：能寫這裡的人
 * 等於能決定平台對外的契約內容。
 *
 * 生命週期：`draft → approved → published`（發布時舊版原子轉 `superseded`）。
 *
 * ## 本輪不提供 Admin UI
 *
 * 只做 domain / API foundation。repo 目前沒有既有的 legal-admin workflow
 * 可以掛，為了「有 UI」順手做一整個版型不屬於本輪 scope。
 * 這些端點已足以完成 create → approve → publish → 解析 current 的完整路徑。
 */

router.use(requireAuth, requireRole("admin"));

/** 錯誤碼 → HTTP status。 */
function statusForCode(code) {
  switch (code) {
    case "not_found":
      return 404;
    case "version_already_exists":
      return 409;
    case "invalid_transition":
    case "not_draft":
      return 409;
    // `requires_reconsent_*` 與 `justification_*` 皆走 default 400 ——
    // 它們是 request validation failure，不是狀態衝突。
    default:
      return 400;
  }
}

function respondFailure(res, result) {
  return res.status(statusForCode(result.code)).json({ error: result.code, message: result.message });
}

/** GET /admin/legal-documents?type=terms —— 版本歷史（含 draft / superseded）。 */
router.get("/legal-documents", async (req, res) => {
  try {
    const type = req.query.type ? String(req.query.type) : null;
    if (!type) {
      return res.status(400).json({
        error: "type_required",
        message: `type is required; one of: ${legalDocuments.DOCUMENT_TYPES.join(", ")}`,
      });
    }
    if (!legalDocuments.DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({ error: "invalid_document_type", message: "unknown document type" });
    }
    const rows = await legalDocuments.listByType(type);
    return res.json({ items: rows.map(legalDocuments.toAdminView) });
  } catch (err) {
    console.error("list legal documents failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/legal-documents/:id —— 單筆完整讀取（稽核用，含 superseded 正文）。 */
router.get("/legal-documents/:id", async (req, res) => {
  try {
    const doc = await legalDocuments.getById(String(req.params.id));
    if (!doc) return res.status(404).json({ error: "not_found", message: "legal document not found" });
    return res.json(legalDocuments.toAdminView(doc));
  } catch (err) {
    console.error("read legal document failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/legal-documents —— 建立草稿。
 *
 * `contentHash` **刻意不接受** client 提供：雜湊一律由 server 對實際儲存的
 * 正文計算。接受 client hash 等於讓「同意的內容」可被偽造。
 *
 * `requiresReconsent` **必填且必須是真正的 boolean**（`SCHEMA-03`）——
 * 欄位為 `NOT NULL` 且 DB 端無 DEFAULT，此處亦無任何 fallback。
 * 草稿階段的值是暫定的；決定性的一次在 publish（見下）。
 */
router.post("/legal-documents", async (req, res) => {
  try {
    const { documentType, version, body, effectiveDate, requiresReconsent } = req.body || {};
    const result = await legalDocuments.createDraft({
      documentType,
      version,
      body,
      effectiveDate: effectiveDate || null,
      // 直接傳遞，**不做任何正規化或預設** —— 驗證一律由 service 層的
      // `validateRequiresReconsent` 執行，避免兩處判準漂移。
      requiresReconsent,
      actorId: req.user.userId,
    });
    if (!result.ok) return respondFailure(res, result);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "legal_document",
      targetId: result.document.id,
      action: "legal_document.draft_created",
      meta: {
        documentType: result.document.document_type,
        version: result.document.version,
        requiresReconsent: result.document.requires_reconsent,
      },
    });
    return res.status(201).json(legalDocuments.toAdminView(result.document));
  } catch (err) {
    console.error("create legal document draft failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** PATCH /admin/legal-documents/:id —— 只有 draft 可以改。 */
router.patch("/legal-documents/:id", async (req, res) => {
  try {
    const { body, effectiveDate, requiresReconsent } = req.body || {};
    const result = await legalDocuments.updateDraft({
      id: String(req.params.id),
      body,
      effectiveDate,
      // 選填：未提供就不動。一旦提供仍須為真正的 boolean。
      requiresReconsent,
    });
    if (!result.ok) return respondFailure(res, result);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "legal_document",
      targetId: result.document.id,
      action: "legal_document.draft_updated",
      meta: {
        documentType: result.document.document_type,
        version: result.document.version,
        requiresReconsent: result.document.requires_reconsent,
      },
    });
    return res.json(legalDocuments.toAdminView(result.document));
  } catch (err) {
    console.error("update legal document draft failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** POST /admin/legal-documents/:id/approve —— 核可。**核可仍不對外。** */
router.post("/legal-documents/:id/approve", async (req, res) => {
  try {
    const result = await legalDocuments.approve({
      id: String(req.params.id),
      actorId: req.user.userId,
    });
    if (!result.ok) return respondFailure(res, result);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "legal_document",
      targetId: result.document.id,
      action: "legal_document.approved",
      meta: { documentType: result.document.document_type, version: result.document.version },
    });
    return res.json(legalDocuments.toAdminView(result.document));
  } catch (err) {
    console.error("approve legal document failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /admin/legal-documents/:id/publish —— 發布。
 *
 * 同一個 transaction 內把同型別的舊 published 轉為 `superseded`，
 * 因此**不存在**「兩份現行 Terms」或「短暫沒有現行版本」的對外狀態。
 *
 * ## `requiresReconsent` ＋ 發布理由皆必填
 *
 * （`SCHEMA-03` / `DEC-LEGAL-06`；`OPS-03` / `DEC-LEGAL-11`）
 *
 * body 需要 `{ requiresReconsent: boolean, reasonCode: string, note?: string }`。
 * 兩者**互相獨立**：`reasonCode` 描述這次改版在做什麼（營運分類），
 * `requiresReconsent` 是系統要不要擋 —— **不得**由其中一個推導另一個。
 *
 * ## `requiresReconsent` 必填（`SCHEMA-03` / `DEC-LEGAL-06`）
 *
 * **即使草稿已經有值，發布時仍必須再顯式提供一次。** 這是本欄位存在的理由：
 * 每一次發布都要有人明確回答「此版本 production 是否要求重新同意」。
 * 缺少、`null`、字串 `"true"`／`"false"`、數字、物件 → **400**。
 *
 * 這是 production enforcement metadata，**不是**法律上「重大變更」之認定 ——
 * 判準與判定者仍屬 `DEC-LEGAL-01` 律師側，尚未確定。
 */
router.post("/legal-documents/:id/publish", async (req, res) => {
  try {
    /*
     * `requiresReconsent` 與 `reasonCode`／`note` 是**兩個獨立的顯式選擇**
     * （`OPS-03` / `DEC-LEGAL-11`）。這裡原樣傳遞，**不做任何推導或正規化** ——
     * 特別是**不得**由 `reasonCode` 推出 `requiresReconsent`，反之亦然。
     */
    const { requiresReconsent, reasonCode, note } = req.body || {};
    const result = await legalDocuments.publish({
      id: String(req.params.id),
      actorId: req.user.userId,
      requiresReconsent,
      reasonCode,
      note,
    });
    if (!result.ok) return respondFailure(res, result);

    /*
     * 稽核：這一筆必須能事後回答
     * 「誰、在什麼時候、把哪一份文件的哪一版，發布為要求／不要求重新同意，
     * **依據什麼營運理由**」（`OPS-03`）。
     *
     * `justificationCode` 是**營運分類**，不是法律判定 ——
     * 它描述「這次改版在做什麼」，**不認定**是否構成法律上的重大變更。
     * 「什麼變更依法必須要求重新同意」仍為 `DEC-LEGAL-01`（律師側，未決）。
     */
    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "legal_document",
      targetId: result.document.id,
      action: "legal_document.published",
      meta: {
        documentType: result.document.document_type,
        version: result.document.version,
        effectiveDate: result.document.effective_date,
        contentHash: result.document.content_hash,
        requiresReconsent: result.document.requires_reconsent,
        justificationCode: result.justification.reasonCode,
        justificationNote: result.justification.note,
        supersededIds: result.supersededIds,
      },
    });
    return res.json({
      ...legalDocuments.toAdminView(result.document),
      supersededIds: result.supersededIds,
    });
  } catch (err) {
    console.error("publish legal document failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
