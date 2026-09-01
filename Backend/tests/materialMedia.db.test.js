/**
 * 教材行銷素材（封面／詳情圖／試看影片）的私有儲存與**條件公開**交付測試。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 * 每個 case 自己建立 fixture、自己清掉。
 *
 * 這裡鎖的是 `SEC-02` 的三條不變條件 —— 全都是**壞了也不會有人在畫面上發現**的：
 *
 *   1. 可見性由所屬教材的 `status` 決定，不由檔名決定。
 *      下架（`unpublished`）**立即**撤回匿名存取 —— 這是舊的 `express.static`
 *      做不到的事：URL 一旦流出去，下架就再也撤不回來。
 *   2. 未認領的上傳只有上傳者或 Admin 看得到。
 *   3. 認領必須驗擁有權 —— 否則創作者 B 只要把 A 的未上架素材 id 填進自己的教材
 *      再上架，就能讓 A 的私有素材變成公開的。
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
const TEST_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "material-media-dbtest-"));
process.env.PRIVATE_FILE_STORAGE_PATH = TEST_STORAGE_ROOT;
delete process.env.MATERIAL_FILE_STORAGE_PATH;

const db = require("../config/db");
const media = require("../services/materialMedia.service");

/** 這些測試會寫入資料；跑錯資料庫是不可接受的。 */
test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

test("guard: 素材儲存在公開 uploads/ 之外", () => {
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

const created = { materials: [], users: [] };

async function makeUser(role) {
  const id = `usr_mm_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return { userId: id, role };
}

async function makeMaterial(teacherId, status = "pending_review") {
  const id = `mat_mm_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, $4, NULL)`,
    [id, `素材測試教材 ${id}`, teacherId, status]
  );
  created.materials.push(id);
  return id;
}

/** 一張最小但合法的 PNG（magic bytes 是真的，會通過第三層驗證）。 */
function pngBytes(seed = "") {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`IHDR-fixture-${seed}`, "latin1"),
  ]);
}

/** 走真正的上傳路徑（含 magic bytes 檢查與 SHA-256）。 */
async function upload(uploadedBy, { kind = "cover", seed = uniqueSuffix(), filename = "封面.png" } = {}) {
  const bytes = pngBytes(seed);
  const result = await media.storeUpload({
    readable: Readable.from([bytes]),
    kind,
    originalFilename: filename,
    declaredMimeType: "image/png",
    uploadedBy,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return { mediaId: result.media.id, url: result.media.url, bytes };
}

/** 在 transaction 內認領（正式路徑就是這樣用的）。 */
async function claim(materialId, urls, userId, isAdmin = false) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await media.claimForMaterial(client, { materialId, urls, userId, isAdmin });
    await client.query(result.ok ? "COMMIT" : "ROLLBACK");
    return result;
  } finally {
    client.release();
  }
}

async function readRow(mediaId) {
  const { rows } = await db.query(`SELECT * FROM material_media_files WHERE id = $1`, [mediaId]);
  return rows[0];
}

/** 授權判斷的簡寫：回 `"ok"` 或錯誤碼。 */
async function access(mediaId, user) {
  const result = await media.resolveForAccess({ mediaId, user });
  return result.ok ? "ok" : result.code;
}

const ANON = null;

test.after(async () => {
  if (created.materials.length > 0) {
    await db.query(`DELETE FROM material_media_files WHERE material_id = ANY($1)`, [created.materials]);
  }
  if (created.users.length > 0) {
    await db.query(`DELETE FROM material_media_files WHERE uploaded_by = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  if (created.materials.length > 0) {
    await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
  }
  fs.rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });
  await db.pool.end();
});

/* ---------------------------------------------------------------- *
 * 上傳
 * ---------------------------------------------------------------- */

test("上傳寫進私有儲存，DB 只留 opaque key，回應不含 key 或 checksum", async () => {
  const creator = await makeUser("teacher");
  const bytes = pngBytes("shape");
  const result = await media.storeUpload({
    readable: Readable.from([bytes]),
    kind: "cover",
    originalFilename: "封面.png",
    declaredMimeType: "image/png",
    uploadedBy: creator.userId,
  });
  assert.equal(result.ok, true, JSON.stringify(result));

  // 對外形狀不得洩漏儲存資訊。
  assert.deepEqual(
    Object.keys(result.media).sort(),
    ["id", "kind", "materialId", "mimeType", "originalFilename", "sizeBytes", "uploadedAt", "url"].sort()
  );
  assert.equal(JSON.stringify(result.media).includes("material-media/"), false, "storage key 不得外流");

  const row = await readRow(result.media.id);
  assert.match(row.storage_key, /^material-media\/[0-9a-f-]{36}$/);
  assert.equal(row.material_id, null, "剛上傳的素材尚未認領");
  assert.equal(row.claimed_at, null);
  assert.equal(row.mime_type, "image/png");
  assert.equal(Number(row.size_bytes), bytes.length);

  // 位元組真的落在私有根目錄裡，而且內容一致。
  const onDisk = fs.readFileSync(path.join(TEST_STORAGE_ROOT, row.storage_key));
  assert.equal(onDisk.equals(bytes), true);
  assert.equal(
    row.checksum_sha256,
    crypto.createHash("sha256").update(bytes).digest("hex"),
    "checksum 必須是上傳時串流計算出來的真值"
  );
});

