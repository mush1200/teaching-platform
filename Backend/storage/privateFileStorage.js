const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

/**
 * **私有檔案**的 storage abstraction（canonical）。
 *
 * ## 為什麼是「私有檔案」而不是「教材檔案」
 *
 * 這一層原本是為教材本體寫的（`LocalMaterialFileStorage`）。付款憑證進來時面對一個選擇：
 * 把憑證硬塞進一個叫 material 的 abstraction，或是為它 copy-paste 一份同樣的
 * filesystem code。兩個都不對 —— 前者讓命名說謊，後者讓 path traversal 防線出現第二份實作，
 * 而兩份實作遲早會分歧。
 *
 * 因此改成：**同一個 driver、同一個私有根目錄、以 namespace 分艙**。
 *
 *     private-storage/
 *       material-files/<uuid>     教材本體（買家付費取得的商品）
 *       payment-proofs/<uuid>     付款憑證（敏感交易檔案）
 *       material-media/<uuid>     教材行銷素材（封面／詳情圖／試看影片）
 *
 * 三者共用的是「怎麼安全地把位元組寫進磁碟並取回來」；**不共用授權模型** ——
 * 教材看購買授權（`materials.approved_file_id` + 已核准訂單），
 * 憑證看訂單擁有權（`orders.user_id`）或 Admin，
 * 行銷素材看**所屬教材的 `status`**（published 匿名可取，其餘僅擁有者或 Admin）。
 * 授權判斷留在各自的服務層。
 *
 * ## 行銷素材為什麼也在私有根目錄底下
 *
 * 它是三者中唯一**條件公開**的資產，直覺上會想留在 `uploads/`。但 `express.static`
 * 沒有「條件」這種東西 —— 一旦檔案在那個目錄裡，未上架與已下架教材的素材就永久
 * 匿名可取，只靠隨機檔名保護。放進私有根目錄不代表它永遠私有，而是代表
 * **每一次交付都必須先經過一次授權判斷**；published 素材照樣匿名放行。
 *
 * ## 介面
 *
 *   put(readable, { namespace })  -> { storageKey, sizeBytes, checksumSha256 }
 *   openReadStream(storageKey, range?) -> Readable（range 為 { start, end } 含端點）
 *   stat(storageKey)              -> { exists, sizeBytes }
 *   exists(storageKey)            -> boolean
 *   delete(storageKey)            -> boolean（不存在時回 false，不丟例外）
 *
 * 未來的 object storage driver 會**額外**提供 `createSignedUrl()`；delivery 層以
 * `typeof storage.createSignedUrl === "function"` 判斷要走雲端簽章還是 backend 串流。
 * 這裡刻意不預先定義那個方法的形狀 —— 沒有實作對象時定介面只會定錯。
 *
 * ## 不變條件
 *
 *   1. storage key 一律由**這一層**產生（namespace + UUID），永不接受 caller 提供的路徑。
 *   2. 私有根目錄必須在 `express.static` 服務範圍之外（見 `index.js` 只公開 `uploads/`）。
 *   3. 業務層不得出現任何 `fs.*` —— 檔案系統操作只集中在 `LocalPrivateFileStorage`。
 *   4. 磁碟上不留任何使用者可控字串：檔名是 UUID、**沒有副檔名**，原始檔名只是 DB metadata。
 */

/** 已登記的 namespace。新增資產類型時必須在這裡登記，否則 key 產生與驗證都會拒絕。 */
const NAMESPACES = Object.freeze({
  MATERIAL_FILES: "material-files",
  PAYMENT_PROOFS: "payment-proofs",
  MATERIAL_MEDIA: "material-media",
  // 消費申訴的買家外部證據（P1-09 Gate 3）。與付款憑證共用 filesystem primitives，
  // 但**不共用授權模型**：憑證的審核會讓訂單核准，申訴附件不會。
  COMPLAINT_EVIDENCE: "complaint-evidence",
});

const NAMESPACE_VALUES = Object.freeze(Object.values(NAMESPACES));

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function assertNamespace(namespace) {
  if (!NAMESPACE_VALUES.includes(namespace)) {
    throw new Error(
      `unknown private storage namespace ${JSON.stringify(namespace)} ` +
        `(known: ${NAMESPACE_VALUES.join(", ")})`
    );
  }
  return namespace;
}

/**
 * 合法的 storage key 形狀。任何不符的一律拒絕 —— 這是 path traversal 的根本防線。
 *
 * @param {unknown} key
 * @param {string|null} namespace 指定時只接受該 namespace 的 key（更嚴格）
 */
function isValidStorageKey(key, namespace = null) {
  if (typeof key !== "string") return false;
  const namespaces = namespace ? [assertNamespace(namespace)] : NAMESPACE_VALUES;
  return namespaces.some((ns) => new RegExp(`^${ns}/${UUID_PATTERN}$`).test(key));
}

function newStorageKey(namespace) {
  return `${assertNamespace(namespace)}/${crypto.randomUUID()}`;
}

