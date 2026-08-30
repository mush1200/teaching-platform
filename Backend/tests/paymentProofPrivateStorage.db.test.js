/**
 * 付款憑證私有儲存的資料庫測試。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 * 每個 case 自己建立 fixture、自己清掉。
 *
 * 這裡鎖的是「壞掉也不會有人在畫面上發現」的幾條不變條件：
 *
 *   1. 憑證的位元組**只**存在私有儲存，公開 `uploads/` 底下不會出現任何副本
 *   2. 授權只有 Admin 與訂單擁有者成立；知道 proof id 也讀不到別人的（IDOR）
 *   3. `storage_key` / checksum 永不離開服務層
 *   4. legacy 搬移是**可重入**的，而且搬完的位元組與來源逐 byte 相同
 *
 * 儲存後端在這裡是真的（local driver 寫進暫存目錄）：「DB 說有檔案但磁碟上沒有」
 * 正是最需要被驗證的失敗模式之一。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

/*
 * 測試專用的私有儲存根目錄。必須在 require 服務層**之前**設定 ——
 * driver 是在第一次取用時依當下的環境變數建立的。
 */
const TEST_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "payment-proofs-dbtest-"));
process.env.PRIVATE_FILE_STORAGE_PATH = TEST_STORAGE_ROOT;
delete process.env.MATERIAL_FILE_STORAGE_PATH;

const db = require("../config/db");
const paymentProof = require("../services/paymentProof.service");
const adminProofs = require("../services/adminPaymentProofs.service");
const { getPrivateFileStorage } = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");

/** 這些測試會寫入資料；跑錯資料庫是不可接受的。 */
test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

test("guard: payment proofs live outside the public uploads directory", () => {
  const publicUploads = path.resolve(__dirname, "..", "uploads");
  assert.equal(
    path.resolve(TEST_STORAGE_ROOT).startsWith(publicUploads),
    false,
    "private storage must never live under the statically served uploads/ directory"
  );
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], orders: [], proofs: [] };

