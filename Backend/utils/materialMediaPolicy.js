/**
 * 教材**行銷素材**（封面／詳情圖／試看影片）的型別與大小政策（canonical）。
 *
 * 這裡是唯一的定義來源：route、服務層、測試、文件都從這裡讀，不得各自寫一份 allowlist。
 * 姊妹檔：`utils/materialFilePolicy.js`（教材本體）、`utils/paymentProofPolicy.js`（付款憑證）。
 * 三者刻意分開 —— 允許的東西完全不同，合併成一份只會讓「憑證能不能是 MP4」這種
 * 問題變得需要讀程式碼才能回答。
 *
 * ## 三層驗證，缺一不可
 *
 *   1. **副檔名** —— client 提供，最容易偽造，但使用者體驗上必須先擋
 *   2. **宣告的 MIME**（`file.mimetype`）—— 也是 client 提供的，瀏覽器猜的
 *   3. **magic bytes** —— 檔案內容的前幾個位元組，client 無法只靠改名偽造
 *
 * 搬進私有儲存之前這支端點**只驗第 2 層**（multer 的 `fileFilter` 讀 `file.mimetype`），
 * 也就是把任意檔案改名並宣告成 `image/png` 就能寫進伺服器磁碟，而且落在
 * `express.static` 無條件公開的目錄底下。第 3 層才是真正的把關。
 *
 * ## kind 與型別是綁在一起的
 *
 * `cover` / `detail` 是圖片，`demo` 是影片。把 kind 當成一個獨立於型別的標籤
 * （「上傳什麼都行，kind 只是分類」）會讓「封面是一支 80 MB 的 MP4」變成合法輸入，
 * 而公開商品頁的 `<img>` 會靜靜地顯示一個破圖。
 */

const KINDS = Object.freeze(["cover", "detail", "demo"]);

/** 圖片家族 —— `cover` 與 `detail` 用。 */
const IMAGE_TYPES = Object.freeze([
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
    extensions: Object.freeze([".gif"]),
    label: "GIF",
    mimeTypes: Object.freeze(["image/gif"]),
    signature: "gif",
  }),
  Object.freeze({
    extensions: Object.freeze([".webp"]),
    label: "WebP",
    mimeTypes: Object.freeze(["image/webp"]),
    signature: "webp",
  }),
]);

/** 影片家族 —— `demo` 用。 */
const VIDEO_TYPES = Object.freeze([
  Object.freeze({
    extensions: Object.freeze([".mp4", ".m4v"]),
    label: "MP4",
    mimeTypes: Object.freeze(["video/mp4"]),
    signature: "mp4",
  }),
  Object.freeze({
    extensions: Object.freeze([".webm"]),
    label: "WebM",
    mimeTypes: Object.freeze(["video/webm"]),
    signature: "webm",
  }),
]);

const TYPES_BY_KIND = Object.freeze({
  cover: IMAGE_TYPES,
  detail: IMAGE_TYPES,
  demo: VIDEO_TYPES,
});

const IMAGE_EXTENSIONS_LABEL = IMAGE_TYPES.map((t) => t.label).join("／");
const VIDEO_EXTENSIONS_LABEL = VIDEO_TYPES.map((t) => t.label).join("／");

const LABEL_BY_KIND = Object.freeze({
  cover: IMAGE_EXTENSIONS_LABEL,
  detail: IMAGE_EXTENSIONS_LABEL,
  demo: VIDEO_EXTENSIONS_LABEL,
});

/**
 * Magic bytes。
 *
 * 每一條是 `{ offset, bytes }`：
 *   - WebP 的識別字在**第 8 個位元組**（`RIFF....WEBP`），只比對開頭前綴會把
 *     任何 RIFF 容器（例如 .wav）當成 WebP 放行。
 *   - MP4 的 `ftyp` box 在**第 4 個位元組**，前四個位元組是 box 長度（可變），
 *     所以不能用單純的前綴比對。
 */
