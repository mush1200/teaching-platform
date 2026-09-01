const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const materialFileService = require("../services/materialFile.service");
const { sendFileDownload } = require("../utils/fileDownloadResponse");
const { publicBaseUrl } = require("../utils/publicUrl");

/**
 * 買家的教材下載，分成**兩支端點**。
 *
 * ## 為什麼要分兩支
 *
 *   GET /download/:materialId    授權 → 發一張一次性下載票，回 JSON
 *   GET /download/file/:token    兌換票 → 直接吐位元組
 *
 * 授權查詢要帶 `Authorization` header，而**瀏覽器的檔案下載動作帶不了 header**
 * （`window.open` / `location.href` 都不行）。所以授權與交付必須分開：
 * 前者由 fetch 帶 JWT 完成，後者用一張短命、單次、綁定使用者的票。
 *
 * ## 為什麼 signedUrl 是後端的絕對網址
 *
 * 前端的 `/api/backend/[...path]` proxy 用 `await upstream.text()` 讀回應 ——
 * 二進位檔案經過它會被當成文字解碼而毀損。因此下載連結**必須**直接指向 Backend，
 * 不能走 proxy。這不是效能取捨，是「檔案會壞掉」。
 *
 * ## 授權規則
 *
 * 只看「這個人有沒有一張包含這份教材的已核准訂單」，**不看 `materials.status`**：
 * 教材下架不代表已付款的買家失去他買到的東西。
 */

/** 授權失敗的稽核 meta。原因寫進 log，回給 client 的訊息不變。 */
async function denyDownload(req, materialId, reason) {
  await writeActivityLog({
    actorId: req.user.userId,
    actorRole: req.user.role,
    targetType: "material",
    targetId: materialId,
    action: "download.denied",
    meta: { reason },
  });
}

router.get("/:materialId", requireAuth, async (req, res) => {
  try {
    const materialId = String(req.params.materialId);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "download.attempted",
      meta: {},
    });

    const resolved = await materialFileService.resolveEntitledFile({
      userId: req.user.userId,
      materialId,
    });

    if (!resolved.ok) {
      await denyDownload(req, materialId, resolved.code);
      /*
       * 兩種失敗對使用者是完全不同的事，因此 status code 也不同：
       *   403 你沒有買（或訂單還沒過）—— 去買 / 去等審核
       *   409 你買了，但這份教材沒有可下載的檔案 —— 沒有任何動作能解決，要找客服
       * 舊實作在這裡只有 403，於是 milestone 之前建立的 legacy 教材
       * （只有 file_key 字串、沒有真檔）會讓已付款的買家看到「你沒有權限」。
       */
      const status = resolved.code === "not_entitled" ? 403 : 409;
      return res.status(status).json({ error: resolved.code, message: resolved.message });
    }

    const { rawToken, expiresInSeconds } = await materialFileService.issueDownloadToken({
      userId: req.user.userId,
      materialId,
      fileId: resolved.file.id,
    });

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "download.allowed",
      // fileId 讓稽核可以回答「這次下載拿到的是哪一版」。token 本身不記錄。
      meta: { orderId: resolved.orderId, fileId: resolved.file.id },
    });

    return res.json({
      materialId,
      signedUrl: `${publicBaseUrl()}/download/file/${rawToken}`,
      expiresInSeconds,
      filename: resolved.file.original_filename,
      sizeBytes: Number(resolved.file.size_bytes),
    });
  } catch (err) {
    console.error("download permission check failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /download/file/:token — 兌換下載票並吐出檔案。
 *
 * **刻意沒有 `requireAuth`**：這支端點是給瀏覽器直接導航用的，而導航帶不了
 * `Authorization` header。授權在上一支端點已經完成並固化進票裡 ——
 * 票是隨機值、只能用一次、五分鐘過期，而且綁死 userId + materialId + fileId。
 *
 * 兌換（檢查 + 標記已用）是單一句 UPDATE，因此同一張票被並行請求兩次時，
 * 只有一個會拿到檔案。
 */
router.get("/file/:token", async (req, res) => {
  try {
    const consumed = await materialFileService.consumeDownloadToken(String(req.params.token));
    if (!consumed.ok) {
      const status = consumed.code === "download_token_invalid" ? 404 : 409;
      return res.status(status).json({ error: consumed.code, message: consumed.message });
    }

    const { token, file } = consumed;

    const opened = await materialFileService.openFileForDelivery(file);
    if (!opened.ok) {
      return res
        .status(materialFileService.statusForCode(opened.code))
        .json({ error: opened.code, message: opened.message });
    }

    /*
     * 這裡**不**再寫一個 activity 事件。
     *
     * 授權事實已由上一支的 `download.allowed`（含 fileId）記錄；兌換是同一次下載的
     * 後半段。多開一個同義事件只會讓「下載了幾次」出現兩個都對又都不對的答案。
     * 票的兌換痕跡本身留在 `material_download_tokens.consumed_at`。
     */
    void token;

    sendFileDownload(res, { file, stream: opened.stream, sizeBytes: opened.sizeBytes });
  } catch (err) {
    console.error("material file delivery failed:", err);
    if (!res.headersSent) return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