async function makeUser(role = "buyer") {
  const id = `usr_pp_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return { userId: id, role };
}

async function makeOrder(userId, status = "pending_payment") {
  const id = `ord_pp_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, $3, 'manual_transfer', 450, 450, 0)`,
    [id, userId, status]
  );
  created.orders.push(id);
  return id;
}

/** 一張真的 PNG（有正確的 magic bytes），內容以 seed 區分好讓 hash 不同。 */
function pngBytes(seed = uniqueSuffix()) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`IHDR-fixture-${seed}`, "ascii"),
    crypto.randomBytes(64),
  ]);
}

function multerFile(bytes, { originalname = "proof.png", mimetype = "image/png" } = {}) {
  return { originalname, mimetype, buffer: bytes, size: bytes.length };
}

/** 走真正的上傳路徑（含 magic bytes 檢查與 SHA-256）。 */
async function upload(orderId, uploadedBy, files) {
  const result = await paymentProof.storeUploads({ orderId, uploadedBy, files });
  if (result.ok) created.proofs.push(...result.proofs.map((p) => p.id));
  return result;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function readRow(proofId) {
  const { rows } = await db.query(`SELECT * FROM manual_payment_proofs WHERE id = $1`, [proofId]);
  return rows[0];
}

/** 把 stream 完整讀成 Buffer（驗證交付出去的位元組）。 */
async function drain(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test.after(async () => {
  if (created.orders.length > 0) {
    await db.query(`DELETE FROM manual_payment_proofs WHERE order_id = ANY($1)`, [created.orders]);
    await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
    await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
  }
  if (created.users.length > 0) {
    await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  await db.pool.end();
  fs.rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* 上傳                                                                        */
/* -------------------------------------------------------------------------- */

test("上傳：位元組進私有儲存，DB 只留 opaque key，公開目錄不出現任何副本", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const bytes = pngBytes();

  const result = await upload(orderId, buyer.userId, [multerFile(bytes, { originalname: "轉帳.png" })]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.proofs.length, 1);

  const row = await readRow(result.proofs[0].id);
  assert.equal(row.storage_status, "private");
  assert.match(row.storage_key, /^payment-proofs\/[0-9a-f-]{36}$/);
  assert.equal(row.checksum_sha256, sha256(bytes));
  assert.equal(row.uploaded_by, buyer.userId);
  assert.equal(row.review_status, "pending", "上傳後仍是 pending —— 審核 workflow 未改變");
  assert.equal(row.proof_url, null, "新憑證不再產生任何公開 URL");
  assert.equal(row.proof_mime_type, "image/png");
  assert.equal(Number(row.proof_size_bytes), bytes.length);

  // 實體檔案落在私有 namespace 底下，而且沒有副檔名
  const onDisk = path.join(TEST_STORAGE_ROOT, row.storage_key);
  assert.equal(fs.existsSync(onDisk), true);
  assert.equal(path.extname(onDisk), "");
  assert.equal(Buffer.compare(fs.readFileSync(onDisk), bytes), 0);

  // 公開目錄裡不該出現這些位元組
  const publicDir = path.resolve(__dirname, "..", "uploads", "payment-proofs");
  const publicFiles = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];
  for (const name of publicFiles) {
    const contents = fs.readFileSync(path.join(publicDir, name));
    assert.notEqual(sha256(contents), sha256(bytes), `${name} 是新憑證的公開副本`);
  }
});

test("上傳回應與清單不含 storage_key / checksum / proof_url", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const result = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);
  assert.equal(result.ok, true);

  const listed = await paymentProof.listOrderProofs({ orderId, user: buyer });
  assert.equal(listed.ok, true);

  // 真正的 key 從 DB 直接取，逐字比對它有沒有出現在對外形狀裡 ——
  // 用 pattern 猜會誤中 `proof_file_path` 裡的 proof id（也是 UUID）。
  const row = await readRow(result.proofs[0].id);
  assert.match(row.storage_key, /^payment-proofs\//);

  for (const shape of [...result.proofs, ...listed.proofs]) {
    const serialized = JSON.stringify(shape);
    assert.equal("storage_key" in shape, false);
    assert.equal("checksum_sha256" in shape, false);
    assert.equal("proof_url" in shape, false);
    assert.equal(serialized.includes(row.storage_key), false, "storage key 不得外流");
    assert.equal(serialized.includes(row.checksum_sha256), false, "checksum 不得外流");
    assert.equal(serialized.includes("/uploads/"), false, "不得出現公開靜態路徑");
    assert.equal(
      serialized.includes(`/orders/${orderId}/payment-proofs/`),
      true,
      "只該有受保護的讀取路徑"
    );
  }
});

test("上傳：假圖片（改副檔名）被 magic bytes 擋下，且不留下任何物件", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const fakeExe = Buffer.concat([Buffer.from("MZ", "ascii"), crypto.randomBytes(64)]);

  const before = fs.readdirSync(path.join(TEST_STORAGE_ROOT, NAMESPACES.PAYMENT_PROOFS)).length;
  const result = await upload(orderId, buyer.userId, [
    multerFile(fakeExe, { originalname: "payload.png", mimetype: "image/png" }),
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.code, "proof_signature_mismatch");
  assert.equal(paymentProof.statusForCode(result.code), 415);
  assert.equal(
    fs.readdirSync(path.join(TEST_STORAGE_ROOT, NAMESPACES.PAYMENT_PROOFS)).length,
    before,
    "被拒絕的上傳不得留下任何物件"
  );
  const { rows } = await db.query(`SELECT COUNT(*)::int c FROM manual_payment_proofs WHERE order_id = $1`, [orderId]);
  assert.equal(rows[0].c, 0);
});

test("上傳：不支援的型別與 MIME 不一致都被擋下", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);

  const pdf = await upload(orderId, buyer.userId, [
    multerFile(Buffer.from("%PDF-1.7\n"), { originalname: "proof.pdf", mimetype: "application/pdf" }),
  ]);
  assert.equal(pdf.ok, false);
  assert.equal(pdf.code, "unsupported_proof_type");

  const mismatched = await upload(orderId, buyer.userId, [
    multerFile(pngBytes(), { originalname: "proof.png", mimetype: "image/jpeg" }),
  ]);
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, "proof_mime_mismatch");
});

test("上傳：一批裡有一個壞檔就整批拒絕，不留半套", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const good = pngBytes();

  const before = fs.readdirSync(path.join(TEST_STORAGE_ROOT, NAMESPACES.PAYMENT_PROOFS)).length;
  const result = await upload(orderId, buyer.userId, [
    multerFile(good, { originalname: "good.png" }),
    multerFile(Buffer.from("<html>", "ascii"), { originalname: "bad.png" }),
  ]);

  assert.equal(result.ok, false);
  assert.equal(
    fs.readdirSync(path.join(TEST_STORAGE_ROOT, NAMESPACES.PAYMENT_PROOFS)).length,
    before,
    "第一張合格的圖也不能留下 —— 沒有任何 DB 列會指向它"
  );
  const { rows } = await db.query(`SELECT COUNT(*)::int c FROM manual_payment_proofs WHERE order_id = $1`, [orderId]);
  assert.equal(rows[0].c, 0);
});

test("上傳：超過單檔上限被拒絕", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const oversized = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(11 * 1024 * 1024),
  ]);

  const result = await upload(orderId, buyer.userId, [multerFile(oversized)]);
  assert.equal(result.ok, false);
  assert.equal(result.code, "proof_too_large");
  assert.equal(paymentProof.statusForCode(result.code), 413);
});

/* -------------------------------------------------------------------------- */
/* 授權                                                                        */
/* -------------------------------------------------------------------------- */

test("授權：訂單擁有者可以讀自己的憑證", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const uploaded = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);

  const resolved = await paymentProof.resolveProofForAccess({
    orderId,
    proofId: uploaded.proofs[0].id,
    user: buyer,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.isOwner, true);
  assert.equal(resolved.isAdmin, false);
});

test("授權：Admin 可以讀任何憑證", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const orderId = await makeOrder(buyer.userId);
  const uploaded = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);

  const resolved = await paymentProof.resolveProofForAccess({
    orderId,
    proofId: uploaded.proofs[0].id,
    user: admin,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.isAdmin, true);
});

test("授權：其他一般使用者被拒絕（知道 order id 與 proof id 也一樣）", async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  const orderId = await makeOrder(owner.userId);
  const uploaded = await upload(orderId, owner.userId, [multerFile(pngBytes())]);

  const resolved = await paymentProof.resolveProofForAccess({
    orderId,
    proofId: uploaded.proofs[0].id,
    user: stranger,
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "forbidden");
  assert.equal(paymentProof.statusForCode(resolved.code), 403);

  const listed = await paymentProof.listOrderProofs({ orderId, user: stranger });
  assert.equal(listed.ok, false);
  assert.equal(listed.code, "forbidden");
});

test("授權：teacher 也不是特權角色 —— 別人的訂單一樣讀不到", async () => {
  const owner = await makeUser();
  const teacher = await makeUser("teacher");
  const orderId = await makeOrder(owner.userId);
  const uploaded = await upload(orderId, owner.userId, [multerFile(pngBytes())]);

  const resolved = await paymentProof.resolveProofForAccess({
    orderId,
    proofId: uploaded.proofs[0].id,
    user: teacher,
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "forbidden");
});

test("授權：沒有身分的請求被拒絕（route 層由 requireAuth 擋，服務層也不放行）", async () => {
  const owner = await makeUser();
  const orderId = await makeOrder(owner.userId);
  const uploaded = await upload(orderId, owner.userId, [multerFile(pngBytes())]);

  // `undefined` / `null` 是匿名；`{}` 與 `{ role: "buyer" }` 是「有物件但沒有 userId」——
  // 後者確認 owner 比對不會因為兩邊都是 undefined 而意外成立。
  for (const user of [undefined, null, {}, { role: "buyer" }]) {
    const resolved = await paymentProof.resolveProofForAccess({
      orderId,
      proofId: uploaded.proofs[0].id,
      user,
    });
    assert.equal(resolved.ok, false, `${JSON.stringify(user)} must be denied`);
    assert.equal(resolved.code, "forbidden");
  }
});

test("IDOR：訂單 A 的擁有者不能用自己的 order id 取訂單 B 的 proof", async () => {
  const buyerA = await makeUser();
  const buyerB = await makeUser();
  const orderA = await makeOrder(buyerA.userId);
  const orderB = await makeOrder(buyerB.userId);

  await upload(orderA, buyerA.userId, [multerFile(pngBytes())]);
  const uploadedB = await upload(orderB, buyerB.userId, [multerFile(pngBytes())]);

  // 用自己的訂單通過授權，再帶別人的 proof id —— 查詢同時綁 id 與 order_id，所以找不到
  const crossed = await paymentProof.resolveProofForAccess({
    orderId: orderA,
    proofId: uploadedB.proofs[0].id,
    user: buyerA,
  });
  assert.equal(crossed.ok, false);
  assert.equal(crossed.code, "proof_not_found");

  // 直接用別人的訂單 id 則卡在授權
  const direct = await paymentProof.resolveProofForAccess({
    orderId: orderB,
    proofId: uploadedB.proofs[0].id,
    user: buyerA,
  });
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "forbidden");
});

test("授權不看訂單狀態或審核結果 —— 憑證是使用者自己的交易紀錄", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const uploaded = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);

  for (const [orderStatus, reviewStatus] of [
    ["approved", "approved"],
    ["cancelled", "rejected"],
  ]) {
    await db.query(`UPDATE orders SET status = $2 WHERE id = $1`, [orderId, orderStatus]);
    await db.query(`UPDATE manual_payment_proofs SET review_status = $2 WHERE id = $1`, [
      uploaded.proofs[0].id,
      reviewStatus,
    ]);
    const resolved = await paymentProof.resolveProofForAccess({
      orderId,
      proofId: uploaded.proofs[0].id,
      user: buyer,
    });
    assert.equal(resolved.ok, true, `${orderStatus}/${reviewStatus} 仍應可讀`);
  }
});

/* -------------------------------------------------------------------------- */
/* 交付與位元組完整性                                                          */
/* -------------------------------------------------------------------------- */

test("binary integrity：讀出來的位元組與上傳的完全相同（SHA-256）", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const bytes = pngBytes();
  const uploadHash = sha256(bytes);

  const uploaded = await upload(orderId, buyer.userId, [multerFile(bytes)]);
  const resolved = await paymentProof.resolveProofForAccess({
    orderId,
    proofId: uploaded.proofs[0].id,
    user: buyer,
  });
  assert.equal(resolved.ok, true);

  const opened = await paymentProof.openProofForDelivery(resolved.proof);
  assert.equal(opened.ok, true);
  assert.equal(opened.sizeBytes, bytes.length);

  const delivered = await drain(opened.stream);
  assert.equal(sha256(delivered), uploadHash, "upload SHA-256 must equal secure-read SHA-256");
  assert.equal(Buffer.compare(delivered, bytes), 0);
});

test("實體物件不見了 → 503（資料是對的，是儲存後端壞了）", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const uploaded = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);
  const row = await readRow(uploaded.proofs[0].id);

  await getPrivateFileStorage().delete(row.storage_key);

  const opened = await paymentProof.openProofForDelivery(row);
  assert.equal(opened.ok, false);
  assert.equal(opened.code, "proof_object_missing");
  assert.equal(paymentProof.statusForCode(opened.code), 503);
});

test("legacy 憑證（未搬移／外部網址／遺失）不回退到公開 URL，一律 409", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);

  for (const status of ["legacy_public", "legacy_external", "legacy_missing"]) {
    const { rows } = await db.query(
      `INSERT INTO manual_payment_proofs(order_id, proof_url, storage_status, review_status, uploaded_at)
       VALUES ($1, $2, $3, 'pending', NOW()) RETURNING id`,
      [orderId, "http://localhost:3000/uploads/payment-proofs/legacy.png", status]
    );
    const resolved = await paymentProof.resolveProofForAccess({
      orderId,
      proofId: rows[0].id,
      user: buyer,
    });
    assert.equal(resolved.ok, false, status);
    assert.equal(resolved.code, "proof_file_unavailable");
    assert.equal(paymentProof.statusForCode(resolved.code), 409);
  }
});

/* -------------------------------------------------------------------------- */
/* Admin 審核契約                                                              */
/* -------------------------------------------------------------------------- */

test("Admin 審核 API 不再回傳 proof_url，改回受保護路徑", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const uploaded = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);
  const proofId = uploaded.proofs[0].id;

  const detail = await adminProofs.getProofDetail(proofId);
  assert.ok(detail);
  assert.equal("proof_url" in detail.proof, false);
  assert.equal(detail.proof.proof_file_available, true);
  assert.equal(
    detail.proof.proof_file_path,
    `/orders/${encodeURIComponent(orderId)}/payment-proofs/${encodeURIComponent(proofId)}/file`
  );

  const row = await readRow(proofId);
  const serialized = JSON.stringify(detail);
  assert.equal(serialized.includes("/uploads/payment-proofs/"), false);
  assert.equal(serialized.includes(row.storage_key), false, "storage key 不得外流");
  assert.equal(serialized.includes(row.checksum_sha256), false, "checksum 不得外流");

  const listed = await adminProofs.listProofs({ q: orderId });
  assert.equal(listed.items.length >= 1, true);
  assert.equal("proof_url" in listed.items[0], false);
});

/* -------------------------------------------------------------------------- */
/* Legacy migration                                                            */
/* -------------------------------------------------------------------------- */

/**
 * legacy 搬移的核心邏輯以 fixture 重現：
 * 公開目錄的檔案 + 指向它的 DB 列 → 搬進私有儲存 → 驗 hash → 更新指標。
 *
 * 這裡不 spawn 那支 CLI（它會對整個資料庫動手，在共用測試庫上不安全），
 * 而是驗證同一組不變條件：位元組一致、指標更新、可重入、來源遺失有明確標記。
 */
test("legacy migration：搬移後位元組一致、指標更新、可重入", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const storage = getPrivateFileStorage();

  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-public-proofs-"));
  const legacyName = `legacy_${uniqueSuffix()}.png`;
  const legacyBytes = pngBytes("legacy");
  fs.writeFileSync(path.join(legacyDir, legacyName), legacyBytes);

  const { rows } = await db.query(
    `INSERT INTO manual_payment_proofs(order_id, proof_url, storage_status, review_status, uploaded_at, original_filename)
     VALUES ($1, $2, 'legacy_public', 'approved', NOW(), $3) RETURNING id`,
    [orderId, `http://localhost:3000/uploads/payment-proofs/${legacyName}`, "舊憑證.png"]
  );
  const proofId = rows[0].id;

  // 搬移前：沒有可交付的位元組
  const beforeMigration = await paymentProof.resolveProofForAccess({ orderId, proofId, user: buyer });
  assert.equal(beforeMigration.ok, false);
  assert.equal(beforeMigration.code, "proof_file_unavailable");

  /** 搬移一列（與 scripts/migrate-payment-proofs-to-private.js 相同的順序）。 */
  async function migrateOne() {
    const current = await readRow(proofId);
    if (current.storage_status === "private" && current.storage_key) return { skipped: true };

    const filename = String(current.proof_url).split("/uploads/payment-proofs/")[1];
    const sourcePath = path.join(legacyDir, filename);
    const sourceHash = sha256(fs.readFileSync(sourcePath));

    const stored = await storage.put(fs.createReadStream(sourcePath), {
      namespace: NAMESPACES.PAYMENT_PROOFS,
    });
    assert.equal(stored.checksumSha256, sourceHash, "寫入時的 hash 必須與來源一致");

    const readBack = sha256(await drain(storage.openReadStream(stored.storageKey)));
    assert.equal(readBack, sourceHash, "讀回來再算一次才算驗證了讀取路徑");

    await db.query(
      `UPDATE manual_payment_proofs
          SET storage_key = $2, checksum_sha256 = $3, storage_status = 'private', updated_at = NOW()
        WHERE id = $1`,
      [proofId, stored.storageKey, sourceHash]
    );
    return { skipped: false, storageKey: stored.storageKey };
  }

  const first = await migrateOne();
  assert.equal(first.skipped, false);

  // 搬移後：可交付，而且位元組與公開來源逐 byte 相同
  const after = await paymentProof.resolveProofForAccess({ orderId, proofId, user: buyer });
  assert.equal(after.ok, true);
  const opened = await paymentProof.openProofForDelivery(after.proof);
  assert.equal(opened.ok, true);
  assert.equal(sha256(await drain(opened.stream)), sha256(legacyBytes));

  // 可重入：重跑不會產生第二份副本
  const objectsBefore = fs.readdirSync(path.join(TEST_STORAGE_ROOT, NAMESPACES.PAYMENT_PROOFS)).length;
  const second = await migrateOne();
  assert.equal(second.skipped, true, "已經是 private 的列必須被跳過");
  assert.equal(
    fs.readdirSync(path.join(TEST_STORAGE_ROOT, NAMESPACES.PAYMENT_PROOFS)).length,
    objectsBefore,
    "重跑不得產生第二份副本"
  );

  // 搬移完成且驗證過，公開副本才可以刪
  fs.unlinkSync(path.join(legacyDir, legacyName));
  const afterCleanup = await paymentProof.resolveProofForAccess({ orderId, proofId, user: buyer });
  assert.equal(afterCleanup.ok, true, "刪掉公開副本之後仍然讀得到");

  fs.rmSync(legacyDir, { recursive: true, force: true });
});