test("magic bytes 不符的檔案不會留下任何 DB 列或磁碟物件", async () => {
  const creator = await makeUser("teacher");
  const before = fs.readdirSync(path.join(TEST_STORAGE_ROOT, "material-media")).length;

  const result = await media.storeUpload({
    readable: Readable.from([Buffer.from("MZ\x90\x00 not a png at all", "latin1")]),
    kind: "cover",
    originalFilename: "totally-a-cover.png",
    declaredMimeType: "image/png",
    uploadedBy: creator.userId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "media_signature_mismatch");

  const after = fs.readdirSync(path.join(TEST_STORAGE_ROOT, "material-media")).length;
  assert.equal(after, before, "被拒絕的上傳不得留下半成品");
});

test("demo 只收影片：拿圖片當試看影片會在宣告層被擋", async () => {
  const creator = await makeUser("teacher");
  const result = await media.storeUpload({
    readable: Readable.from([pngBytes("wrongkind")]),
    kind: "demo",
    originalFilename: "封面.png",
    declaredMimeType: "image/png",
    uploadedBy: creator.userId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unsupported_media_type");
});

/* ---------------------------------------------------------------- *
 * 認領（不變條件 #3）
 * ---------------------------------------------------------------- */

test("上傳者可以把自己的素材認領到自己的教材上", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);
  const cover = await upload(creator.userId);

  const result = await claim(materialId, [cover.url], creator.userId);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.claimed, [cover.mediaId]);

  const row = await readRow(cover.mediaId);
  assert.equal(row.material_id, materialId);
  assert.notEqual(row.claimed_at, null, "claim_check 約束要求兩個欄位一起成立");
});

test("**不能把別人的未認領素材綁到自己的教材上**（提權路徑）", async () => {
  const victim = await makeUser("teacher");
  const attacker = await makeUser("teacher");
  const victimMedia = await upload(victim.userId, { seed: "victim" });
  const attackerMaterial = await makeMaterial(attacker.userId, "published");

  const result = await claim(attackerMaterial, [victimMedia.url], attacker.userId);
  assert.equal(result.ok, false);
  assert.equal(result.code, "media_not_claimable");

  // 受害者的素材完全沒被動到，而且對攻擊者仍然不可見。
  const row = await readRow(victimMedia.mediaId);
  assert.equal(row.material_id, null);
  assert.equal(await access(victimMedia.mediaId, attacker), "forbidden");
  assert.equal(await access(victimMedia.mediaId, ANON), "media_auth_required");
});

test("已屬於某教材的素材不能被第二份教材認領", async () => {
  const creator = await makeUser("teacher");
  const first = await makeMaterial(creator.userId);
  const second = await makeMaterial(creator.userId);
  const cover = await upload(creator.userId);

  assert.equal((await claim(first, [cover.url], creator.userId)).ok, true);

  const result = await claim(second, [cover.url], creator.userId);
  assert.equal(result.ok, false);
  assert.equal(result.code, "media_not_claimable");
  assert.equal((await readRow(cover.mediaId)).material_id, first, "原本的歸屬不得被改寫");
});

test("重複認領同一份教材是 no-op（重送同一份 payload 是常態）", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);
  const cover = await upload(creator.userId);

  assert.deepEqual((await claim(materialId, [cover.url], creator.userId)).claimed, [cover.mediaId]);
  const again = await claim(materialId, [cover.url], creator.userId);
  assert.equal(again.ok, true);
  assert.deepEqual(again.claimed, [], "已經是自己的素材不需要再認領一次");
});

test("外部 CDN 連結被忽略（合法用法，不是錯誤）", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);

  const result = await claim(
    materialId,
    ["https://images.example.com/cover.jpg", "https://cdn.example.com/demo.mp4", null, undefined],
    creator.userId
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.claimed, []);
});

