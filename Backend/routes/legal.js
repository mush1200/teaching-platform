const express = require("express");
const router = express.Router();

const legalDocuments = require("../services/legalDocument.service");

/**
 * 法律文件的 **public read-only** 端點（P1-09 Legal Foundation）。
 *
 * ## 刻意沒有 `requireAuth`
 *
 * 法律文件必須讓**尚未註冊**的人在同意之前就能完整閱讀
 * （消保法 §11-1 審閱期的前提）。已登入使用者對這些文件的讀取權
 * **不應該比匿名訪客多** —— 因此這裡完全不看身分。
 *
 * ## published-only
 *
 * 只有 `publication_status = 'published'` 的文件會被吐出來。
 * `draft` / `approved` 是內部稿件，若能被 public 讀到，
 * 等於平台對外發布了未經核可的法律文字。
 * `superseded` 也不從這裡出去 —— 它不是現行版本；
 * 需要歷史版本的是稽核（Admin 端點），不是一般訪客。
 *
 * 沒有 published 版本時回 **404**，而**不是**空殼頁面。
 * 「看起來像法律頁面但沒有內容」比誠實的 404 更危險。
 */

/**
 * GET /legal/documents
 *
 * 目前有哪些類型已發布（給 Footer 決定要不要顯示連結，`DEC-LEGAL-04`）。
 * **不回傳正文** —— 這支只是可用性清單。
 */
router.get("/documents", async (_req, res) => {
  try {
    const rows = await legalDocuments.listPublishedTypes();
    return res.json({
      items: rows.map((r) => ({
        documentType: r.document_type,
        version: r.version,
        // 與 `toPublicView` 走同一個正規化：DATE 直接序列化會因時區位移一天。
        effectiveDate: legalDocuments.formatEffectiveDate(r.effective_date),
      })),
    });
  } catch (err) {
    console.error("list published legal documents failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /legal/documents/:type
 *
 * 取回該類型**目前生效**的版本。`:type` 必須是四個 canonical 值之一；
 * 未知類型回 404（而非 400）—— 對匿名訪客而言，
 * 「這個文件類型不存在」與「這個類型還沒發布」都是同一件事：沒有東西可看。
 */
router.get("/documents/:type", async (req, res) => {
  try {
    const type = String(req.params.type);
    const doc = await legalDocuments.getCurrentPublished(type);
    if (!doc) {
      return res.status(404).json({
        error: "legal_document_not_published",
        message: "no published version of this legal document",
      });
    }
    return res.json(legalDocuments.toPublicView(doc));
  } catch (err) {
    console.error("read published legal document failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
