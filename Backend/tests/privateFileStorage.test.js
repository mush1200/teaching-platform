const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

const {
  NAMESPACES,
  LocalPrivateFileStorage,
  isValidStorageKey,
  newStorageKey,
  namespaceOf,
} = require("../storage/privateFileStorage");

/**
 * Namespace 化的私有儲存 driver。
 *
 * 教材本體與付款憑證共用這一份 filesystem code，所以這裡多驗一件事：
 * **兩個 namespace 之間不能互相跨界**（教材的交付路徑不該接受憑證的 key，反之亦然）。
 */

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "private-storage-test-"));
}

test("key 由平台產生，帶 namespace 前綴", () => {
  const materialKey = newStorageKey(NAMESPACES.MATERIAL_FILES);
  const proofKey = newStorageKey(NAMESPACES.PAYMENT_PROOFS);
  assert.match(materialKey, /^material-files\//);
  assert.match(proofKey, /^payment-proofs\//);
  assert.equal(namespaceOf(proofKey), "payment-proofs");
  assert.notEqual(newStorageKey(NAMESPACES.PAYMENT_PROOFS), proofKey);
});

test("未登記的 namespace 直接丟例外，不會產生一個看起來合法的 key", () => {
  assert.throws(() => newStorageKey("secrets"), /unknown private storage namespace/);
  assert.throws(() => newStorageKey(""), /unknown private storage namespace/);
});

test("namespace 之間互不接受 —— 憑證 key 不是合法的教材 key", () => {
  const proofKey = newStorageKey(NAMESPACES.PAYMENT_PROOFS);
  assert.equal(isValidStorageKey(proofKey), true, "泛用檢查應接受");
  assert.equal(isValidStorageKey(proofKey, NAMESPACES.PAYMENT_PROOFS), true);
  assert.equal(
    isValidStorageKey(proofKey, NAMESPACES.MATERIAL_FILES),
    false,
    "指定 material 時必須拒絕憑證 key"
  );
});

test("拒絕任何不符形狀的 key —— path traversal 的根本防線", () => {
  const rejected = [
    "payment-proofs/../../../etc/passwd",
    "payment-proofs/..%2f..%2fsecret",
    "../payment-proofs/00000000-0000-4000-8000-000000000000",
    "payment-proofs/not-a-uuid",
    "payment-proofs/00000000-0000-4000-8000-000000000000/../escape",
    "uploads/payment-proofs/movprnlk_06819121e3ea.png",
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
  const storage = new LocalPrivateFileStorage({ root: tempRoot() });
  assert.throws(() => storage.resolvePath("payment-proofs/../../escape"), /invalid storage key/);
  assert.throws(() => storage.resolvePath("anything"), /invalid storage key/);
});

test("put 需要明確的 namespace —— 不猜資產類型", async () => {
  const storage = new LocalPrivateFileStorage({ root: tempRoot() });
  await assert.rejects(
    () => storage.put(Readable.from(Buffer.from("x"))),
    /requires an explicit namespace/
  );
});

test("put 寫入憑證並回傳真實的大小與 SHA-256", async () => {
  const root = tempRoot();
  const storage = new LocalPrivateFileStorage({ root });
  const bytes = crypto.randomBytes(4096);

  const result = await storage.put(Readable.from(bytes), {
    namespace: NAMESPACES.PAYMENT_PROOFS,
  });

  assert.equal(result.sizeBytes, bytes.length);
  assert.equal(result.checksumSha256, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.match(result.storageKey, /^payment-proofs\//);

  // 落在 payment-proofs 子目錄，而且磁碟檔名沒有副檔名（不留使用者可控字串）
  const onDisk = path.join(root, result.storageKey);
  assert.equal(fs.existsSync(onDisk), true);
  assert.equal(path.extname(onDisk), "");
  assert.equal(Buffer.compare(fs.readFileSync(onDisk), bytes), 0, "位元組必須完全一致");
});

test("兩個 namespace 的物件落在不同的子目錄，不會互相覆蓋", async () => {
  const root = tempRoot();
  const storage = new LocalPrivateFileStorage({ root });
  const a = await storage.put(Readable.from(Buffer.from("material")), {
    namespace: NAMESPACES.MATERIAL_FILES,
  });
  const b = await storage.put(Readable.from(Buffer.from("proof")), {
    namespace: NAMESPACES.PAYMENT_PROOFS,
  });
  assert.equal(path.dirname(path.join(root, a.storageKey)) !== path.dirname(path.join(root, b.storageKey)), true);
  assert.equal(fs.readFileSync(path.join(root, a.storageKey), "utf8"), "material");
  assert.equal(fs.readFileSync(path.join(root, b.storageKey), "utf8"), "proof");
});

test("空檔案被拒絕，而且不留下暫存檔", async () => {
  const root = tempRoot();
  const storage = new LocalPrivateFileStorage({ root });
  await assert.rejects(
    () => storage.put(Readable.from(Buffer.alloc(0)), { namespace: NAMESPACES.PAYMENT_PROOFS }),
    (err) => err.code === "EMPTY_FILE"
  );
  assert.deepEqual(fs.readdirSync(path.join(root, NAMESPACES.PAYMENT_PROOFS)), []);
});

test("stat / exists / delete", async () => {
  const storage = new LocalPrivateFileStorage({ root: tempRoot() });
  const stored = await storage.put(Readable.from(Buffer.from("proof-bytes")), {
    namespace: NAMESPACES.PAYMENT_PROOFS,
  });

  assert.deepEqual(await storage.stat(stored.storageKey), { exists: true, sizeBytes: 11 });
  assert.equal(await storage.exists(stored.storageKey), true);
  assert.equal(await storage.delete(stored.storageKey), true);
  assert.equal(await storage.exists(stored.storageKey), false);
  // 已經不存在時回 false 而不是丟例外（清理流程要能重跑）
  assert.equal(await storage.delete(stored.storageKey), false);
});

test("私有根目錄不在 uploads/ 底下 —— 預設值不能被 express.static 公開", () => {
  const { DEFAULT_ROOT } = require("../config/privateFileStorage");
  assert.equal(DEFAULT_ROOT.includes(`${path.sep}uploads${path.sep}`), false);
  assert.match(DEFAULT_ROOT, /private-storage$/);
});
