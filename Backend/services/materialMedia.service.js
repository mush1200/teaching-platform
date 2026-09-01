const { Transform } = require("stream");

const db = require("../config/db");
const {
  getPrivateFileStorage,
  readMaterialMediaImageMaxBytes,
  readMaterialMediaVideoMaxBytes,
} = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");
const policy = require("../utils/materialMediaPolicy");
const { publicBaseUrl } = require("../utils/publicUrl");

/**
 * 教材**行銷素材**（封面／詳情圖／試看影片）的服務層 —— 儲存、認領、授權、交付。
 *
 * ## 核心不變條件
 *
 *   1. **可見性由所屬教材的 `status` 決定，不由檔名決定。**
 *      published → 匿名可取（公開商品頁需要）；其餘一律只有教材擁有者或 Admin。
 *      下架（`unpublished`）**立即**撤回匿名存取，不需要搬檔案、不需要改 URL。
 *   2. **未認領的上傳只有上傳者或 Admin 看得到。** 創作者按下「上傳」到按下「儲存」
 *      之間的素材還不屬於任何教材，此時它只是那個人的私人檔案。
 *   3. **認領必須驗擁有權。** 一個 media id 只能被它的上傳者（或 Admin）綁到教材上，
 *      而且不能被綁到第二份教材。少了這條，創作者 B 只要把 A 的未上架素材 id 填進
 *      自己的教材再上架，就能讓 A 的私有素材變成公開的。
 *   4. `storage_key` / `checksum_sha256` 不得出現在任何 API 回應或 log。
 *
 * ## 為什麼素材不能留在 `uploads/`
 *
 * `express.static` 沒有「條件公開」這種東西。檔案一旦在那個目錄裡，未上架與已下架
 * 教材的素材就永久匿名可取，只靠 12 個 hex 的隨機檔名保護 —— 而 URL 一旦被爬蟲、
 * 分享或快取記下，下架就再也撤不回來。這正是 `SEC-02` 的 root cause。
 *
 * ## 與另外兩種私有資產的差別（刻意不共用授權模型）
 *
 *   教材本體  購買授權（已核准訂單 + `approved_file_id`）  —— **完全私有**
 *   付款憑證  訂單擁有權（`orders.user_id`）              —— **完全私有**
 *   行銷素材  所屬教材的 `status`                          —— **條件公開**
 *
 * 三者共用的只有 `storage/privateFileStorage.js` 的 filesystem primitives。
 */

/**
 * 服務層錯誤碼 → HTTP status。
 *
 *   415 檔案本身不合格（換一個檔就能解決）
 *   413 太大
 *   401 需要登入才知道你是不是有權的人
 *   403 已登入但不是這份素材的人
 *   400 認領時的輸入問題（素材屬於別人／已被別的教材認領）
 *   503 資料是對的、儲存後端壞了
 */
const ERROR_STATUS = Object.freeze({
  invalid_media_kind: 400,
  unsupported_media_type: 415,
  media_mime_mismatch: 415,
  media_signature_mismatch: 415,
  media_too_large: 413,
  empty_media_file: 400,

  media_not_found: 404,
  media_auth_required: 401,
  forbidden: 403,

  media_not_claimable: 400,

  media_object_missing: 503,
});

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

function statusForCode(code) {
  return ERROR_STATUS[code] ?? 500;
}

/** 交付路徑（相對）。**只由 media id 組成**，不洩漏任何儲存資訊。 */
function mediaPath(mediaId) {
  return `/materials/media/${encodeURIComponent(String(mediaId))}`;
}

/**
 * 交付 URL（絕對）。
 *
 * 回絕對 URL 而不是相對路徑，是因為 `cover_image_url` 這些欄位的既有契約就是
 * http(s) URL 字串（`routes/materials.js` 的 `isValidUrl` 會驗），而且公開商品頁的
 * `<img src>` 由瀏覽器直接打 Backend，不經 Next 的 `/api/backend` proxy。
 */
function mediaUrl(mediaId) {
  return `${publicBaseUrl()}${mediaPath(mediaId)}`;
}

