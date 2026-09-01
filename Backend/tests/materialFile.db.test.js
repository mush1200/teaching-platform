/**
 * 教材本體檔案與安全交付的資料庫測試。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 * 每個 case 自己建立 fixture、自己清掉。
 *
 * 這裡鎖的是三條**壞了也不會有人在畫面上發現**的不變條件：
 *
 *   1. 候選檔永遠不會變成買家可下載的東西（除非 Admin 核准）
 *   2. 創作者的任何動作都寫不到 `approved_file_id`
 *   3. 買家的下載授權綁定訂單，且下載票只能用一次
 *
 * 儲存後端在這裡是真的（local driver 寫進暫存目錄），因為「DB 說有檔案但磁碟上沒有」
 * 正是最需要被驗證的失敗模式之一。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

/*
 * 測試專用的私有儲存根目錄。必須在 require 服務層**之前**設定 ——
 * driver 是在第一次取用時依當下的環境變數建立的。
 */
const TEST_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "material-files-dbtest-"));
process.env.MATERIAL_FILE_STORAGE_PATH = TEST_STORAGE_ROOT;

const db = require("../config/db");
const materialFile = require("../services/materialFile.service");
const materialReview = require("../services/materialReview.service");
const workflow = require("../utils/materialWorkflow");

/** 這些測試會寫入資料；跑錯資料庫是不可接受的。 */
test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

test("guard: material files are stored outside the public uploads directory", () => {
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

const created = { materials: [], users: [], orders: [] };

async function makeUser(role) {
  const id = `usr_mf_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return { userId: id, role };
}

async function makeMaterial(teacherId, status = "pending_review") {
  const id = `mat_mf_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, $4, NULL)`,
    [id, `檔案測試教材 ${id}`, teacherId, status]
  );
  created.materials.push(id);
  return id;
}

/** 走真正的上傳路徑（含 magic bytes 檢查與 SHA-256），回傳 `{ fileId, bytes }`。 */
async function uploadFile(uploadedBy, { seed = uniqueSuffix(), filename = "教材.pdf" } = {}) {
  const bytes = Buffer.from(`%PDF-1.7\n% db test ${seed}\n%%EOF\n`, "latin1");
  const result = await materialFile.storeUpload({
    readable: Readable.from([bytes]),
    originalFilename: filename,
    declaredMimeType: "application/pdf",
    uploadedBy,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return { fileId: result.file.id, bytes };
}

/** 在 transaction 內認領候選檔（正式路徑就是這樣用的）。 */
async function claim(materialId, fileId, userId) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await materialFile.claimCandidate(client, { materialId, fileId, userId });
    await client.query(result.ok ? "COMMIT" : "ROLLBACK");
    return result;
  } finally {
    client.release();
  }
}

async function readMaterial(id) {
  const { rows } = await db.query(`SELECT * FROM materials WHERE id = $1`, [id]);
  return rows[0];
}

async function readFile(id) {
  const { rows } = await db.query(`SELECT * FROM material_files WHERE id = $1`, [id]);
  return rows[0];
}

/** 建立一張已核准的訂單，讓 buyer 對這份教材具備下載授權。 */
async function makeApprovedOrder(buyerId, materialId) {
  const orderId = `ord_mf_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'approved', 'manual_transfer', 100, 100, 0)`,
    [orderId, buyerId]
  );
  await db.query(
    `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, subtotal)
     VALUES ($1, $2, $3, 'fixture', 100, 1, 100)`,
    [`oi_mf_${uniqueSuffix()}`, orderId, materialId]
  );
  created.orders.push(orderId);
  return orderId;
}

test.after(async () => {
  if (created.materials.length > 0) {
    await db.query(
      `UPDATE materials SET approved_file_id = NULL, pending_file_id = NULL WHERE id = ANY($1)`,
      [created.materials]
    );
    await db.query(`DELETE FROM material_download_tokens WHERE material_id = ANY($1)`, [created.materials]);
    await db.query(`DELETE FROM material_files WHERE material_id = ANY($1)`, [created.materials]);
    await db.query(`DELETE FROM activity_logs WHERE target_type = 'material' AND target_id = ANY($1)`, [
      created.materials,
    ]);
  }
  if (created.orders.length > 0) {
    await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
    await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
  }
  if (created.users.length > 0) {
    await db.query(`DELETE FROM material_files WHERE uploaded_by = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  if (created.materials.length > 0) {
    await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
  }
  fs.rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });
  // 通知信是 fire-and-forget，等它落地再收線（否則會噴 pool 已關閉的誤導性錯誤）。
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.pool.end();
});

