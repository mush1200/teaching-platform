const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

const {
  LocalMaterialFileStorage,
  isValidStorageKey,
  newStorageKey,
} = require("../storage/materialFileStorage");

/**
 * Local storage driver 的單元測試。
 *
 * 這一層的責任只有兩件事，兩件都會直接影響安全：
 *   1. **key 由平台產生、且無法被用來跳出私有根目錄**（path traversal）
 *   2. **寫入是原子的、checksum 是真的**——「檔案只寫了一半但 DB 說寫好了」
 *      在付費商品上等於把壞檔賣給買家
 */

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "material-storage-test-"));
}

test("storage key 由平台產生，形狀固定", () => {
  const key = newStorageKey();
  assert.match(key, /^material-files\//);
  assert.equal(isValidStorageKey(key), true);
  assert.notEqual(newStorageKey(), key, "每次都要是新的 key");
});

test("拒絕任何不符合形狀的 key —— path traversal 的根本防線", () => {
  const rejected = [
    "material-files/../../../etc/passwd",
    "material-files/..%2f..%2fsecret",
    "../material-files/00000000-0000-4000-8000-000000000000",
    "material-files/not-a-uuid",
    "material-files/00000000-0000-4000-8000-000000000000/../../escape",
    "",
    null,
    undefined,
    42,
  ];
  for (const key of rejected) {
    assert.equal(isValidStorageKey(key), false, `${String(key)} must be rejected`);
  }
});

test("resolvePath 對非法 key 直接丟例外，不回傳可用路徑", () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });
  assert.throws(() => storage.resolvePath("material-files/../../escape"), /invalid storage key/);
  assert.throws(() => storage.resolvePath("anything"), /invalid storage key/);
});

test("put 串流寫入並回傳真實的大小與 SHA-256", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });

  // 刻意分成多個 chunk：checksum 必須是「串流累加」而不是「最後一塊」。
  const chunks = [Buffer.from("%PDF-1.7\n"), crypto.randomBytes(50_000), Buffer.from("%%EOF\n")];
  const payload = Buffer.concat(chunks);

  const result = await storage.put(Readable.from(chunks));

  assert.equal(isValidStorageKey(result.storageKey), true);
  assert.equal(result.sizeBytes, payload.length);
  assert.equal(result.checksumSha256, crypto.createHash("sha256").update(payload).digest("hex"));

  // 磁碟上的位元組必須與來源逐位元組相同。
  const onDisk = await fsp.readFile(storage.resolvePath(result.storageKey));
  assert.equal(Buffer.compare(onDisk, payload), 0, "stored bytes must match the source exactly");
});

test("檔案落在私有根目錄底下，且不帶原始副檔名", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });
  const result = await storage.put(Readable.from([Buffer.from("%PDF-1.7\n")]));

  const full = storage.resolvePath(result.storageKey);
  assert.equal(full.startsWith(path.resolve(root)), true);
  // 磁碟上不留任何使用者可控字串 —— 原始檔名只是 DB 裡的 metadata。
  assert.equal(path.extname(full), "");
});

test("空檔案被拒絕，而且不留下任何殘留", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });

  await assert.rejects(() => storage.put(Readable.from([])), (err) => err.code === "EMPTY_FILE");

  const left = await fsp.readdir(path.join(root, "material-files"));
  assert.deepEqual(left, [], "failed upload must not leave files behind");
});

test("來源串流中途失敗時不留下半成品（.part 也要清掉）", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });

  const broken = new Readable({
    read() {
      this.push(Buffer.from("%PDF-1.7\n"));
      this.destroy(new Error("connection reset"));
    },
  });

  await assert.rejects(() => storage.put(broken), /connection reset/);

  const left = await fsp.readdir(path.join(root, "material-files"));
  assert.deepEqual(left, [], "aborted upload must not leave a partial file");
});

test("stat / exists / delete 的行為", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });
  const { storageKey, sizeBytes } = await storage.put(Readable.from([Buffer.from("%PDF-1.7\n")]));

  assert.deepEqual(await storage.stat(storageKey), { exists: true, sizeBytes });
  assert.equal(await storage.exists(storageKey), true);

  assert.equal(await storage.delete(storageKey), true);
  assert.equal(await storage.exists(storageKey), false);
  // 已經不在了不算錯誤 —— 清理流程重複執行必須安全。
  assert.equal(await storage.delete(storageKey), false);
});

test("不存在的 key 查詢不丟例外，回 exists:false", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });
  assert.deepEqual(await storage.stat(newStorageKey()), { exists: false, sizeBytes: 0 });
});

test("openReadStream 讀回來的內容與寫入時完全一致", async () => {
  const root = tempRoot();
  const storage = new LocalMaterialFileStorage({ root });
  const payload = crypto.randomBytes(10_000);
  const { storageKey, checksumSha256 } = await storage.put(Readable.from([payload]));

  const hash = crypto.createHash("sha256");
  for await (const chunk of storage.openReadStream(storageKey)) hash.update(chunk);

  assert.equal(hash.digest("hex"), checksumSha256, "round-trip must preserve the checksum");
});