test("形狀像平台素材、DB 卻沒有的 URL 明確拒絕（不會存進一個永遠 404 的連結）", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);
  const ghost = `http://localhost:3000/materials/media/${crypto.randomUUID()}`;

  const result = await claim(materialId, [ghost], creator.userId);
  assert.equal(result.ok, false);
  assert.equal(result.code, "media_not_claimable");
});

test("Admin 可以認領他人上傳的未認領素材（後台代編輯）", async () => {
  const creator = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(creator.userId);
  const cover = await upload(creator.userId);

  const result = await claim(materialId, [cover.url], admin.userId, true);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal((await readRow(cover.mediaId)).material_id, materialId);
});

test("parseMediaId 只認交付路徑，其餘一律 null", async () => {
  const id = crypto.randomUUID();
  assert.equal(media.parseMediaId(`http://localhost:3000/materials/media/${id}`), id);
  assert.equal(media.parseMediaId(`/materials/media/${id}`), id);
  assert.equal(media.parseMediaId(`/materials/media/${id}?v=2`), id);
  assert.equal(media.parseMediaId(`/materials/media/${id}/`), id);
  assert.equal(media.parseMediaId("https://images.example.com/cover.jpg"), null);
  assert.equal(media.parseMediaId("/uploads/material-media/abc123.png"), null);
  assert.equal(media.parseMediaId(`/materials/media/${id}/../../etc/passwd`), null);
  assert.equal(media.parseMediaId(null), null);
});

/* ---------------------------------------------------------------- *
 * 授權矩陣（不變條件 #1 與 #2）—— SEC-02 的核心
 * ---------------------------------------------------------------- */

test("授權矩陣：四種教材狀態 × 五種身分", async () => {
  const owner = await makeUser("teacher");
  const otherTeacher = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const admin = await makeUser("admin");

  for (const status of ["published", "pending_review", "changes_requested", "unpublished"]) {
    const materialId = await makeMaterial(owner.userId, status);
    const cover = await upload(owner.userId, { seed: `matrix-${status}` });
    assert.equal((await claim(materialId, [cover.url], owner.userId)).ok, true);

    const anonymous = await access(cover.mediaId, ANON);
    const expected = status === "published" ? "ok" : "media_auth_required";
    assert.equal(anonymous, expected, `${status} + 匿名`);

    // 教材擁有者與 Admin 在任何狀態下都看得到（審核與編輯都需要）。
    assert.equal(await access(cover.mediaId, owner), "ok", `${status} + 擁有者`);
    assert.equal(await access(cover.mediaId, admin), "ok", `${status} + admin`);

    // 其他人：published 才看得到。
    const otherExpected = status === "published" ? "ok" : "forbidden";
    assert.equal(await access(cover.mediaId, otherTeacher), otherExpected, `${status} + 其他創作者`);
    assert.equal(await access(cover.mediaId, buyer), otherExpected, `${status} + 買家`);
  }
});

test("未認領的素材只有上傳者與 Admin 看得到（不變條件 #2）", async () => {
  const uploader = await makeUser("teacher");
  const otherTeacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const orphan = await upload(uploader.userId, { seed: "orphan" });

  assert.equal(await access(orphan.mediaId, uploader), "ok");
  assert.equal(await access(orphan.mediaId, admin), "ok");
  assert.equal(await access(orphan.mediaId, otherTeacher), "forbidden");
  assert.equal(await access(orphan.mediaId, ANON), "media_auth_required");
});

test("**下架立即撤回匿名存取** —— 同一條 URL，status 一變就取不到", async () => {
  const owner = await makeUser("teacher");
  const materialId = await makeMaterial(owner.userId, "published");
  const cover = await upload(owner.userId, { seed: "revoke" });
  assert.equal((await claim(materialId, [cover.url], owner.userId)).ok, true);

  // 上架期間：任何人都拿得到（公開商品頁需要），且允許共享快取。
  const published = await media.resolveForAccess({ mediaId: cover.mediaId, user: ANON });
  assert.equal(published.ok, true);
  assert.equal(published.isPublic, true);

  // 檢舉處置下架（`unpublish_material` 是唯一的下架路徑）。
  await db.query(`UPDATE materials SET status = 'unpublished' WHERE id = $1`, [materialId]);

  // 舊的 static 實作在這裡會**繼續**吐出位元組 —— 這正是 SEC-02 修的東西。
  assert.equal(await access(cover.mediaId, ANON), "media_auth_required");
  assert.equal(await access(cover.mediaId, owner), "ok", "創作者仍要看得到自己的素材");
});

