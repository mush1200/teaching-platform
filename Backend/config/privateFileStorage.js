const path = require("path");
const { LocalPrivateFileStorage } = require("../storage/privateFileStorage");
const { S3PrivateFileStorage } = require("../storage/s3PrivateFileStorage");

/**
 * 私有檔案儲存的設定與 driver 選擇（**教材本體與付款憑證共用**）。
 *
 * ## Production fail-closed（本模組存在的主要理由）
 *
 * 兩種資產都不能在部署後靜默消失：
 *
 *   - **教材本體**是買家付費取得的商品。跑在 ephemeral filesystem 上（Render / Railway /
 *     容器重建等）時，local driver 會在下一次部署把已售出的教材一起刪掉，而且沒有任何
 *     錯誤訊息 —— 直到買家點下載才發現。
 *   - **付款憑證**是人工核帳的唯一證據，也是交易稽核紀錄。憑證掉了等於爭議發生時
 *     平台沒有任何可以佐證的東西。
 *
 * 因此兩者**必須共用同一個持久化保證**：`NODE_ENV=production` + `driver=local` 時，
 * 必須明確 opt-in（`PRIVATE_FILE_STORAGE_PATH` 指向持久化路徑，且
 * `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true`），否則**啟動即失敗**。
 * 這與 `utils/jwt.js` 對 `JWT_SECRET` 的處理是同一種取捨：寧可起不來，
 * 也不要在一個看起來正常、實際不安全的狀態下運行。
 *
 * 一個 driver、一組 fail-closed 檢查，不可能出現「教材 fail closed、憑證默默寫 ephemeral disk」。
 *
 * ## 兩個 driver，一組不變條件（`PRE-13`，2026-08-31）
 *
 * `s3` driver 於 `DEC-16` 隨 NT$0 MVP 決策加入
 * （見 `docs/mvp-nt0-deployment-decision-2026-08-31.md`）。它的存在**不放寬**上面那條
 * fail-closed —— 反過來，它讓 production 有一條**不需要**持久化磁碟的合法路徑：
 *
 *   driver=local  ＋ production → 仍然要求 PATH ＋ 明確 opt-in，否則拒絕啟動（未改動）
 *   driver=s3     ＋ production → 位元組本來就不在容器磁碟上，
 *                                 因此**不需要**、也**不應該**設定
 *                                 PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION
 *
 * ## 設定
 *
 *   PRIVATE_FILE_STORAGE_DRIVER   local（預設）| s3
 *
 *   —— driver=local 專用 ——
 *   PRIVATE_FILE_STORAGE_PATH     私有根目錄。預設 `Backend/private-storage`
 *   PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION  production 用 local 時的明確 opt-in
 *
 *   —— driver=s3 專用（五個全部必填，缺一即拒絕啟動）——
 *   PRIVATE_FILE_STORAGE_S3_BUCKET
 *   PRIVATE_FILE_STORAGE_S3_ENDPOINT
 *   PRIVATE_FILE_STORAGE_S3_REGION
 *   PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID       （secret）
 *   PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY   （secret）
 *   PRIVATE_FILE_STORAGE_S3_FORCE_PATH_STYLE    （選填，預設 true）
 *
 *   供應商選擇是設定，不是程式碼：B2 / R2 / Supabase / iDrive e2 都走同一支 driver。
 *   MAX_MATERIAL_FILE_BYTES       教材本體上限，預設 104857600（100 MB）
 *   MAX_PAYMENT_PROOF_BYTES       單張付款憑證上限，預設 10485760（10 MB）
 *   MAX_MATERIAL_MEDIA_IMAGE_BYTES 封面／詳情圖上限，預設 10485760（10 MB）
 *   MAX_MATERIAL_MEDIA_VIDEO_BYTES 試看影片上限，預設 83886080（80 MB）
 *   MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS  預設 300
 *
 * 三個 `PRIVATE_FILE_STORAGE_*` 變數各自都接受舊名 `MATERIAL_FILE_STORAGE_*` 作為別名 ——
 * 教材檔案 milestone 已經在文件與部署說明裡發出去了，改名不該讓既有設定失效。
 * 兩個都設且不同值時直接拒絕啟動，不猜哪個才是真的。
 */