const SIGNATURES = Object.freeze({
  // FF D8 FF —— 所有 JPEG 變體（JFIF / Exif / SPIFF）共用的開頭
  jpeg: [[{ offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) }]],
  // 89 50 4E 47 0D 0A 1A 0A
  png: [[{ offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]],
  // GIF87a / GIF89a 兩種版本都合法
  gif: [
    [{ offset: 0, bytes: Buffer.from("GIF87a", "ascii") }],
    [{ offset: 0, bytes: Buffer.from("GIF89a", "ascii") }],
  ],
  // "RIFF" ... "WEBP"（兩段都要中）
  webp: [
    [
      { offset: 0, bytes: Buffer.from("RIFF", "ascii") },
      { offset: 8, bytes: Buffer.from("WEBP", "ascii") },
    ],
  ],
  // ISO BMFF：box size(4) + "ftyp"。brand 不再細分 —— isom/mp42/M4V/avc1 等太多，
  // 而 `ftyp` 已經足以擋掉「改了副檔名的其他檔案」這個實際威脅。
  mp4: [[{ offset: 4, bytes: Buffer.from("ftyp", "ascii") }]],
  // EBML header —— WebM 與 Matroska 共用
  webm: [[{ offset: 0, bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]) }]],
});

/**
 * 判斷 magic bytes 需要的最少位元組數。
 * 最遠的一段是 WebP 的 offset 8 + 4 bytes = 12。
 */
const SIGNATURE_PROBE_BYTES = 12;

function isValidKind(kind) {
  return KINDS.includes(String(kind ?? ""));
}

function extensionOf(filename) {
  const name = String(filename ?? "");
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot).toLowerCase();
}

function typesForKind(kind) {
  return TYPES_BY_KIND[String(kind ?? "")] ?? null;
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
 * 第一層 + 第二層：kind、副檔名與宣告的 MIME。
 *
 * 在**開始寫入儲存之前**就要跑完，避免把一個一定會被拒絕的檔案先寫進磁碟。
 *
 * @returns {{valid: true, type: object} | {valid: false, code: string, message: string}}
 */
function validateDeclaredFile({ kind, originalFilename, declaredMimeType }) {
  if (!isValidKind(kind)) {
    return {
      valid: false,
      code: "invalid_media_kind",
      message: `kind 必須是 ${KINDS.join(" / ")} 其中之一。`,
    };
  }

  const allowed = typesForKind(kind);
  const label = LABEL_BY_KIND[kind];
  const extension = extensionOf(originalFilename);
  const byExtension = extension ? allowed.find((t) => t.extensions.includes(extension)) : null;

  if (!byExtension) {
    return {
      valid: false,
      code: "unsupported_media_type",
      message:
        kind === "demo"
          ? `試看影片只接受 ${label} 檔。`
          : `圖片只接受 ${label} 檔。`,
    };
  }

  const declared = String(declaredMimeType ?? "").trim().toLowerCase();
  if (!declared) {
    return {
      valid: false,
      code: "unsupported_media_type",
      message: `無法判斷檔案型別，只接受 ${label}。`,
    };
  }
  if (!byExtension.mimeTypes.includes(declared)) {
    return {
      valid: false,
      code: "media_mime_mismatch",
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
      code: "media_signature_mismatch",
      message: `檔案內容不是有效的 ${type.label} 檔（可能是改了副檔名的其他檔案）。`,
    };
  }
  return { valid: true };
}

/** 型別對外的 canonical MIME（存入 DB、交付時當 `Content-Type`），不採用 client 宣告值。 */
function canonicalMimeType(type) {
  return type.mimeTypes[0];
}

module.exports = {
  KINDS,
  IMAGE_TYPES,
  VIDEO_TYPES,
  TYPES_BY_KIND,
  LABEL_BY_KIND,
  SIGNATURE_PROBE_BYTES,
  isValidKind,
  extensionOf,
  typesForKind,
  matchesSignature,
  validateDeclaredFile,
  validateFileSignature,
  canonicalMimeType,
};