test("重新上架後匿名存取自動恢復（不需要搬檔案或換 URL）", async () => {
  const owner = await makeUser("teacher");
  const materialId = await makeMaterial(owner.userId, "unpublished");
  const cover = await upload(owner.userId, { seed: "restore" });
  assert.equal((await claim(materialId, [cover.url], owner.userId)).ok, true);
  assert.equal(await access(cover.mediaId, ANON), "media_auth_required");

  await db.query(`UPDATE materials SET status = 'published' WHERE id = $1`, [materialId]);
  assert.equal(await access(cover.mediaId, ANON), "ok");
});

test("不存在的 media id 回 404，不洩漏它存不存在的差別", async () => {
  assert.equal(await access(crypto.randomUUID(), ANON), "media_not_found");
});

/* ---------------------------------------------------------------- *
 * 交付
 * ---------------------------------------------------------------- */

test("交付的位元組與上傳的完全一致", async () => {
  const owner = await makeUser("teacher");
  const materialId = await makeMaterial(owner.userId, "published");
  const cover = await upload(owner.userId, { seed: "deliver" });
  assert.equal((await claim(materialId, [cover.url], owner.userId)).ok, true);

  const resolved = await media.resolveForAccess({ mediaId: cover.mediaId, user: ANON });
  assert.equal(resolved.ok, true);
  const opened = await media.openForDelivery(resolved.media, null);
  assert.equal(opened.ok, true);
  assert.equal(opened.sizeBytes, cover.bytes.length);

  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).equals(cover.bytes), true);
});

test("Range 交付回傳正確的區間（試看影片拖曳進度條靠它）", async () => {
  const owner = await makeUser("teacher");
  const materialId = await makeMaterial(owner.userId, "published");
  const cover = await upload(owner.userId, { seed: "range" });
  assert.equal((await claim(materialId, [cover.url], owner.userId)).ok, true);

  const resolved = await media.resolveForAccess({ mediaId: cover.mediaId, user: ANON });
  const opened = await media.openForDelivery(resolved.media, { start: 2, end: 5 });
  assert.equal(opened.ok, true);
  assert.equal(opened.sizeBytes, 4);
  assert.equal(opened.totalBytes, cover.bytes.length);
  assert.deepEqual(opened.range, { start: 2, end: 5 });

  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).equals(cover.bytes.subarray(2, 6)), true);
});

test("DB 有列但磁碟沒檔 → 503（基礎設施問題，不是 404）", async () => {
  const owner = await makeUser("teacher");
  const materialId = await makeMaterial(owner.userId, "published");
  const cover = await upload(owner.userId, { seed: "missing" });
  assert.equal((await claim(materialId, [cover.url], owner.userId)).ok, true);

  const row = await readRow(cover.mediaId);
  fs.rmSync(path.join(TEST_STORAGE_ROOT, row.storage_key));

  const resolved = await media.resolveForAccess({ mediaId: cover.mediaId, user: ANON });
  assert.equal(resolved.ok, true, "授權判斷不看磁碟 —— 資料是對的");
  const opened = await media.openForDelivery(resolved.media, null);
  assert.equal(opened.ok, false);
  assert.equal(opened.code, "media_object_missing");
  assert.equal(media.statusForCode(opened.code), 503);
});

/* ---------------------------------------------------------------- *
 * 資料庫層保證
 * ---------------------------------------------------------------- */

test("claim_check：material_id 與 claimed_at 必須一起成立", async () => {
  const creator = await makeUser("teacher");
  const materialId = await makeMaterial(creator.userId);
  const cover = await upload(creator.userId);

  await assert.rejects(
    db.query(`UPDATE material_media_files SET material_id = $2 WHERE id = $1`, [
      cover.mediaId,
      materialId,
    ]),
    /material_media_files_claim_check/,
    "只寫 material_id 不寫 claimed_at 必須被 DB 擋下"
  );
});

test("kind_check：只有三個合法值進得了資料庫", async () => {
  const creator = await makeUser("teacher");
  const cover = await upload(creator.userId);
  await assert.rejects(
    db.query(`UPDATE material_media_files SET kind = 'thumbnail' WHERE id = $1`, [cover.mediaId]),
    /material_media_files_kind_check/
  );
});

test("storage_key 唯一：同一個私有物件不會被兩列指向", async () => {
  const creator = await makeUser("teacher");
  const first = await upload(creator.userId, { seed: "uniq-a" });
  const second = await upload(creator.userId, { seed: "uniq-b" });
  const firstKey = (await readRow(first.mediaId)).storage_key;

  await assert.rejects(
    db.query(`UPDATE material_media_files SET storage_key = $2 WHERE id = $1`, [
      second.mediaId,
      firstKey,
    ]),
    /material_media_files_storage_key_key/
  );
});