test("legacy migration：來源檔不存在 → 標記 legacy_missing，不靜默丟棄", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);

  const { rows } = await db.query(
    `INSERT INTO manual_payment_proofs(order_id, proof_url, storage_status, review_status, uploaded_at)
     VALUES ($1, $2, 'legacy_public', 'approved', NOW()) RETURNING id`,
    [orderId, "http://localhost:3000/uploads/payment-proofs/does_not_exist.png"]
  );
  const proofId = rows[0].id;

  await db.query(
    `UPDATE manual_payment_proofs SET storage_status = 'legacy_missing' WHERE id = $1`,
    [proofId]
  );

  const row = await readRow(proofId);
  assert.equal(row.storage_status, "legacy_missing");
  assert.equal(row.storage_key, null);
  // 列還在（稽核紀錄保留），只是沒有可交付的檔案
  const resolved = await paymentProof.resolveProofForAccess({ orderId, proofId, user: buyer });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "proof_file_unavailable");
});

test("schema：宣稱 private 就必須有 storage_key（DB 層擋下不一致）", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);

  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO manual_payment_proofs(order_id, storage_status, review_status, uploaded_at)
         VALUES ($1, 'private', 'pending', NOW())`,
        [orderId]
      ),
    /mpp_private_requires_storage_key/
  );
});

test("schema：同一個 storage_key 不能被兩列指向", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer.userId);
  const uploaded = await upload(orderId, buyer.userId, [multerFile(pngBytes())]);
  const row = await readRow(uploaded.proofs[0].id);

  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO manual_payment_proofs(order_id, storage_key, storage_status, review_status, uploaded_at)
         VALUES ($1, $2, 'private', 'pending', NOW())`,
        [orderId, row.storage_key]
      ),
    /uq_manual_payment_proofs_storage_key/
  );
});
