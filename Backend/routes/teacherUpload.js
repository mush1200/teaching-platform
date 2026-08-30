const express = require("express");
const multer = require("multer");
const { requireAuth, requireRole } = require("../middlewares/auth");
const materialFileService = require("../services/materialFile.service");
const materialMediaService = require("../services/materialMedia.service");
const { writeActivityLog } = require("../utils/activityLog");
const { readMaxBytes } = require("../config/materialFileStorage");
const {
  readMaterialMediaImageMaxBytes,
  readMaterialMediaVideoMaxBytes,
} = require("../config/privateFileStorage");
const policy = require("../utils/materialFilePolicy");
const mediaPolicy = require("../utils/materialMediaPolicy");

const router = express.Router();
const { requireActiveAccount } = require("../middlewares/accountStatus");
const { normalizeMultipartFilename } = require("../utils/multipartFilename");

/**
 * 教材**行銷素材**的上傳（封面／詳情圖／試看影片）。
 *
 * ## 為什麼不再用 `multer.diskStorage` 寫進 `uploads/`
 *
 * `uploads/` 由 `express.static` 無條件公開，而 static 沒有「條件」這種東西 ——
 * 檔案一旦在那裡，未上架與已下架教材的素材就永久匿名可取，只靠隨機檔名保護
 * （`SEC-02`）。改用與教材本體相同的自訂 storage engine：multipart 串流直接交給
 * `materialMediaService.storeUpload()`，一路串流進**私有**儲存，中途完成大小上限、
 * magic bytes 檢查與 SHA-256 計算，不落公開目錄、不進記憶體
 * （試看影片上限 80 MB，緩衝進記憶體是不可接受的）。
 *
 * ## 回傳仍然是 URL
 *
 * 教材本體回 `fileId`，這裡回 `url`。差別不是疏忽：`cover_image_url` 等欄位的既有
 * 契約就是 http(s) URL 字串，而且創作者**可以**改填外部 CDN 連結。改成回 id 會讓
 * 「平台素材」與「外部連結」變成兩種不相容的欄位型別，等於為了改儲存位置去動
 * 一個跟安全無關的產品契約。URL 指向的是需要授權判斷的交付端點，不是 static 檔案。
 *
 * POST /teacher/uploads/material-media?kind=cover|detail|demo   multipart field: file
 */
router.post(
  "/uploads/material-media",
  requireAuth,
  requireRole("teacher"),
  requireActiveAccount,
  (req, res, next) => {
    /*
     * kind 不合法時**直接拒絕**，不再默默退回 `cover`。舊行為讓
     * `?kind=video`（打錯字）變成一次成功的封面上傳，創作者要到商品頁才發現。
     */
    const kind = String(req.query.kind ?? "cover");
    if (!mediaPolicy.isValidKind(kind)) {
      return res.status(400).json({
        code: "invalid_media_kind",
        message: `kind 必須是 ${mediaPolicy.KINDS.join(" / ")} 其中之一。`,
      });
    }

    const maxBytes =
      kind === "demo" ? readMaterialMediaVideoMaxBytes() : readMaterialMediaImageMaxBytes();
    let serviceResult = null;

    const upload = multer({
      limits: { files: 1, fileSize: maxBytes + 1 },
      storage: {
        _handleFile(_req, file, cb) {
          materialMediaService
            .storeUpload({
              readable: file.stream,
              kind,
              // DX-14：custom storage engine 比 post-multer middleware 更早執行，因此在此還原。
              originalFilename: normalizeMultipartFilename(file.originalname),
              declaredMimeType: file.mimetype || "",
              uploadedBy: req.user.userId,
            })
            .then((result) => {
              serviceResult = result;
              cb(null, {});
            })
            .catch(cb);
        },
        _removeFile(_req, _file, cb) {
          // 服務層失敗時已經自己清掉暫存與物件；這裡沒有額外的東西要收。
          cb(null);
        },
      },
    }).single("file");

    upload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          const mb = Math.floor(maxBytes / (1024 * 1024));
          return res.status(413).json({
            code: "media_too_large",
            message: `檔案超過上限（最大 ${mb} MB）。`,
          });
        }
        return res
          .status(400)
          .json({ code: "upload_failed", message: err.message || "upload failed" });
      }
      req.materialMediaResult = serviceResult;
      next();
    });
  },
  (req, res) => {
    const result = req.materialMediaResult;
    if (!result) {
      return res.status(400).json({
        code: "file_required",
        message: "請選擇檔案（multipart 欄位：file）。",
      });
    }
    if (!result.ok) {
      return res
        .status(materialMediaService.statusForCode(result.code))
        .json({ code: result.code, message: result.message });
    }

    /*
     * `filename` 沿用既有回應形狀（前端與 Postman 都讀得到），但值改成
     * **原始檔名**而不是磁碟上的名字 —— 私有儲存的物件名是 UUID，
     * 對外揭露它等於把 storage key 洩漏出去。
     */
    res.status(201).json({
      url: result.media.url,
      mediaId: result.media.id,
      kind: result.media.kind,
      filename: result.media.originalFilename,
      mimeType: result.media.mimeType,
      sizeBytes: result.media.sizeBytes,
    });
  }
);

