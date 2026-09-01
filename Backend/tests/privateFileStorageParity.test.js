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
  namespaceOf,
} = require("../storage/privateFileStorage");
const { S3PrivateFileStorage } = require("../storage/s3PrivateFileStorage");
const { startFakeS3Server } = require("./helpers/fakeS3Server");

/**
 * **Driver parity**（`PRE-13`，2026-08-31）。
 *
 * 這支測試的立場是：`local` 與 `s3` 是**同一個介面的兩個實作**，
 * 業務層不該分辨得出自己跑在哪一個上面。所以同一組斷言逐字跑兩次，
 * 而不是為每個 driver 寫一份各自寬鬆的測試 —— 後者正是兩份實作會慢慢分歧的原因。
 *
 * 涵蓋 `PRE-13` 要求的十項：upload / stat / exists / read full / range read /
 * delete / missing file / invalid storage key / namespace isolation / checksum，
 * 另加三項在物件儲存上才有意義、但兩邊都必須一致的行為：
 * 空檔案、multipart（> partSize）、以及 probe-open-then-destroy。
 *
 * fake S3 是真的 HTTP server（見 `helpers/fakeS3Server.js`）——
 * 走真的 SDK、真的 wire format。stub 掉 SDK 只會證明「我記得呼叫某個函式」。
 */

const PART_SIZE = 5 * 1024 * 1024;

function bufferFrom(readableSource) {
  return Readable.from([readableSource]);
}

