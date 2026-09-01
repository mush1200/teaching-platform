const crypto = require("crypto");
const { PassThrough } = require("stream");
const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { isValidStorageKey, newStorageKey } = require("./privateFileStorage");

/**
 * 私有檔案的 **S3-compatible object storage driver**（`PRE-13`，2026-08-31）。
 *
 * ## 為什麼有這一支
 *
 * `LocalPrivateFileStorage` 需要一顆真正的持久化磁碟，而**所有免費 PaaS 方案都不提供**
 * （Render 官方明文 "Free web services cannot use persistent disks"；Railway／Fly.io／
 * Koyeb／Northflank 的免費層同樣不支援 volume）。`config/privateFileStorage.js` 的
 * production fail-closed 因此會在免費方案上直接拒絕啟動 —— 那是**正確**的行為，
 * 不是要繞過的東西。要在 NT$0 的前提下跑起來，唯一誠實的解法是讓位元組離開容器磁碟。
 *
 * 決策見 `docs/mvp-nt0-deployment-decision-2026-08-31.md`（`DEC-16`）。
 *
 * ## 為什麼是 generic S3 而不是「B2 driver」或「R2 driver」
 *
 * 供應商選擇是**營運決策**，不該被編譯進程式碼。Backblaze B2、Cloudflare R2、
 * Supabase Storage、iDrive e2 全都講同一套 S3 API，差別只在 endpoint／region／
 * 憑證這五個環境變數。把它寫成 generic driver 的結果是：**換供應商是設定變更，
 * 不是程式碼變更** —— 而這正是 MVP 階段最需要的那種可逆性
 * （B2 的 egress 額度若成為瓶頸，切到 R2 不需要動任何一行）。
 *
 * ## 這一層**不做**授權
 *
 * 與 `LocalPrivateFileStorage` 完全一致：它只負責「怎麼安全地把位元組放進去、取回來」。
 * 教材看購買授權、憑證看訂單擁有權、素材看所屬教材的 status —— 三種授權模型都留在
 * 各自的服務層，這支 driver 對它們一無所知。**bucket 必須是 private**，Backend 是
 * 唯一的授權入口；任何把 bucket 改成 public 的設定都會讓上述三個授權模型同時失效。
 *
 * ## 行為必須與 local driver **逐項等價**
 *
 * 這不是「大致相容」。以下每一條都是刻意對齊的，`tests/privateFileStorageParity.test.js`
 * 以同一組斷言同時跑兩個 driver：
 *
 *   put()             key 由這一層產生；串流計算 SHA-256 與大小；空檔案丟 EMPTY_FILE
 *                     並清掉殘骸（local 刪 .part 檔，這裡刪已上傳的物件）
 *   openReadStream()  **同步**回傳 Readable；不合法 key **同步** throw；
 *                     物件不存在時由 stream 發出 'error'（對齊 fs 的 ENOENT 行為）
 *   stat()            任何失敗都回 { exists: false, sizeBytes: 0 }（含不合法 key）
 *   exists()          = stat().exists
 *   delete()          不合法 key → throw；物件不存在 → false；真的刪掉 → true
 *
 * ## 為什麼 `openReadStream()` 必須是同步的
 *
 * 呼叫端（`materialFile.service.js:535`、`paymentProof.service.js:383`、
 * `materialMedia.service.js:404,414`）都是直接把回傳值放進物件字面值，沒有 await。
 * S3 的 GetObject 是非同步的，所以這裡**立刻**回一個 `PassThrough`，再把稍後拿到的
 * response body 接上去。錯誤一律轉成該 stream 的 'error' 事件 ——
 * `utils/fileDownloadResponse.js` 已經在監聽它，不需要任何呼叫端改動。
 *
 * ## Range 與那個「probe open」
 *
 * `routes/materials.js` 的素材端點會先 `openForDelivery(media, null)` 取得 totalBytes、
 * 立刻 `probe.stream.destroy()`，再帶著 Range 開第二次。對 local driver 那只是開關一次
 * 檔案句柄；對 object storage 那會是一次真實的 GetObject。
 *
 * 因此這裡用 `AbortController`：**stream 在 GetObject 尚未回來之前就被 destroy 的話，
 * 請求會被中止，位元組從來不會離開供應商** —— probe 的成本降到只剩前面那一次
 * HeadObject。這是為了配合既有 business logic 而做的 driver 層最佳化，
 * **沒有修改任何 business logic**。
 *
 * ## 不變條件（與 local driver 共用，不得放寬）
 *
 *   1. storage key 一律由 `newStorageKey()` 產生（namespace + UUID），永不接受 caller 提供的路徑。
 *   2. 讀寫前一律以 `isValidStorageKey()` 驗形狀 —— 這是 path traversal 的根本防線。
 *      key 的形狀是 `^<已登記 namespace>/<UUID>$`，結構上裝不下 `..`、前導 `/` 或任何
 *      使用者可控字串，所以 object key 可以直接用 storage key，不需要第二套跳脫。
 *   3. 磁碟／物件上不留任何使用者可控字串：檔名是 UUID、無副檔名，原始檔名只是 DB metadata。
 *   4. 業務層不得出現任何 S3 SDK 呼叫 —— 物件儲存操作只集中在這個檔案。
 */