const DEFAULT_MATERIAL_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MATERIAL_MEDIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MATERIAL_MEDIA_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
const DEFAULT_TOKEN_TTL_SECONDS = 300;

/**
 * 私有根目錄的預設值。
 *
 * **刻意不放在 `Backend/uploads/`** —— `index.js` 用 `express.static` 公開整個
 * `uploads/`，把付費教材或付款憑證放進去等於任何知道 URL 的人都能直接取得。
 */
const DEFAULT_ROOT = path.join(__dirname, "..", "private-storage");

function trimmed(value) {
  return String(value ?? "").trim();
}

/**
 * 讀一個設定值，接受 canonical 名稱與 legacy 別名。
 * 兩者都有值且不一致 → 丟例外（設定曖昧比設定缺漏更危險）。
 */
function readAliased(canonicalName, legacyName) {
  const canonical = trimmed(process.env[canonicalName]);
  const legacy = trimmed(process.env[legacyName]);
  if (canonical && legacy && canonical !== legacy) {
    throw new Error(
      `${canonicalName} and ${legacyName} are both set to different values ` +
        `(${JSON.stringify(canonical)} vs ${JSON.stringify(legacy)}). ` +
        `Keep only ${canonicalName}.`
    );
  }
  return canonical || legacy;
}

function readPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || trimmed(raw) === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number (got ${JSON.stringify(raw)})`);
  }
  return Math.floor(parsed);
}

/** 教材本體的單檔上限。 */
function readMaterialFileMaxBytes() {
  return readPositiveInt("MAX_MATERIAL_FILE_BYTES", DEFAULT_MATERIAL_MAX_BYTES);
}

/**
 * 單張付款憑證的上限。
 *
 * 與教材本體分開的旋鈕：憑證是手機拍的轉帳畫面，10 MB 綽綽有餘；
 * 用教材的 100 MB 當上限等於白白開一個把磁碟灌爆的入口。
 */
function readPaymentProofMaxBytes() {
  return readPositiveInt("MAX_PAYMENT_PROOF_BYTES", DEFAULT_PAYMENT_PROOF_MAX_BYTES);
}

/**
 * 行銷素材（封面／詳情圖／試看影片）的上限。
 *
 * 圖片與影片各一個旋鈕，數值**沿用搬入私有儲存之前的既有上限**（10 MB / 80 MB）——
 * 這條 milestone 改的是「存在哪裡、誰能看」，不是產品可以上傳多大的東西。
 */
function readMaterialMediaImageMaxBytes() {
  return readPositiveInt("MAX_MATERIAL_MEDIA_IMAGE_BYTES", DEFAULT_MATERIAL_MEDIA_IMAGE_MAX_BYTES);
}

function readMaterialMediaVideoMaxBytes() {
  return readPositiveInt("MAX_MATERIAL_MEDIA_VIDEO_BYTES", DEFAULT_MATERIAL_MEDIA_VIDEO_MAX_BYTES);
}

function readTokenTtlSeconds() {
  return readPositiveInt("MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS", DEFAULT_TOKEN_TTL_SECONDS);
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(trimmed(value).toLowerCase());
}

/**
 * 讀一個 `driver=s3` 的必填設定。缺漏一律 throw ——
 * 物件儲存設定不齊時「先起來再說」的結果是每一次上傳都在 runtime 失敗，
 * 而那時已經有人在用了。與 `JWT_SECRET` 是同一種取捨：寧可起不來。
 */
function requiredS3Env(name) {
  const value = trimmed(process.env[name]);
  if (!value) {
    throw new Error(
      `${name} is required when PRIVATE_FILE_STORAGE_DRIVER=s3. ` +
        "Refusing to start with an incomplete object storage configuration."
    );
  }
  return value;
}

/**
 * 建立 S3-compatible driver。
 *
 * `FORCE_PATH_STYLE` 預設 **true**，只有明確寫 false／0／no／off 才關掉 ——
 * 多數 S3 相容供應商（B2、R2）都吃 path-style，而 virtual-host style 需要 bucket
 * 名稱是合法 DNS label。預設走比較不會踩雷的那一邊。
 */
function buildS3Storage() {
  const rawForcePathStyle = trimmed(process.env.PRIVATE_FILE_STORAGE_S3_FORCE_PATH_STYLE);
  const forcePathStyle = rawForcePathStyle
    ? !["0", "false", "no", "off"].includes(rawForcePathStyle.toLowerCase())
    : true;

  return new S3PrivateFileStorage({
    bucket: requiredS3Env("PRIVATE_FILE_STORAGE_S3_BUCKET"),
    endpoint: requiredS3Env("PRIVATE_FILE_STORAGE_S3_ENDPOINT"),
    region: requiredS3Env("PRIVATE_FILE_STORAGE_S3_REGION"),
    accessKeyId: requiredS3Env("PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredS3Env("PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY"),
    forcePathStyle,
  });
}

/**
 * 讀設定並建立 driver。**任何不安全的組合都在這裡丟例外**（啟動時 fail fast）。
 */
function buildPrivateFileStorage() {
  const driver = (
    readAliased("PRIVATE_FILE_STORAGE_DRIVER", "MATERIAL_FILE_STORAGE_DRIVER") || "local"
  ).toLowerCase();
  const isProduction = trimmed(process.env.NODE_ENV).toLowerCase() === "production";

  if (driver === "s3") {
    return buildS3Storage();
  }

  if (driver !== "local") {
    // 認得的只有這兩個。拼錯 driver 名稱時**明確拒絕**，不要靜默退回 local ——
    // 靜默退回等於在 production 悄悄改用 ephemeral 磁碟，那正是這個模組要防的事。
    throw new Error(
      `PRIVATE_FILE_STORAGE_DRIVER=${JSON.stringify(driver)} is not implemented. ` +
        'Supported drivers are "local" and "s3".'
    );
  }

  const explicitPath = readAliased("PRIVATE_FILE_STORAGE_PATH", "MATERIAL_FILE_STORAGE_PATH");

  if (isProduction) {
    if (!explicitPath) {
      throw new Error(
        "PRIVATE_FILE_STORAGE_PATH is required in production when using the local driver. " +
          "Paid material files and payment proofs must live on persistent storage — refusing " +
          "to start with an implicit path that may be an ephemeral container filesystem."
      );
    }
    const allowLocal =
      isTruthy(process.env.PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION) ||
      isTruthy(process.env.MATERIAL_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION);
    if (!allowLocal) {
      throw new Error(
        "Refusing to start: PRIVATE_FILE_STORAGE_DRIVER=local in production. " +
          "Buyers' purchased files and payment proofs (the only evidence behind manual " +
          "payment review) would be lost if this filesystem is ephemeral. " +
          "Set PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true only when " +
          `${JSON.stringify(explicitPath)} is a persistent volume, or ship an object-storage driver.`
      );
    }
  }

  const root = explicitPath ? path.resolve(explicitPath) : DEFAULT_ROOT;
  // defaultNamespace 刻意留空：呼叫端必須明確說出自己在寫哪一種資產。
  return new LocalPrivateFileStorage({ root });
}

let cached = null;

/** 單例。第一次呼叫時建立（並執行上述驗證）。 */
function getPrivateFileStorage() {
  if (!cached) cached = buildPrivateFileStorage();
  return cached;
}

/** 測試用：重置單例（例如切換 env 之後）。 */
function resetPrivateFileStorageForTests() {
  cached = null;
}

module.exports = {
  DEFAULT_MATERIAL_MAX_BYTES,
  DEFAULT_PAYMENT_PROOF_MAX_BYTES,
  DEFAULT_MATERIAL_MEDIA_IMAGE_MAX_BYTES,
  DEFAULT_MATERIAL_MEDIA_VIDEO_MAX_BYTES,
  DEFAULT_TOKEN_TTL_SECONDS,
  DEFAULT_ROOT,
  readMaterialFileMaxBytes,
  readPaymentProofMaxBytes,
  readMaterialMediaImageMaxBytes,
  readMaterialMediaVideoMaxBytes,
  readTokenTtlSeconds,
  buildPrivateFileStorage,
  getPrivateFileStorage,
  resetPrivateFileStorageForTests,
};