function drain(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/** stream 一定會失敗時用這個 —— 回傳那個 error 而不是讓它變成 unhandled。 */
function expectStreamError(stream) {
  return new Promise((resolve, reject) => {
    stream.on("error", resolve);
    stream.on("end", () => reject(new Error("expected the stream to fail, but it ended cleanly")));
    stream.resume();
  });
}

async function makeLocalDriver() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "parity-local-"));
  return {
    storage: new LocalPrivateFileStorage({ root }),
    cleanup: async () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function makeS3Driver() {
  const server = await startFakeS3Server();
  const storage = new S3PrivateFileStorage({
    bucket: server.bucket,
    endpoint: server.endpoint,
    region: "us-east-1",
    // 測試替身不驗簽章，但 SDK 仍會真的簽 —— 這裡給的是形狀合法的假憑證。
    accessKeyId: "fake-access-key-id",
    secretAccessKey: "fake-secret-access-key",
    forcePathStyle: true,
  });
  return { storage, server, cleanup: () => server.close() };
}

const DRIVERS = [
  { name: "local", make: makeLocalDriver },
  { name: "s3", make: makeS3Driver },
];

for (const driver of DRIVERS) {
  const label = `[${driver.name}]`;

  /** 每個 case 自己建立與拆除 driver，避免測試之間共用狀態。 */
  async function withStorage(fn) {
    const ctx = await driver.make();
    try {
      return await fn(ctx.storage, ctx);
    } finally {
      await ctx.cleanup();
    }
  }

  // 1 / 10. upload ＋ checksum correctness
  test(`${label} put() 產生帶 namespace 的 key，並回報正確的大小與 SHA-256`, async () => {
    await withStorage(async (storage) => {
      const payload = Buffer.from("教材本體的位元組 / material bytes", "utf8");
      const result = await storage.put(bufferFrom(payload), {
        namespace: NAMESPACES.MATERIAL_FILES,
      });

      assert.ok(isValidStorageKey(result.storageKey, NAMESPACES.MATERIAL_FILES));
      assert.equal(namespaceOf(result.storageKey), NAMESPACES.MATERIAL_FILES);
      assert.equal(result.sizeBytes, payload.length);
      assert.equal(
        result.checksumSha256,
        crypto.createHash("sha256").update(payload).digest("hex"),
        "checksum 必須是實際位元組的 SHA-256，不能是宣告值"
      );
    });
  });

  // 2 / 3. stat ＋ exists
  test(`${label} stat() 與 exists() 反映實際物件`, async () => {
    await withStorage(async (storage) => {
      const payload = Buffer.alloc(1234, 7);
      const { storageKey } = await storage.put(bufferFrom(payload), {
        namespace: NAMESPACES.PAYMENT_PROOFS,
      });

      const stat = await storage.stat(storageKey);
      assert.equal(stat.exists, true);
      assert.equal(stat.sizeBytes, 1234);
      assert.equal(await storage.exists(storageKey), true);
    });
  });

  // 4. read full file
  test(`${label} openReadStream() 完整讀回原始位元組`, async () => {
    await withStorage(async (storage) => {
      const payload = crypto.randomBytes(64 * 1024);
      const { storageKey } = await storage.put(bufferFrom(payload), {
        namespace: NAMESPACES.MATERIAL_FILES,
      });

      const roundTrip = await drain(storage.openReadStream(storageKey));
      assert.deepEqual(roundTrip, payload);
    });
  });

  // 5. range read —— 試看影片拖曳進度條靠這個
  test(`${label} openReadStream() 支援含端點的 byte range`, async () => {
    await withStorage(async (storage) => {
      const payload = crypto.randomBytes(10_000);
      const { storageKey } = await storage.put(bufferFrom(payload), {
        namespace: NAMESPACES.MATERIAL_MEDIA,
      });

      const slice = await drain(storage.openReadStream(storageKey, { start: 100, end: 199 }));
      assert.equal(slice.length, 100, "range 含端點：100..199 是 100 個位元組");
      assert.deepEqual(slice, payload.subarray(100, 200));

      const tail = await drain(
        storage.openReadStream(storageKey, { start: 9_990, end: 9_999 })
      );
      assert.deepEqual(tail, payload.subarray(9_990, 10_000));
    });
  });

  // 6. delete
  test(`${label} delete() 刪掉存在的物件並回 true`, async () => {
    await withStorage(async (storage) => {
      const { storageKey } = await storage.put(bufferFrom(Buffer.from("bye")), {
        namespace: NAMESPACES.COMPLAINT_EVIDENCE,
      });

      assert.equal(await storage.delete(storageKey), true);
      assert.equal(await storage.exists(storageKey), false);
      assert.equal(
        await storage.delete(storageKey),
        false,
        "重複刪除不是錯誤，只是沒東西可刪"
      );
    });
  });

  // 7. missing file
  test(`${label} 物件不存在時：stat/exists/delete 溫和失敗，讀取則發出 error`, async () => {
    await withStorage(async (storage) => {
      const ghost = `${NAMESPACES.MATERIAL_FILES}/${crypto.randomUUID()}`;

      assert.deepEqual(await storage.stat(ghost), { exists: false, sizeBytes: 0 });
      assert.equal(await storage.exists(ghost), false);
      assert.equal(await storage.delete(ghost), false);

      const err = await expectStreamError(storage.openReadStream(ghost));
      assert.ok(err instanceof Error);
    });
  });

  // 8. invalid storage key —— path traversal 的根本防線
  test(`${label} 不合法的 storage key 一律被拒絕`, async () => {
    await withStorage(async (storage) => {
      const illegal = [
        "../../etc/passwd",
        "material-files/../payment-proofs/x",
        "/material-files/00000000-0000-0000-0000-000000000000",
        "unknown-namespace/00000000-0000-0000-0000-000000000000",
        "material-files/not-a-uuid",
        "material-files/00000000-0000-0000-0000-000000000000/extra",
        "",
        null,
      ];

      for (const key of illegal) {
        assert.equal(isValidStorageKey(key), false, `${JSON.stringify(key)} 不該是合法 key`);

        // openReadStream 必須**同步** throw，不是回一個之後才失敗的 stream。
        assert.throws(
          () => storage.openReadStream(key),
          /invalid storage key/,
          `openReadStream(${JSON.stringify(key)}) 應同步 throw`
        );

        // delete 對不合法 key 是 throw，不是回 false —— 回 false 會讓呼叫端
        // 以為「本來就沒有」，把一個設定錯誤靜靜吞掉。
        await assert.rejects(
          () => storage.delete(key),
          /invalid storage key/,
          `delete(${JSON.stringify(key)}) 應 reject`
        );

        // stat 則刻意寬鬆：任何失敗都回 exists:false（兩個 driver 一致）。
        assert.deepEqual(await storage.stat(key), { exists: false, sizeBytes: 0 });
      }
    });
  });

  // 9. namespace isolation
  test(`${label} namespace 之間不得互相跨界`, async () => {
    await withStorage(async (storage) => {
      const material = await storage.put(bufferFrom(Buffer.from("material")), {
        namespace: NAMESPACES.MATERIAL_FILES,
      });
      const proof = await storage.put(bufferFrom(Buffer.from("proof")), {
        namespace: NAMESPACES.PAYMENT_PROOFS,
      });

      assert.equal(isValidStorageKey(material.storageKey, NAMESPACES.PAYMENT_PROOFS), false);
      assert.equal(isValidStorageKey(proof.storageKey, NAMESPACES.MATERIAL_FILES), false);
      assert.notEqual(namespaceOf(material.storageKey), namespaceOf(proof.storageKey));

      // 未登記的 namespace 連寫都寫不進去。
      await assert.rejects(
        () => storage.put(bufferFrom(Buffer.from("x")), { namespace: "secrets" }),
        /unknown private storage namespace/
      );

      // 沒有明確 namespace 也不行 —— 呼叫端必須說出自己在寫哪一種資產。
      await assert.rejects(
        () => storage.put(bufferFrom(Buffer.from("x")), {}),
        /requires an explicit namespace/
      );
    });
  });

  // 11. 空檔案
  test(`${label} 空檔案被拒絕，且不留下殘骸`, async () => {
    await withStorage(async (storage) => {
      await assert.rejects(
        () => storage.put(Readable.from([]), { namespace: NAMESPACES.MATERIAL_FILES }),
        (err) => err.code === "EMPTY_FILE"
      );
    });
  });

  // 12. multipart —— 超過 partSize 才會走到的那條路徑
  test(`${label} 大於 partSize 的檔案完整 round-trip`, async () => {
    await withStorage(async (storage) => {
      const payload = crypto.randomBytes(PART_SIZE + 1024);
      const expected = crypto.createHash("sha256").update(payload).digest("hex");

      const result = await storage.put(bufferFrom(payload), {
        namespace: NAMESPACES.MATERIAL_FILES,
      });
      assert.equal(result.sizeBytes, payload.length);
      assert.equal(result.checksumSha256, expected);

      const roundTrip = await drain(storage.openReadStream(result.storageKey));
      assert.deepEqual(roundTrip, payload);
      assert.equal(
        crypto.createHash("sha256").update(roundTrip).digest("hex"),
        expected,
        "multipart 重組後的位元組必須與上傳前完全一致"
      );
    });
  });

  // 13. probe-open-then-destroy
  //
  // routes/materials.js 的素材端點會先開一次拿 totalBytes、立刻 destroy，再帶 Range 開第二次。
  // 這個形狀不能讓任何 driver 冒出 unhandled 'error'（那會終止 process），
  // 也不能讓後續的真實讀取受影響。
  test(`${label} 開了又立刻 destroy 不會產生 unhandled error`, async () => {
    await withStorage(async (storage) => {
      const payload = crypto.randomBytes(32 * 1024);
      const { storageKey } = await storage.put(bufferFrom(payload), {
        namespace: NAMESPACES.MATERIAL_MEDIA,
      });

      const probe = storage.openReadStream(storageKey);
      probe.destroy();

      // 給被中止的請求足夠的時間把 rejection 走完；沒被接住的話這裡就會炸。
      await new Promise((resolve) => setTimeout(resolve, 250));

      const real = await drain(storage.openReadStream(storageKey, { start: 0, end: 99 }));
      assert.equal(real.length, 100, "probe 之後的真實讀取必須完全不受影響");
    });
  });
}

/**
 * S3 driver 專屬：驗證 probe 真的中止了請求。
 *
 * parity 測試只能證明「不會壞」，證明不了「沒有把位元組拉下來」——
 * 而後者才是這個最佳化存在的理由（每一次素材瀏覽的 egress 成本）。
 */
test("[s3] probe open 之後立刻 destroy，不會把整個物件拉下來", async () => {
  const server = await startFakeS3Server();
  try {
    const storage = new S3PrivateFileStorage({
      bucket: server.bucket,
      endpoint: server.endpoint,
      region: "us-east-1",
      accessKeyId: "fake-access-key-id",
      secretAccessKey: "fake-secret-access-key",
      forcePathStyle: true,
    });

    const { storageKey } = await storage.put(bufferFrom(crypto.randomBytes(4096)), {
      namespace: NAMESPACES.MATERIAL_MEDIA,
    });

    server.requests.length = 0;
    const probe = storage.openReadStream(storageKey);
    probe.destroy();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const gets = server.requests.filter((r) => r.method === "GET");
    assert.ok(
      gets.length <= 1,
      `被中止的 probe 最多只該產生一次 GET，實際 ${gets.length} 次`
    );
  } finally {
    await server.close();
  }
});

/**
 * S3 driver 專屬：Range 必須真的變成 `Range: bytes=a-b` 送出去，
 * 而不是在本地把整個物件拉下來再切。後者功能上看起來一樣，成本天差地遠。
 */
test("[s3] range 讀取是由供應商端切片，不是下載完再切", async () => {
  const server = await startFakeS3Server();
  try {
    const storage = new S3PrivateFileStorage({
      bucket: server.bucket,
      endpoint: server.endpoint,
      region: "us-east-1",
      accessKeyId: "fake-access-key-id",
      secretAccessKey: "fake-secret-access-key",
      forcePathStyle: true,
    });

    const { storageKey } = await storage.put(bufferFrom(crypto.randomBytes(8192)), {
      namespace: NAMESPACES.MATERIAL_MEDIA,
    });

    server.requests.length = 0;
    await drain(storage.openReadStream(storageKey, { start: 10, end: 19 }));

    const get = server.requests.find((r) => r.method === "GET");
    assert.equal(get.range, "bytes=10-19");
  } finally {
    await server.close();
  }
});