/** 供應商回報「物件不存在」的幾種形狀。S3 的 404 在不同實作下命名不一致。 */
function isNotFound(err) {
  if (!err) return false;
  const name = err.name || err.Code || err.code;
  if (name === "NotFound" || name === "NoSuchKey") return true;
  return err.$metadata?.httpStatusCode === 404;
}

class S3PrivateFileStorage {
  /**
   * @param {{
   *   bucket: string,
   *   endpoint: string,
   *   region: string,
   *   accessKeyId: string,
   *   secretAccessKey: string,
   *   forcePathStyle?: boolean,
   *   defaultNamespace?: string|null,
   * }} options
   *
   * `forcePathStyle` 預設 true：B2、R2 與多數 S3 相容供應商都接受 path-style，
   * 而 virtual-host style 需要 bucket 名稱是合法的 DNS label。預設走比較不會踩雷的那一邊。
   */
  constructor({
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle = true,
    defaultNamespace = null,
  }) {
    for (const [name, value] of Object.entries({
      bucket,
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
    })) {
      if (!value || typeof value !== "string") {
        throw new Error(`S3PrivateFileStorage requires a non-empty ${name}`);
      }
    }
    this.driver = "s3";
    this.bucket = bucket;
    this.defaultNamespace = defaultNamespace;
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  /**
   * key → object key。
   *
   * 形狀不合法一律 throw。訊息刻意與 local driver 的
   * `resolvePath()` 一字不差 —— 呼叫端不該分辨得出自己跑在哪個 driver 上。
   */
  objectKey(storageKey) {
    if (!isValidStorageKey(storageKey)) {
      throw new Error("invalid storage key");
    }
    return storageKey;
  }

  /** 刪除但吞掉錯誤。只用在清理殘骸的路徑上 —— 那裡再丟一次例外只會蓋掉真正的原因。 */
  async #deleteQuietly(storageKey) {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey })
      );
    } catch {
      /* 殘骸清不掉不該蓋掉原本的失敗原因 */
    }
  }

  /**
   * 寫入一份新檔案。
   *
   * - key 由這裡產生，caller 無法指定。
   * - **串流計算 SHA-256 與大小**，不把整個檔案讀進記憶體。這與 local driver 是同一種作法：
   *   在資料流過的時候順手算，而不是事後再讀一遍。
   * - 用 `lib-storage` 的 `Upload`：它會依大小自動決定單次 PUT 或 multipart，
   *   因此 100 MB 的教材本體與 80 MB 的試看影片都不需要呼叫端操心。
   * - 失敗或空檔案都會把已經上傳的物件刪掉，不留半成品
   *   （對應 local driver 清掉 `.part` 暫存檔）。
   *
   * @param {import("stream").Readable} readable
   * @param {{namespace?: string}} [options]
   * @returns {Promise<{storageKey: string, sizeBytes: number, checksumSha256: string}>}
   */
  async put(readable, { namespace = this.defaultNamespace } = {}) {
    if (!namespace) {
      throw new Error("put() requires an explicit namespace");
    }
    // newStorageKey() 內含 namespace allowlist 檢查：未登記的 namespace 在這裡就會 throw。
    const storageKey = newStorageKey(namespace);

    const hash = crypto.createHash("sha256");
    let sizeBytes = 0;

    const body = new PassThrough();
    readable.on("data", (chunk) => {
      hash.update(chunk);
      sizeBytes += chunk.length;
    });
    readable.on("error", (err) => body.destroy(err));
    readable.pipe(body);

    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: storageKey, Body: body },
    });

    try {
      await upload.done();
    } catch (err) {
      readable.destroy?.();
      await this.#deleteQuietly(storageKey);
      throw err;
    }

    if (sizeBytes === 0) {
      await this.#deleteQuietly(storageKey);
      throw Object.assign(new Error("uploaded file is empty"), { code: "EMPTY_FILE" });
    }

    return { storageKey, sizeBytes, checksumSha256: hash.digest("hex") };
  }

  /**
   * 開一個讀取串流。**同步回傳**（理由見檔頭）。
   *
   * @param {string} storageKey
   * @param {{start?: number, end?: number}} [range] 位元組區間（含端點）
   * @returns {import("stream").Readable}
   */
  openReadStream(storageKey, range = undefined) {
    // 同步 throw —— 與 local driver 的 resolvePath() 行為一致。
    this.objectKey(storageKey);

    const out = new PassThrough();
    const controller = new AbortController();
    let responseBody = null;
    let settled = false;

    /*
     * 消費端提早收手時（probe open、或使用者取消下載）要主動中止：
     *   - GetObject 還沒回來 → abort 掉請求，位元組從來不會離開供應商
     *   - 已經在傳 → destroy response body，否則連線會一直掛著把額度用光
     * 'close' 在正常結束時也會觸發，但那時 settled 已為 true 且 body 已 end，兩者都是 no-op。
     */
    out.on("close", () => {
      if (!settled) controller.abort();
      if (responseBody && !responseBody.destroyed) responseBody.destroy();
    });

    const params = { Bucket: this.bucket, Key: storageKey };
    if (range && Number.isFinite(range.start) && Number.isFinite(range.end)) {
      params.Range = `bytes=${range.start}-${range.end}`;
    }

    this.client
      .send(new GetObjectCommand(params), { abortSignal: controller.signal })
      .then((response) => {
        settled = true;
        if (out.destroyed) {
          response.Body?.destroy?.();
          return;
        }
        responseBody = response.Body;
        responseBody.on("error", (err) => out.destroy(err));
        responseBody.pipe(out);
      })
      .catch((err) => {
        settled = true;
        // 消費端自己取消的不是錯誤，不要在一個已經沒人聽的 stream 上發 'error'
        // （那會變成 unhandled 'error' 而終止 process）。
        if (controller.signal.aborted || out.destroyed) return;
        out.destroy(err);
      });

    return out;
  }

  /**
   * @returns {Promise<{exists: boolean, sizeBytes: number}>}
   *
   * 任何失敗（不合法 key、404、網路錯誤）都回 `exists: false` ——
   * 與 local driver 的 `try { fsp.stat } catch { return {exists:false} }` 等價。
   */
  async stat(storageKey) {
    try {
      const key = this.objectKey(storageKey);
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return { exists: true, sizeBytes: Number(response.ContentLength ?? 0) };
    } catch {
      return { exists: false, sizeBytes: 0 };
    }
  }

  async exists(storageKey) {
    return (await this.stat(storageKey)).exists;
  }

  /**
   * @returns {Promise<boolean>} 是否真的刪掉了（本來就不存在 → false，不算錯誤）。
   *
   * S3 的 DeleteObject 是冪等的：刪一個不存在的物件同樣回成功，因此無法從它的回應
   * 分辨「刪掉了」與「本來就沒有」。但 `materialFile.service.js` 的
   * `cleanupOrphans()` 會用這個布林值計數 `deletedObjects`，所以先 HeadObject 問一次。
   * 多一次請求換一個與 local driver 一致的回傳值 —— 這個語意差異不該外洩給業務層。
   */
  async delete(storageKey) {
    // 不合法 key 要 throw（不是回 false）—— 與 local driver 一致。
    const key = this.objectKey(storageKey);
    const before = await this.stat(key);
    if (!before.exists) return false;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    return true;
  }
}

module.exports = { S3PrivateFileStorage, isNotFound };
