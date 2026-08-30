/**
 * 付款憑證的型別／大小政策（canonical）。
 *
 * 這裡是唯一的定義來源：route、服務層、測試、文件都從這裡讀，不得各自寫一份 allowlist。
 * 教材本體的對應檔案是 `utils/materialFilePolicy.js` —— 兩者刻意分開，因為**允許的東西
 * 完全相反**：教材是文件容器（PDF / ZIP / OOXML），憑證只能是圖片。
 *
 * ## 三層驗證，缺一不可
 *
 *   1. **副檔名** —— client 提供，最容易偽造，但使用者體驗上必須先擋
 *   2. **宣告的 MIME**（`file.mimetype`）—— 也是 client 提供的，瀏覽器猜的
 *   3. **magic bytes** —— 檔案內容的前幾個位元組，client 無法只靠改名偽造
 *
 * 改名之前這支端點**只驗第 2 層**（multer 的 `fileFilter` 讀 `file.mimetype`），
 * 也就是把 `.exe` 改名並宣告成 `image/png` 就能寫進伺服器磁碟。第 3 層才是真正的把關。
 *
 * ## 為什麼不開 PDF
 *
 * 產品現況（前端 `ACCEPTED_TYPES`、後端 `ALLOWED_PROOF_TYPES`、UI 文案）三處一致
 * 只接受 JPG / PNG / WebP。開 PDF 是產品決策不是安全決策，而且 Admin 審核 UI 是
 * `<img>` inline preview —— 開了會出現「上傳成功但審核者看不到」。維持現況。
 */

/** 允許作為**付款憑證**的型別。只有圖片。 */
const ALLOWED_PROOF_TYPES = Object.freeze([
  Object.freeze({
    extensions: Object.freeze([".jpg", ".jpeg"]),
    label: "JPG",
    mimeTypes: Object.freeze(["image/jpeg"]),
    signature: "jpeg",
  }),
  Object.freeze({
    extensions: Object.freeze([".png"]),
    label: "PNG",
    mimeTypes: Object.freeze(["image/png"]),
    signature: "png",
  }),
  Object.freeze({
    extensions: Object.freeze([".webp"]),
    label: "WebP",
    mimeTypes: Object.freeze(["image/webp"]),
    signature: "webp",
  }),
]);

const ALLOWED_EXTENSIONS = Object.freeze(ALLOWED_PROOF_TYPES.flatMap((t) => [...t.extensions]));
const ALLOWED_MIME_TYPES = Object.freeze(ALLOWED_PROOF_TYPES.flatMap((t) => [...t.mimeTypes]));

/** 給使用者看的格式說明。 */
const ALLOWED_EXTENSIONS_LABEL = ALLOWED_PROOF_TYPES.map((t) => t.label).join("、");

/**
 * Magic bytes。
 *
 * 每一條是 `{ offset, bytes }` —— WebP 的識別字在**第 8 個位元組**（`RIFF....WEBP`），
 * 只比對開頭前綴會漏掉它，或反過來把任何 RIFF 容器（例如 .wav）當成 WebP 放行。
 */
const SIGNATURES = Object.freeze({
  // FF D8 FF —— 所有 JPEG 變體（JFIF / Exif / SPIFF）共用的開頭
  jpeg: [[{ offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) }]],
  // 89 50 4E 47 0D 0A 1A 0A
  png: [[{ offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]],
  // "RIFF" ... "WEBP"（兩段都要中）
  webp: [
    [
      { offset: 0, bytes: Buffer.from("RIFF", "ascii") },
      { offset: 8, bytes: Buffer.from("WEBP", "ascii") },
    ],
  ],
});

/** 判斷 magic bytes 需要的最少位元組數（WebP 的第二段結束於第 12 byte）。 */
const SIGNATURE_PROBE_BYTES = 12;

function extensionOf(filename) {
  const name = String(filename ?? "");
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot).toLowerCase();
}

function findTypeByExtension(extension) {
  return ALLOWED_PROOF_TYPES.find((t) => t.extensions.includes(extension)) ?? null;
}

function findTypeByMimeType(mimeType) {
  const declared = String(mimeType ?? "").trim().toLowerCase();
  return ALLOWED_PROOF_TYPES.find((t) => t.mimeTypes.includes(declared)) ?? null;
}

/** `head` 是否符合該 signature 家族（任一組 pattern 全中即可）。 */
function matchesSignature(signatureName, head) {
  if (!Buffer.isBuffer(head)) return false;
  const groups = SIGNATURES[signatureName] ?? [];
  return groups.some((parts) =>
    parts.every(
      (part) =>
        head.length >= part.offset + part.bytes.length &&
        head.subarray(part.offset, part.offset + part.bytes.length).equals(part.bytes)
    )
  );
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
  const byExtension = extension ? findTypeByExtension(extension) : null;

  if (!byExtension) {
    return {
      valid: false,
      code: "unsupported_proof_type",
      message: `付款憑證只接受 ${ALLOWED_EXTENSIONS_LABEL} 圖片檔（${ALLOWED_EXTENSIONS.join("／")}）。`,
    };
  }

  const declared = String(declaredMimeType ?? "").trim().toLowerCase();
  if (!declared) {
    return {
      valid: false,
      code: "unsupported_proof_type",
      message: `無法判斷檔案型別，付款憑證只接受 ${ALLOWED_EXTENSIONS_LABEL} 圖片檔。`,
    };
  }
  if (!byExtension.mimeTypes.includes(declared)) {
    return {
      valid: false,
      code: "proof_mime_mismatch",
      message: `檔案內容型別（${declared}）與副檔名（${extension}）不一致，請確認檔案是否正確。`,
    };
  }

  return { valid: true, type: byExtension };
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
      code: "proof_signature_mismatch",
      message: `檔案內容不是有效的 ${type.label} 圖片（可能是改了副檔名的其他檔案）。`,
    };
  }
  return { valid: true };
}

/** 型別對外的 canonical MIME（存入 DB、讀取時當 `Content-Type`），不採用 client 宣告值。 */
function canonicalMimeType(type) {
  return type.mimeTypes[0];
}

module.exports = {
  ALLOWED_PROOF_TYPES,
  ALLOWED_EXTENSIONS,
  ALLOWED_EXTENSIONS_LABEL,
  ALLOWED_MIME_TYPES,
  SIGNATURE_PROBE_BYTES,
  extensionOf,
  findTypeByMimeType,
  validateDeclaredFile,
  validateFileSignature,
  matchesSignature,
  canonicalMimeType,
};