/* ---------------------------------------------------------------- *
 * 上傳與認領
 * ---------------------------------------------------------------- */

test("upload: 產生 unattached 檔案列、真實 checksum，且不外流 storage key", async () => {
  const creator = await makeUser("teacher");
  const { fileId, bytes } = await uploadFile(creator.userId);

  const row = await readFile(fileId);
  assert.equal(row.status, "unattached");
  assert.equal(row.material_id, null);
  assert.equal(Number(row.size_bytes), bytes.length);
  assert.equal(row.checksum_sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
  // client 宣告什麼不重要，存的是平台自己的 canonical 值。
  assert.equal(row.mime_type, "application/pdf");

  const shape = materialFile.publicFileShape(row);
  assert.equal("storage_key" in shape, false);
  assert.equal("checksum_sha256" in shape, false);
  assert.equal("uploaded_by" in shape, false);
});

test("upload: 改了副檔名的執行檔在串流途中就被擋下，不留下任何物件", async () => {
  const creator = await makeUser("teacher");
  const before = fs.readdirSync(path.join(TEST_STORAGE_ROOT, "material-files")).length;

  const result = await materialFile.storeUpload({
    readable: Readable.from([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])]),
    originalFilename: "教材.pdf",
    declaredMimeType: "application/pdf",
    uploadedBy: creator.userId,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "signature_mismatch");
  assert.equal(
    fs.readdirSync(path.join(TEST_STORAGE_ROOT, "material-files")).length,
    before,
    "rejected upload must not leave an object behind"
  );
});

test("upload: 超過大小上限的檔案被拒絕", async () => {
  const creator = await makeUser("teacher");
  const previous = process.env.MAX_MATERIAL_FILE_BYTES;
  process.env.MAX_MATERIAL_FILE_BYTES = "64";
  try {
    const result = await materialFile.storeUpload({
      readable: Readable.from([Buffer.from(`%PDF-1.7\n${"x".repeat(500)}`, "latin1")]),
      originalFilename: "big.pdf",
      declaredMimeType: "application/pdf",
      uploadedBy: creator.userId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "file_too_large");
  } finally {
    if (previous === undefined) delete process.env.MAX_MATERIAL_FILE_BYTES;
    else process.env.MAX_MATERIAL_FILE_BYTES = previous;
  }
});

test("claim: 認領之後檔案成為候選，materials.pending_file_id 指向它", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);

  assert.equal((await claim(materialId, fileId, creator.userId)).ok, true);

  assert.equal((await readFile(fileId)).status, "candidate");
  const material = await readMaterial(materialId);
  assert.equal(material.pending_file_id, fileId);
  // 關鍵：候選檔**不會**變成已核准檔。
  assert.equal(material.approved_file_id, null);
});

test("claim: 別人上傳的檔案不能被認領（跨創作者隔離）", async () => {
  const owner = await makeUser("teacher");
  const attacker = await makeUser("teacher");
  const materialId = await makeMaterial(attacker.userId);
  const { fileId } = await uploadFile(owner.userId);

  const result = await claim(materialId, fileId, attacker.userId);
  assert.equal(result.ok, false);
  assert.equal(result.code, "file_not_available");
  // 受害者的檔案完全沒被動到。
  const row = await readFile(fileId);
  assert.equal(row.status, "unattached");
  assert.equal(row.material_id, null);
});