/**
 * 從一個 URL 取出它指向的 media id；不是平台素材就回 `null`。
 *
 * **只比對 path，不比對 host。** host 在不同環境不一樣（本機 `localhost:3000`、
 * 部署時是 `PUBLIC_BACKEND_URL`），拿它當判斷依據會讓同一筆資料在換環境後
 * 突然變成「外部 URL」而認領不到。安全性不靠這個函式把關 —— 認領時一律回 DB
 * 查 `uploaded_by` 與 `material_id`（見 `claimForMaterial`），所以就算有人餵進
 * `https://example.com/materials/media/<別人的id>`，也只會在授權那一關被擋下。
 */
const MEDIA_PATH_PATTERN = /\/materials\/media\/([0-9a-fA-F-]{36})\/?$/;

function parseMediaId(url) {
  if (typeof url !== "string") return null;
  const withoutQuery = url.split("?")[0].split("#")[0];
  const match = MEDIA_PATH_PATTERN.exec(withoutQuery);
  return match ? match[1].toLowerCase() : null;
}

/**
 * 對外可見的素材形狀。**這是唯一允許離開服務層的素材表示法。**
 * 刻意不含 `storage_key` / `checksum_sha256`。
 */
function publicMediaShape(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    kind: row.kind,
    url: mediaUrl(row.id),
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    materialId: row.material_id ?? null,
    uploadedAt: row.uploaded_at,
  };
}

function maxBytesForKind(kind) {
  return kind === "demo" ? readMaterialMediaVideoMaxBytes() : readMaterialMediaImageMaxBytes();
}

/* -------------------------------------------------------------------------- */
/* 上傳                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 上傳期間的守門 Transform：**邊串流邊擋**，不等整個檔案落地才發現不合格。
 *
 * 與 `services/materialFile.service.js` 的同名函式是同一個模式，但讀的是
 * `materialMediaPolicy` 的 signature 表 —— 兩者不共用，因為允許的型別完全不同。
 * 試看影片上限 80 MB，把它整個緩衝進記憶體是不可接受的，所以這裡必須 streaming。
 */
function createUploadGuard({ type, maxBytes }) {
  let bytes = 0;
  let head = Buffer.alloc(0);
  let signatureChecked = false;

  const checkSignature = () => {
    signatureChecked = true;
    const result = policy.validateFileSignature(type, head);
    if (result.valid) return null;
    return Object.assign(new Error(result.message), { serviceCode: result.code });
  };

  return new Transform({
    transform(chunk, _encoding, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        return cb(
          Object.assign(new Error("file exceeds the maximum allowed size"), {
            serviceCode: "media_too_large",
          })
        );
      }
      if (!signatureChecked) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= policy.SIGNATURE_PROBE_BYTES) {
          const err = checkSignature();
          if (err) return cb(err);
        }
      }
      cb(null, chunk);
    },
    flush(cb) {
      // 檔案比 probe 長度還短時，這裡才是唯一一次檢查機會。
      if (!signatureChecked) {
        const err = checkSignature();
        if (err) return cb(err);
      }
      cb();
    },
  });
}

/**
 * 收下一個素材上傳，寫入私有儲存並建立**未認領**（`material_id IS NULL`）的列。
 *
 * **upload-first**：此時教材可能還不存在（新建流程）。創作者拿到 URL 之後，在建立／
 * 更新教材時把它填進 `cover_image_url` 等欄位，那一刻才會被認領。
 *
 * @param {object} args
 * @param {import("stream").Readable} args.readable multipart 的檔案串流
 * @param {"cover"|"detail"|"demo"} args.kind
 * @param {string} args.originalFilename
 * @param {string} args.declaredMimeType client 宣告的型別（僅供比對，不採信）
 * @param {string} args.uploadedBy
 */