/**
 * 教材**本體**檔案的上傳（與上面的行銷素材完全不同的東西）。
 *
 * ## 為什麼不用 `multer.diskStorage`
 *
 * 行銷素材落在公開的 `uploads/`，教材本體不能 —— 那是買家付費才拿得到的商品。
 * 這裡改用自訂的 multer storage engine，把 multipart 串流**直接**交給
 * `materialFileService.storeUpload()`：檔案一路串流進私有儲存，
 * 中途完成大小上限、magic bytes 檢查與 SHA-256 計算，不落公開目錄、不進記憶體。
 *
 * ## upload-first
 *
 * 回傳的是 `fileId`，**不是** URL 也不是 storage key。創作者接著在建立／更新教材時
 * 帶上這個 id 把它變成候選檔。沒被認領的上傳由
 * `scripts/cleanup-material-files.js` 定期清理。
 *
 * POST /teacher/uploads/material-file   multipart field name: file
 */
router.post(
  "/uploads/material-file",
  requireAuth,
  requireRole("teacher"),
  requireActiveAccount,
  (req, res, next) => {
    const maxBytes = readMaxBytes();
    let serviceResult = null;

    /*
     * 自訂 storage engine。`file.stream` 就是 multipart 的原始串流，
     * 直接餵給服務層 —— 這是「不緩衝整個檔案」的關鍵。
     *
     * 服務層的業務錯誤（型別不符、太大）不透過 multer 的錯誤通道丟出來，
     * 而是存進 `serviceResult`：multer 的錯誤處理只認得它自己的錯誤碼，
     * 讓業務錯誤走同一條路只會讓兩種失敗混在一起難以分辨。
     */
    const upload = multer({
      limits: { files: 1, fileSize: maxBytes + 1 },
      storage: {
        _handleFile(_req, file, cb) {
          materialFileService
            .storeUpload({
              readable: file.stream,
              // DX-14：custom storage engine 比 post-multer middleware 更早執行，因此在此還原。
              originalFilename: normalizeMultipartFilename(file.originalname),
              declaredMimeType: file.mimetype || "",
              uploadedBy: req.user.userId,
            })
            .then((result) => {
              serviceResult = result;
              cb(null, {});
            })
            .catch(cb);
        },
        _removeFile(_req, _file, cb) {
          // 服務層失敗時已經自己清掉暫存與物件；這裡沒有額外的東西要收。
          cb(null);
        },
      },
    }).single("file");

    upload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          const mb = Math.floor(maxBytes / (1024 * 1024));
          return res.status(413).json({
            code: "file_too_large",
            message: `檔案超過上限（最大 ${mb} MB）。`,
          });
        }
        return res.status(400).json({ code: "upload_failed", message: err.message || "upload failed" });
      }
      req.materialFileResult = serviceResult;
      next();
    });
  },
  async (req, res) => {
    const result = req.materialFileResult;
    if (!result) {
      return res.status(400).json({
        code: "file_required",
        message: `請選擇教材檔案（支援 ${policy.ALLOWED_EXTENSIONS_LABEL}）。`,
      });
    }
    if (!result.ok) {
      return res
        .status(materialFileService.statusForCode(result.code))
        .json({ code: result.code, message: result.message });
    }

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material_file",
      targetId: result.file.id,
      action: "material.file_uploaded",
      // 不記 storage key。檔名／大小足以做稽核，key 是儲存後端的內部定位資訊。
      meta: {
        originalFilename: result.file.originalFilename,
        mimeType: result.file.mimeType,
        sizeBytes: result.file.sizeBytes,
      },
    });

    res.status(201).json({
      fileId: result.file.id,
      originalFilename: result.file.originalFilename,
      mimeType: result.file.mimeType,
      sizeBytes: result.file.sizeBytes,
    });
  }
);

module.exports = router;
