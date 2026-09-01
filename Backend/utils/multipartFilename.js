/**
 * Multipart 上傳檔名的編碼修正（`DX-14`）。
 *
 * ## 問題
 *
 * `busboy` 解析 `Content-Disposition` 的 `filename` 參數時，預設 charset 是 **latin1**
 * （`busboy/lib/index.js` 的 `defParamCharset: undefined` → `multipart.js` 走預設 decoder）。
 * 因此瀏覽器送出的 UTF-8 檔名到了 `req.file.originalname` 已經是**逐位元組被當成 latin1 字元**
 * 的字串：
 *
 * ```text
 * 匯款證明-2026年8月27日.png   →   å¯æ¬¾è­æ-2026å¹´8æ27æ¥.png
 * ```
 *
 * 這個值會被原封不動寫進 DB（`original_filename`），所以**壞在寫入當下**，
 * 之後的交付端只是忠實地把壞值編碼出去。真實資料佐證見 `DX-14` 的 evidence。
 *
 * ## 為什麼不在 busboy 層修
 *
 * `busboy` 支援 `defParamCharset: 'utf8'`，但 **multer 2.0.2 不轉傳這個選項** ——
 * `multer/lib/make-middleware.js` 只給 busboy `{ headers, limits, preservePath }`。
 * 要走那條路就得 monkey-patch multer 內部，比在邊界修正更脆弱。
 *
 * ## 為什麼**不是**無條件 `latin1 → utf8`
 *
 * 無條件轉換會破壞本來就正確的檔名。這裡的判斷是**兩道都必須成立**才轉：
 *
 *   1. **字串的每個碼點都 ≤ 0xFF** —— 這是「它其實是一串 bytes」的必要特徵。
 *      只要出現任何 > 0xFF 的碼點，它就不可能是 latin1 解出來的，直接原樣返回
 *      （這也讓本函式**冪等**：轉換過的中文檔名第二次呼叫會被跳過）。
 *   2. **那串 bytes 是合法的 UTF-8** —— 用 `TextDecoder(..., { fatal: true })` 嚴格驗。
 *      不合法就原樣返回：那代表它真的是 latin1／cp1252 文字，硬轉只會轉成亂碼。
 *
 * ### 純 ASCII 一定不受影響
 *
 * ASCII 的每個位元組都 < 0x80，是合法 UTF-8，且解碼結果等於自己 ——
 * 因此 `invoice.png` 進出**完全相同**，不是「剛好看起來一樣」。
 *
 * ### 不可能憑空生出注入字元
 *
 * UTF-8 的多位元組序列**每個位元組都 ≥ 0x80**，因此解碼永遠不會產生新的 ASCII 字元。
 * 換句話說本函式無法製造出原本不存在的 `/`、`\`、NUL、CR、LF 或 `..`。
 * ASCII 字元則原樣通過。這個性質由測試釘住。
 *
 * ## 這裡**不做**什麼
 *
 * 不 slugify、不轉寫、不強制 ASCII、不改副檔名、不加時間戳、不重新命名。
 * 檔名只是**呈現用的 metadata**：
 *
 *   * 儲存路徑一律由 `storage.put()` 產生的 `storage_key` 決定，檔名碰不到它；
 *   * HTTP header 的安全性由 `utils/fileDownloadResponse.js` 的 `contentDisposition()`
 *     負責（它已經會處理引號、反斜線、路徑分隔符與控制字元）。
 *     **不在這裡另造第二套 sanitization。**
 */

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true });

/**
 * 把 multer 交出來的 `originalname` 還原成正確的 Unicode 檔名。
 *
 * 不需要修正時**回傳完全相同的字串**（byte-equivalent），不做任何其他變動。
 *
 * @param {unknown} originalname `req.file.originalname` / `req.files[i].originalname`
 * @returns {string} 還原後的檔名；非字串或空字串一律回傳空字串
 */
function normalizeMultipartFilename(originalname) {
  if (typeof originalname !== "string" || originalname === "") return "";

  // 條件 1：出現任何 > 0xFF 的碼點 → 它不是 latin1 解出來的，原樣返回（也保證冪等）。
  for (let i = 0; i < originalname.length; i += 1) {
    if (originalname.charCodeAt(i) > 0xff) return originalname;
  }

  const bytes = Buffer.from(originalname, "latin1");
  try {
    // 條件 2：必須是合法 UTF-8，否則它就真的是 latin1 文字。
    return UTF8_STRICT.decode(bytes);
  } catch {
    return originalname;
  }
}

/**
 * Express middleware：就地修正 `req.file` / `req.files` 的 `originalname`。
 *
 * **必須掛在 multer 之後、任何讀取 `originalname` 的東西之前** ——
 * 這樣下游（route handler 與 service）看到的一律是已還原的值，
 * 不需要每個消費端各自記得轉換一次。
 *
 * 使用 custom storage engine 的路徑（`routes/teacherUpload.js`）在 multer 之後才拿得到
 * 檔案，`_handleFile` 反而更早執行，因此那兩處直接呼叫 `normalizeMultipartFilename()`。
 */
function normalizeUploadedFilenames(req, _res, next) {
  const fix = (file) => {
    if (file && typeof file.originalname === "string") {
      file.originalname = normalizeMultipartFilename(file.originalname);
    }
  };

  if (req.file) fix(req.file);
  if (Array.isArray(req.files)) {
    req.files.forEach(fix);
  } else if (req.files && typeof req.files === "object") {
    // `.fields()` 形式：{ fieldname: File[] }
    Object.values(req.files).forEach((group) => {
      if (Array.isArray(group)) group.forEach(fix);
    });
  }
  next();
}

module.exports = { normalizeMultipartFilename, normalizeUploadedFilenames };