async function storeUpload({ readable, kind, originalFilename, declaredMimeType, uploadedBy }) {
  const declared = policy.validateDeclaredFile({ kind, originalFilename, declaredMimeType });
  if (!declared.valid) {
    readable.resume(); // 必須把 multipart 讀完，否則連線會卡住
    return fail(declared.code, declared.message);
  }

  const maxBytes = maxBytesForKind(kind);
  const storage = getPrivateFileStorage();
  const guard = createUploadGuard({ type: declared.type, maxBytes });

  let stored;
  try {
    readable.pipe(guard);
    stored = await storage.put(guard, { namespace: NAMESPACES.MATERIAL_MEDIA });
  } catch (err) {
    readable.destroy?.();
    const code = err?.serviceCode;
    if (code === "media_too_large") {
      const mb = Math.floor(maxBytes / (1024 * 1024));
      return fail("media_too_large", `檔案超過上限（最大 ${mb} MB）。`);
    }
    if (code) return fail(code, err.message);
    if (err?.code === "EMPTY_FILE") return fail("empty_media_file", "檔案是空的，請重新選擇。");
    throw err;
  }

  const inserted = await db
    .query(
      `INSERT INTO material_media_files
         (kind, storage_key, original_filename, mime_type, size_bytes, checksum_sha256, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(kind),
        stored.storageKey,
        String(originalFilename),
        // 存 canonical MIME 而不是 client 宣告值：交付時會直接當 Content-Type 用。
        policy.canonicalMimeType(declared.type),
        stored.sizeBytes,
        stored.checksumSha256,
        String(uploadedBy),
      ]
    )
    .catch(async (err) => {
      // DB 寫入失敗就不該留下孤兒物件 —— 這條路徑上沒有任何人知道那個 key。
      await storage.delete(stored.storageKey).catch(() => {});
      throw err;
    });

  return { ok: true, media: publicMediaShape(inserted.rows[0]) };
}

/* -------------------------------------------------------------------------- */
/* 認領                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 把教材欄位裡出現的平台素材 URL 綁到這份教材上。
 *
 * 必須在呼叫端的 transaction 內執行（`client`）—— 建立／更新教材與認領素材是同一個
 * 業務動作，中途失敗不能留下「教材已存在、素材還是無主」的半套狀態。
 *
 * ## 三種輸入，三種處理
 *
 *   1. 不是平台素材的 URL（外部 CDN、seed 資料）→ **忽略**。這是合法用法：
 *      表單明說「亦可改用手動貼上外部圖片連結」。
 *   2. 平台素材，未認領，上傳者是自己（或呼叫者是 Admin）→ **認領**。
 *   3. 平台素材，已被**這份**教材認領 → no-op（重複 PATCH 同一份 payload 是常態）。
 *
 * 其餘一律拒絕：屬於別人的未認領素材、已被別的教材認領的素材、DB 裡根本沒有的 id。
 * 這是不變條件 #3 的實作位置。
 *
 * @param {import("pg").PoolClient} client
 * @param {{materialId: string, urls: Array<string|null|undefined>, userId: string, isAdmin?: boolean}} args
 */
async function claimForMaterial(client, { materialId, urls, userId, isAdmin = false }) {
  const ids = [];
  for (const url of urls || []) {
    const id = parseMediaId(url);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return { ok: true, claimed: [] };

  const claimed = [];
  for (const id of ids) {
    const locked = await client.query(
      `SELECT id, material_id, uploaded_by FROM material_media_files WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (locked.rows.length === 0) {
      /*
       * 形狀像平台素材 URL，但 DB 沒有這一列。可能是手打的、已被刪除的，或是
       * 指向別的環境。**明確拒絕**而不是當外部 URL 放行 —— 放行的話這個欄位會存進
       * 一個永遠 404 的連結，而創作者以為自己填對了。
       */
      return fail(
        "media_not_claimable",
        `素材連結無效（${mediaPath(id)}），請重新上傳。`
      );
    }

    const row = locked.rows[0];
    if (row.material_id !== null && String(row.material_id) === String(materialId)) {
      continue; // 已經是這份教材的素材
    }
    if (row.material_id !== null) {
      return fail("media_not_claimable", "這個素材已經屬於另一份教材，請重新上傳一份。");
    }
    if (!isAdmin && String(row.uploaded_by ?? "") !== String(userId)) {
      // 不變條件 #3：不能把別人的未上架素材綁到自己的教材上再上架。
      return fail("media_not_claimable", "這個素材不是你上傳的，請重新上傳一份。");
    }

    await client.query(
      `UPDATE material_media_files
          SET material_id = $2, claimed_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [id, String(materialId)]
    );
    claimed.push(id);
  }

  return { ok: true, claimed };
}

/* -------------------------------------------------------------------------- */
/* 授權與交付                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 解析一份可交付的素材，並判斷這個人能不能取得它。
 *
 * **唯一的授權規則**（`docs/mvp_rules.md` §3.1）：
 *
 *     material.status = 'published'   → 任何人（含匿名）
 *     material_id IS NULL（未認領）    → 上傳者 或 Admin
 *     其餘（pending_review /
 *          changes_requested /
 *          unpublished）             → 教材擁有者（teacher）或 Admin
 *
 * 匿名回 **401**、已登入但無權回 **403**：與付款憑證交付端點的行為一致
 * （「先告訴你要登入」vs「登入了也沒用」是兩件不同的事）。
 *
 * @param {{mediaId: string, user: {userId?: string, role?: string}|null}} args
 */
async function resolveForAccess({ mediaId, user }) {
  const { rows } = await db.query(
    `SELECT mm.id, mm.kind, mm.material_id, mm.storage_key, mm.mime_type, mm.size_bytes,
            mm.original_filename, mm.uploaded_by, mm.uploaded_at,
            m.status AS material_status, m.teacher_id AS material_teacher_id
       FROM material_media_files mm
       LEFT JOIN materials m ON m.id = mm.material_id
      WHERE mm.id = $1
      LIMIT 1`,
    [String(mediaId)]
  );
  if (rows.length === 0) return fail("media_not_found", "media not found");

  const row = rows[0];
  const isPublished = row.material_status === "published";
  if (isPublished) {
    return { ok: true, media: row, isPublic: true };
  }

  const isAdmin = user?.role === "admin";
  const isOwnerTeacher =
    user?.role === "teacher" &&
    row.material_teacher_id !== null &&
    String(row.material_teacher_id) === String(user?.userId);
  const isUploader =
    row.material_id === null &&
    user?.userId != null &&
    row.uploaded_by != null &&
    String(row.uploaded_by) === String(user.userId);

  if (isAdmin || isOwnerTeacher || isUploader) {
    return { ok: true, media: row, isPublic: false };
  }

  if (!user) {
    return fail("media_auth_required", "這份素材尚未公開，請先登入。");
  }
  return fail("forbidden", "forbidden");
}

/**
 * 準備串流一份素材。
 *
 * 列存在但實體不見了 = 儲存後端出問題。那是 **503 而不是 404**：資料是對的，
 * 是基礎設施壞了，回 404 會讓人以為是資料問題。
 *
 * @param {object} mediaRow `resolveForAccess` 回傳的列
 * @param {{start: number, end: number}|null} [range] HTTP Range（含端點，byte 索引）
 */
async function openForDelivery(mediaRow, range = null) {
  const storage = getPrivateFileStorage();
  const stat = await storage.stat(mediaRow.storage_key);
  if (!stat.exists) {
    return fail("media_object_missing", "素材檔案暫時無法取得，請稍後再試。");
  }
  if (!range) {
    return {
      ok: true,
      stream: storage.openReadStream(mediaRow.storage_key),
      sizeBytes: stat.sizeBytes,
      totalBytes: stat.sizeBytes,
      range: null,
    };
  }
  const start = Math.max(0, range.start);
  const end = Math.min(stat.sizeBytes - 1, range.end);
  return {
    ok: true,
    stream: storage.openReadStream(mediaRow.storage_key, { start, end }),
    sizeBytes: end - start + 1,
    totalBytes: stat.sizeBytes,
    range: { start, end },
  };
}

module.exports = {
  ERROR_STATUS,
  statusForCode,
  mediaPath,
  mediaUrl,
  parseMediaId,
  publicMediaShape,
  storeUpload,
  claimForMaterial,
  resolveForAccess,
  openForDelivery,
};
