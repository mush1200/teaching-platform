/**
 * 教材本體檔案的型別／大小政策（canonical）。
 *
 * 規格見 `docs/material-file-storage-and-delivery.md` §13。這裡是唯一的定義來源：
 * route、測試、文件都從這裡讀，不得各自寫一份 allowlist。
 *
 * ## 三層驗證，缺一不可
 *
 *   1. **副檔名** —— client 提供，最容易偽造，但使用者體驗上必須先擋
 *   2. **宣告的 MIME**（`file.mimetype`）—— 也是 client 提供的，瀏覽器猜的
 *   3. **magic bytes** —— 檔案內容的前幾個位元組，client 無法只靠改名偽造
 *
 * 只驗 1 或 2 等於沒有驗證：兩者都由上傳端決定。第 3 層才是真正擋掉
 * 「把 .exe 改名成 .pdf」的那一層。
 *
 * ## 為什麼 OOXML 只驗到 "是 zip"
 *
 * `.pptx` / `.docx` / `.xlsx` 都是 zip 容器，magic bytes 與 `.zip` 完全相同（`PK\x03\x04`）。
 * 要再往下分辨必須解開 zip 讀 `[Content_Types].xml` —— 那需要引入解壓縮相依套件，
 * 而風險降低有限（三種都在 allowlist 內）。因此 MVP 到「是合法 zip 容器」為止，
 * 深入驗證列為 Future。
 */

/** 允許作為**教材本體**的型別。圖片不在其中 —— 單張圖不是教材，多張請打包 ZIP。 */
const ALLOWED_MATERIAL_FILE_TYPES = Object.freeze([
  Object.freeze({
    extension: ".pdf",
    label: "PDF",
    mimeTypes: Object.freeze(["application/pdf"]),
    signature: "pdf",
  }),
  Object.freeze({
    extension: ".zip",
    label: "ZIP",
    // 瀏覽器對 zip 的宣告值不一致，三種都實際出現過
    mimeTypes: Object.freeze([
      "application/zip",
      "application/x-zip-compressed",
      "multipart/x-zip",
    ]),
    signature: "zip",
  }),
  Object.freeze({
    extension: ".pptx",
    label: "PowerPoint (pptx)",
    mimeTypes: Object.freeze([
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]),
    signature: "zip",
  }),
  Object.freeze({
    extension: ".docx",
    label: "Word (docx)",
    mimeTypes: Object.freeze([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    signature: "zip",
  }),
  Object.freeze({
    extension: ".xlsx",
    label: "Excel (xlsx)",
    mimeTypes: Object.freeze([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
    signature: "zip",
  }),
]);

/**
 * 明確封鎖清單。
 *
 * allowlist 本來就會擋掉這些（不在名單內一律拒絕），列出來是為了**錯誤訊息**能說清楚
 * 「這個型別不是漏掉，是刻意不支援」，以及讓測試有明確的回歸對象。
 *
 *   可執行 / 腳本  —— 直接的惡意載體
 *   巨集 Office    —— .docm / .xlsm / .pptm
 *   舊版 Office    —— .doc / .xls / .ppt：二進位格式可挾帶巨集，解析器歷史漏洞多
 */
const EXPLICITLY_BLOCKED_EXTENSIONS = Object.freeze([
  ".exe", ".js", ".sh", ".bat", ".cmd", ".scr", ".com", ".msi",
  ".docm", ".xlsm", ".pptm",
  ".doc", ".xls", ".ppt",
]);

const ALLOWED_EXTENSIONS = Object.freeze(ALLOWED_MATERIAL_FILE_TYPES.map((t) => t.extension));

/** 給使用者看的格式說明，例如「PDF、ZIP、PPTX、DOCX、XLSX」。 */
const ALLOWED_EXTENSIONS_LABEL = ALLOWED_EXTENSIONS.map((ext) => ext.slice(1).toUpperCase()).join("、");

/** Magic bytes。只需要判斷「這是不是宣稱的那個容器」，不做完整解析。 */
const SIGNATURES = Object.freeze({
  // %PDF-
  pdf: [Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])],
  // PK\x03\x04（一般 zip）；PK\x05\x06 空 zip；PK\x07\x08 spanned
  zip: [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    Buffer.from([0x50, 0x4b, 0x07, 0x08]),
  ],
});

/** 判斷 magic bytes 需要的最少位元組數。 */
const SIGNATURE_PROBE_BYTES = 8;

function extensionOf(filename) {
  const name = String(filename ?? "");
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot).toLowerCase();
}

function findTypeByExtension(extension) {
  return ALLOWED_MATERIAL_FILE_TYPES.find((t) => t.extension === extension) ?? null;
}

/** `head` 是否符合該 signature 家族。 */
function matchesSignature(signatureName, head) {
  const candidates = SIGNATURES[signatureName] ?? [];
  return candidates.some((sig) => Buffer.isBuffer(head) && head.length >= sig.length && head.subarray(0, sig.length).equals(sig));
}

/**
 * 第一層 + 第二層：副檔名與宣告的 MIME。
 *
 * 在**開始寫入儲存之前**就要跑完，避免把一個一定會被拒絕的檔案先寫進磁碟。
 *
 * @returns {{valid: true, type: object} | {valid: false, code: string, message: string}}
 */
function validateDeclaredFile({ originalFilename, declaredMimeType }) {
  const extension = extensionOf(originalFilename);

  if (!extension) {
    return {
      valid: false,
      code: "unsupported_file_type",
      message: `檔案缺少副檔名。教材本體支援：${ALLOWED_EXTENSIONS_LABEL}。`,
    };
  }
  if (EXPLICITLY_BLOCKED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      code: "blocked_file_type",
      message: `基於安全考量，平台不接受 ${extension} 檔案作為教材本體。支援格式：${ALLOWED_EXTENSIONS_LABEL}。`,
    };
  }

  const type = findTypeByExtension(extension);
  if (!type) {
    return {
      valid: false,
      code: "unsupported_file_type",
      message: `不支援的教材格式（${extension}）。支援格式：${ALLOWED_EXTENSIONS_LABEL}。`,
    };
  }

  const declared = String(declaredMimeType ?? "").trim().toLowerCase();
  if (declared && !type.mimeTypes.includes(declared)) {
    return {
      valid: false,
      code: "mime_mismatch",
      message: `檔案內容型別（${declared}）與副檔名（${extension}）不一致，請確認檔案是否正確。`,
    };
  }

  return { valid: true, type };
}

/**
 * 第三層：magic bytes。
 *
 * @param {object} type `validateDeclaredFile` 回傳的型別定義
 * @param {Buffer} head 檔案開頭的位元組（至少 `SIGNATURE_PROBE_BYTES`）
 */
function validateFileSignature(type, head) {
  if (!matchesSignature(type.signature, head)) {
    return {
      valid: false,
      code: "signature_mismatch",
      message: `檔案內容與 ${type.extension} 格式不符（可能是改了副檔名的其他檔案）。`,
    };
  }
  return { valid: true };
}

/** 型別對外的 canonical MIME（存入 DB、下載時當 `Content-Type`），不採用 client 宣告值。 */
function canonicalMimeType(type) {
  return type.mimeTypes[0];
}

module.exports = {
  ALLOWED_MATERIAL_FILE_TYPES,
  ALLOWED_EXTENSIONS,
  ALLOWED_EXTENSIONS_LABEL,
  EXPLICITLY_BLOCKED_EXTENSIONS,
  SIGNATURE_PROBE_BYTES,
  extensionOf,
  validateDeclaredFile,
  validateFileSignature,
  matchesSignature,
  canonicalMimeType,
};