test("claim: 同一個檔案不能被認領兩次", async () => {
  const creator = await makeUser("teacher");
  const first = await makeMaterial(creator.userId);
  const second = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);

  assert.equal((await claim(first, fileId, creator.userId)).ok, true);
  const again = await claim(second, fileId, creator.userId);
  assert.equal(again.ok, false);
  assert.equal(again.code, "file_not_available");
  assert.equal((await readMaterial(second)).pending_file_id, null);
});

test("claim: 換候選檔時舊的候選退場，一份教材永遠只有一個 candidate", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId, "changes_requested");
  const first = await uploadFile(creator.userId);
  const second = await uploadFile(creator.userId);

  await claim(materialId, first.fileId, creator.userId);
  await claim(materialId, second.fileId, creator.userId);

  assert.equal((await readFile(first.fileId)).status, "superseded");
  assert.equal((await readFile(second.fileId)).status, "candidate");
  assert.equal((await readMaterial(materialId)).pending_file_id, second.fileId);

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM material_files WHERE material_id = $1 AND status = 'candidate'`,
    [materialId]
  );
  assert.equal(rows[0].n, 1);
});

/* ---------------------------------------------------------------- *
 * 核准與升級
 * ---------------------------------------------------------------- */

test("approve: 候選檔升級為已核准，指標交換且 pending 清空", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);

  const result = await materialReview.approveMaterial(materialId, admin);
  assert.equal(result.ok, true);
  assert.equal(result.fileApproved, true);

  const material = await readMaterial(materialId);
  assert.equal(material.status, "published");
  assert.equal(material.approved_file_id, fileId);
  assert.equal(material.pending_file_id, null);

  const file = await readFile(fileId);
  assert.equal(file.status, "approved");
  assert.equal(file.approved_by, admin.userId);
  assert.notEqual(file.approved_at, null);
});

test("approve: 沒有任何教材檔案時拒絕上架（不會賣出下載不到的東西）", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(creator.userId);

  const result = await materialReview.approveMaterial(materialId, admin);
  assert.equal(result.ok, false);
  assert.equal(result.code, "candidate_required");
  assert.equal(materialReview.ERROR_STATUS.candidate_required, 409);

  // 整筆回滾：狀態不能因為失敗的核准而改變。
  assert.equal((await readMaterial(materialId)).status, "pending_review");
});

test("approve: 新版核准後舊版變成 superseded，買家自動拿到最新版", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);

  const v1 = await uploadFile(creator.userId, { seed: "v1" });
  await claim(materialId, v1.fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);
  await makeApprovedOrder(buyer.userId, materialId);

  // 下架 → 換檔 → 重新送審 → 再核准
  await db.query(`UPDATE materials SET status = 'unpublished' WHERE id = $1`, [materialId]);
  const v2 = await uploadFile(creator.userId, { seed: "v2" });
  await claim(materialId, v2.fileId, creator.userId);
  await materialReview.resubmitMaterial(materialId, creator);
  const approved = await materialReview.approveMaterial(materialId, admin);
  assert.equal(approved.ok, true);

  assert.equal((await readFile(v1.fileId)).status, "superseded");
  assert.equal((await readFile(v2.fileId)).status, "approved");

  // 授權綁定教材而非版本：同一張舊訂單現在解析到新檔。
  const resolved = await materialFile.resolveEntitledFile({ userId: buyer.userId, materialId });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.file.id, v2.fileId);
});

test("approve: 沒有新候選檔時保留原本的已核准檔，不會把教材變成無檔可下載", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);

  await db.query(`UPDATE materials SET status = 'unpublished' WHERE id = $1`, [materialId]);
  await materialReview.resubmitMaterial(materialId, creator);
  const again = await materialReview.approveMaterial(materialId, admin);

  assert.equal(again.ok, true);
  assert.equal(again.fileApproved, false, "沒有新檔就不該產生升級事件");
  assert.equal((await readMaterial(materialId)).approved_file_id, fileId);
});

test("workflow: 只有 changes_requested / unpublished 可以換檔", () => {
  assert.equal(workflow.canReplaceFile("changes_requested"), true);
  assert.equal(workflow.canReplaceFile("unpublished"), true);
  // 已上架換檔 = 在買家背後偷換已售出的商品；待審換檔 = 讓 Admin 審的東西在腳下改變。
  assert.equal(workflow.canReplaceFile("published"), false);
  assert.equal(workflow.canReplaceFile("pending_review"), false);
});

/* ---------------------------------------------------------------- *
 * 買家授權與交付
 * ---------------------------------------------------------------- */

test("entitlement: 沒有已核准訂單就沒有下載權", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const stranger = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);

  const result = await materialFile.resolveEntitledFile({ userId: stranger.userId, materialId });
  assert.equal(result.ok, false);
  assert.equal(result.code, "not_entitled");
});

test("entitlement: 訂單尚未核准時沒有下載權", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);

  const orderId = await makeApprovedOrder(buyer.userId, materialId);
  await db.query(`UPDATE orders SET status = 'pending_payment' WHERE id = $1`, [orderId]);

  const result = await materialFile.resolveEntitledFile({ userId: buyer.userId, materialId });
  assert.equal(result.ok, false);
  assert.equal(result.code, "not_entitled");
});

test("entitlement: 教材下架不會沒收已付款買家的下載權", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);
  await makeApprovedOrder(buyer.userId, materialId);

  await db.query(`UPDATE materials SET status = 'unpublished' WHERE id = $1`, [materialId]);

  const result = await materialFile.resolveEntitledFile({ userId: buyer.userId, materialId });
  assert.equal(result.ok, true, "買家買到的東西不會因為教材下架而消失");
  assert.equal(result.file.id, fileId);
});

test("entitlement: 待審候選檔永遠不會被解析成買家可下載的檔案", async () => {
  const creator = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await makeApprovedOrder(buyer.userId, materialId);

  // 教材有候選檔、買家有訂單 —— 唯一缺的是 Admin 核准。
  const result = await materialFile.resolveEntitledFile({ userId: buyer.userId, materialId });
  assert.equal(result.ok, false);
  assert.equal(result.code, "material_file_unavailable");
});

test("entitlement: legacy 教材（沒有真檔）回 409 而不是 403 或 500", async () => {
  const creator = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId, "published");
  await db.query(`UPDATE materials SET file_key = 'files/legacy.pdf' WHERE id = $1`, [materialId]);
  await makeApprovedOrder(buyer.userId, materialId);

  const result = await materialFile.resolveEntitledFile({ userId: buyer.userId, materialId });
  assert.equal(result.ok, false);
  assert.equal(result.code, "material_file_unavailable");
  assert.equal(materialFile.statusForCode(result.code), 409);
  assert.equal(result.message, "此教材目前尚未提供可下載檔案。");
});

test("entitlement: 已停止交付（revoked）的檔案不會被交付", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);
  await makeApprovedOrder(buyer.userId, materialId);

  await db.query(`UPDATE material_files SET status = 'revoked' WHERE id = $1`, [fileId]);

  const result = await materialFile.resolveEntitledFile({ userId: buyer.userId, materialId });
  assert.equal(result.ok, false);
  assert.equal(result.code, "material_file_unavailable");
});

/* ---------------------------------------------------------------- *
 * 下載票
 * ---------------------------------------------------------------- */

test("token: 只能用一次，且資料庫只存雜湊", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);
  await makeApprovedOrder(buyer.userId, materialId);

  const { rawToken, expiresInSeconds } = await materialFile.issueDownloadToken({
    userId: buyer.userId,
    materialId,
    fileId,
  });
  assert.ok(expiresInSeconds > 0);

  // 明文 token 不得出現在資料庫任何一列。
  const stored = await db.query(`SELECT token_hash FROM material_download_tokens WHERE material_id = $1`, [
    materialId,
  ]);
  assert.equal(stored.rows.some((r) => r.token_hash === rawToken), false);
  assert.equal(
    stored.rows.some((r) => r.token_hash === crypto.createHash("sha256").update(rawToken).digest("hex")),
    true
  );

  const first = await materialFile.consumeDownloadToken(rawToken);
  assert.equal(first.ok, true);
  assert.equal(first.file.id, fileId);
  assert.equal(first.token.user_id, buyer.userId);

  const replay = await materialFile.consumeDownloadToken(rawToken);
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "download_token_invalid");
});

test("token: 過期的票不能用", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(creator.userId);
  const { fileId } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);
  await makeApprovedOrder(buyer.userId, materialId);

  const { rawToken } = await materialFile.issueDownloadToken({ userId: buyer.userId, materialId, fileId });
  await db.query(
    `UPDATE material_download_tokens SET expires_at = NOW() - interval '1 minute' WHERE token_hash = $1`,
    [crypto.createHash("sha256").update(rawToken).digest("hex")]
  );

  const result = await materialFile.consumeDownloadToken(rawToken);
  assert.equal(result.ok, false);
  assert.equal(result.code, "download_token_invalid");
});

test("token: 亂猜的票與空值都回同一個錯誤（不洩漏差異）", async () => {
  for (const value of ["not-a-real-token", "", null, undefined]) {
    const result = await materialFile.consumeDownloadToken(value);
    assert.equal(result.ok, false);
    assert.equal(result.code, "download_token_invalid");
  }
});

test("delivery: 位元組 round-trip 與上傳內容完全一致", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(creator.userId);
  const { fileId, bytes } = await uploadFile(creator.userId);
  await claim(materialId, fileId, creator.userId);
  await materialReview.approveMaterial(materialId, admin);

  const opened = await materialFile.openFileForDelivery(await readFile(fileId));
  assert.equal(opened.ok, true);

  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  const delivered = Buffer.concat(chunks);

  assert.equal(Buffer.compare(delivered, bytes), 0);
  assert.equal(opened.sizeBytes, bytes.length);
});

test("delivery: DB 有列但實體不見了 → 503，不是 404", async () => {
  const creator = await makeUser("teacher");
  const { fileId } = await uploadFile(creator.userId);
  const row = await readFile(fileId);

  fs.rmSync(path.join(TEST_STORAGE_ROOT, row.storage_key), { force: true });

  const opened = await materialFile.openFileForDelivery(row);
  assert.equal(opened.ok, false);
  assert.equal(opened.code, "file_object_missing");
  // 資料是對的，是基礎設施壞了 —— 回 404 會讓人以為是資料問題。
  assert.equal(materialFile.statusForCode(opened.code), 503);
});

/* ---------------------------------------------------------------- *
 * 孤兒清理
 * ---------------------------------------------------------------- */

test("cleanup: 只清超過 TTL 且未被認領的上傳", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);

  const stale = await uploadFile(creator.userId, { seed: "stale" });
  const fresh = await uploadFile(creator.userId, { seed: "fresh" });
  const claimed = await uploadFile(creator.userId, { seed: "claimed" });
  await claim(materialId, claimed.fileId, creator.userId);

  // 把其中一筆的上傳時間往回推，讓它超過 TTL。
  await db.query(`UPDATE material_files SET uploaded_at = NOW() - interval '48 hours' WHERE id = $1`, [
    stale.fileId,
  ]);
  // 已認領的那筆即使很舊也不能被清掉。
  await db.query(`UPDATE material_files SET uploaded_at = NOW() - interval '48 hours' WHERE id = $1`, [
    claimed.fileId,
  ]);

  const staleKey = (await readFile(stale.fileId)).storage_key;
  const result = await materialFile.cleanupOrphans({ olderThanHours: 24 });
  assert.ok(result.candidates >= 1);

  assert.equal(await readFile(stale.fileId), undefined, "過期的孤兒應被刪除");
  assert.equal(fs.existsSync(path.join(TEST_STORAGE_ROOT, staleKey)), false, "實體檔案也要刪掉");
  assert.notEqual(await readFile(fresh.fileId), undefined, "還在 TTL 內的上傳不能動");
  assert.equal((await readFile(claimed.fileId)).status, "candidate", "已認領的檔案永遠不是孤兒");
});