/** key 的 namespace 部分（不合法的 key 回 null）。 */
function namespaceOf(key) {
  if (!isValidStorageKey(key)) return null;
  return String(key).split("/")[0];
}

/**
 * Local private filesystem driver。
 *
 * 檔案落在 `<root>/<namespace>/<uuid>`。
 */
class LocalPrivateFileStorage {
  /**
   * @param {{ root: string, defaultNamespace?: string|null }} options
   *   `root` 為私有根目錄的絕對路徑。
   *   `defaultNamespace` 只給相容用的子類別綁定；一般呼叫端應在 `put()` 明確指定。
   */
  constructor({ root, defaultNamespace = null }) {
    if (!root || typeof root !== "string") {
      throw new Error("LocalPrivateFileStorage requires an absolute root path");
    }
    this.driver = "local";
    this.root = path.resolve(root);
    this.defaultNamespace = defaultNamespace ? assertNamespace(defaultNamespace) : null;
    for (const ns of NAMESPACE_VALUES) {
      fs.mkdirSync(path.join(this.root, ns), { recursive: true });
    }
  }

  /**
   * key → 絕對路徑。
   *
   * 先驗 key 形狀，再用 `path.resolve` 組出來並**確認結果仍在 root 之內**。
   * 兩層都留著：形狀檢查擋掉 `../`，resolve 檢查擋掉未來有人放寬 pattern 時的漏網。
   */
  resolvePath(storageKey) {
    if (!isValidStorageKey(storageKey)) {
      throw new Error("invalid storage key");
    }
    const full = path.resolve(this.root, storageKey);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (!full.startsWith(rootWithSep)) {
      throw new Error("resolved path escapes the storage root");
    }
    return full;
  }

  /**
   * 寫入一份新檔案。
   *
   * - key 由這裡產生，caller 無法指定。
   * - **串流計算 SHA-256 與大小**，不把整個檔案讀進記憶體。
   * - 先寫 `.part` 暫存檔再 rename：rename 在同一個檔案系統上是原子的，
   *   因此不會出現「DB 已指向、但檔案只寫了一半」的中間狀態。
   * - 任何失敗都會清掉暫存檔，不留半成品。
   *
   * @param {import("stream").Readable} readable
   * @param {{namespace?: string}} [options]
   * @returns {Promise<{storageKey: string, sizeBytes: number, checksumSha256: string}>}
   */
  async put(readable, { namespace = this.defaultNamespace } = {}) {
    if (!namespace) {
      throw new Error("put() requires an explicit namespace");
    }
    const storageKey = newStorageKey(namespace);
    const finalPath = this.resolvePath(storageKey);
    const tempPath = `${finalPath}.part`;

    const hash = crypto.createHash("sha256");
    let sizeBytes = 0;

    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tempPath, { flags: "wx" });
      const fail = (err) => {
        readable.destroy?.();
        out.destroy();
        reject(err);
      };
      readable.on("data", (chunk) => {
        hash.update(chunk);
        sizeBytes += chunk.length;
      });
      readable.on("error", fail);
      out.on("error", fail);
      out.on("finish", resolve);
      readable.pipe(out);
    }).catch(async (err) => {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw err;
    });

    if (sizeBytes === 0) {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw Object.assign(new Error("uploaded file is empty"), { code: "EMPTY_FILE" });
    }

    await fsp.rename(tempPath, finalPath);
    return { storageKey, sizeBytes, checksumSha256: hash.digest("hex") };
  }

  /**
   * @param {string} storageKey
   * @param {{start?: number, end?: number}} [range]
   *   位元組區間（含端點）。給 HTTP Range 用 —— 試看影片在瀏覽器裡要能拖曳進度條，
   *   而 `<video>` 的 seek 是靠 Range 請求做的。省略時讀整個檔案。
   */
  openReadStream(storageKey, range = undefined) {
    const path_ = this.resolvePath(storageKey);
    if (range && Number.isFinite(range.start) && Number.isFinite(range.end)) {
      return fs.createReadStream(path_, { start: range.start, end: range.end });
    }
    return fs.createReadStream(path_);
  }

  async stat(storageKey) {
    try {
      const s = await fsp.stat(this.resolvePath(storageKey));
      return { exists: s.isFile(), sizeBytes: s.size };
    } catch {
      return { exists: false, sizeBytes: 0 };
    }
  }

  async exists(storageKey) {
    return (await this.stat(storageKey)).exists;
  }

  /** @returns {Promise<boolean>} 是否真的刪掉了（本來就不存在 → false，不算錯誤）。 */
  async delete(storageKey) {
    try {
      await fsp.unlink(this.resolvePath(storageKey));
      return true;
    } catch (err) {
      if (err && err.code === "ENOENT") return false;
      throw err;
    }
  }
}

module.exports = {
  NAMESPACES,
  NAMESPACE_VALUES,
  isValidStorageKey,
  newStorageKey,
  namespaceOf,
  LocalPrivateFileStorage,
};
