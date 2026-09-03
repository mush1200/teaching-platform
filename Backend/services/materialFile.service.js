const crypto = require("crypto");
const { Transform } = require("stream");

const db = require("../config/db");
const {
  getPrivateFileStorage,
  readMaterialFileMaxBytes,
  readTokenTtlSeconds,
} = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");
const policy = require("../utils/materialFilePolicy");
const { writeActivityLog } = require("../utils/activityLog");

/**
 * 教材本體檔案的服務層。
 *
 * ## 核心不變條件（整個 milestone 只有這三條真的不能破）
 *
 *   1. **`pending_file_id` 永遠不等於買家可下載的檔案。** 買家的交付只看
 *      `materials.approved_file_id`，而它**只有** `promoteCandidate()` 會寫。
 *   2. **創作者永遠不能寫 `approved_file_id`。** 創作者的所有動作最多只到
 *      `pending_file_id`（候選）；升級是 Admin 核准流程的一部分。
 *   3. **買家授權綁定「教材」而不是「版本」。** 買到的是這份教材的最新已核准檔，
 *      因此授權查詢不看 `material_files.id`，只看訂單與 `approved_file_id`。
 *
 * 交付不看 `materials.status`：教材下架不代表已付款的買家失去他買到的東西。
 *
 * ## 為什麼 storage key 不外流
 *
 * `storage_key` 是儲存後端的定位資訊。一旦進入 API 回應或 log，未來換成 object storage
 * 時它就等於一個可被猜測的物件路徑。因此本模組對外回傳的物件一律經過
 * `publicFileShape()` 過濾，`storage_key` / `checksum_sha256` / `uploaded_by` 只在
 * 內部流轉。
 */

/**
 * 服務層錯誤碼 → HTTP status。**key 就是 `fail()` 用的錯誤碼本身**，
 * 不是 status 的別名 —— 兩者長得像的時候，對照表會靜默失效並讓所有錯誤退回 400。
 *
 * status 的選擇不是形式問題，它決定使用者看到什麼：
 *   415 檔案本身不合格（換一個檔就能解決）
 *   413 太大（壓縮或分拆就能解決）
 *   409 狀態衝突，例如買了但這份教材沒有可下載的檔案（使用者做什麼都沒用，要走 `/support`）
 *   503 資料是對的、基礎設施壞了（稍後重試可能就好）
 */
const ERROR_STATUS = Object.freeze({
  // 檔案型別政策
  unsupported_file_type: 415,
  blocked_file_type: 415,
  mime_mismatch: 415,
  signature_mismatch: 415,
  file_too_large: 413,
  empty_file: 400,

  // 認領與狀態
  file_not_found: 404,
  file_not_available: 400,
  not_found: 404,
  candidate_required: 409,
  conflict: 409,
  file_replacement_not_allowed: 409,

  // 交付
  not_entitled: 403,
  material_file_unavailable: 409,
  download_token_invalid: 404,
  file_object_missing: 503,

  invalid_input: 400,
  forbidden: 403,
});

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

/**
 * 決定某個錯誤碼的 HTTP status。
 *
 * 未知的碼回 500 而不是 400：一個沒有被登記的錯誤碼代表**這裡漏了一筆對照**，
 * 那是伺服器的問題，不該偽裝成使用者輸入錯誤讓它安靜地過去。
 */
function statusForCode(code) {
  return ERROR_STATUS[code] ?? 500;
}

/**
 * 對外可見的檔案形狀。**這是唯一允許離開服務層的檔案表示法。**
 * 刻意不含 `storage_key` / `checksum_sha256` / `uploaded_by`。
 */
function publicFileShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    uploadedAt: row.uploaded_at,
    approvedAt: row.approved_at ?? null,
  };
}

/**
 * 上傳期間的守門 Transform：**邊串流邊擋**，不等整個檔案落地才發現不合格。
 *
 * 兩件事：
 *   - 大小上限。超過就立刻讓串流失敗，避免有人用 chunked encoding 灌爆磁碟。
 *   - magic bytes。第一批位元組就能判斷「這是不是它宣稱的格式」。
 *
 * 因為它在 `storage.put()` 的上游，任何失敗都會讓 put 清掉自己的 `.part` 暫存檔。
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
            serviceCode: "file_too_large",
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
 * 收下一個上傳，寫入私有儲存並建立 `unattached` 的 `material_files` 列。
 *
 * **upload-first**：此時還沒有教材。創作者拿到 `fileId` 之後，才在建立／更新教材時
 * 用它換成候選檔。沒有換成功的就是 orphan，由 `cleanupOrphans()` 定期清掉。
 *
 * @param {object} args
 * @param {import("stream").Readable} args.readable multipart 的檔案串流
 * @param {string} args.originalFilename
 * @param {string} args.declaredMimeType client 宣告的型別（僅供比對，不採信）
 * @param {string} args.uploadedBy
 */
async function storeUpload({ readable, originalFilename, declaredMimeType, uploadedBy }) {
  const declared = policy.validateDeclaredFile({ originalFilename, declaredMimeType });
  if (!declared.valid) {
    readable.resume(); // 必須把 multipart 讀完，否則連線會卡住
    return fail(declared.code, declared.message);
  }

  const maxBytes = readMaterialFileMaxBytes();
  const storage = getPrivateFileStorage();
  const guard = createUploadGuard({ type: declared.type, maxBytes });

  let stored;
  try {
    readable.pipe(guard);
    stored = await storage.put(guard, { namespace: NAMESPACES.MATERIAL_FILES });
  } catch (err) {
    readable.destroy?.();
    const code = err?.serviceCode;
    if (code === "file_too_large") {
      const mb = Math.floor(maxBytes / (1024 * 1024));
      return fail("file_too_large", `檔案超過上限（最大 ${mb} MB）。`);
    }
    if (code) return fail(code, err.message);
    if (err?.code === "EMPTY_FILE") return fail("empty_file", "檔案是空的，請重新選擇。");
    throw err;
  }

  const inserted = await db.query(
    `INSERT INTO material_files
       (storage_key, original_filename, mime_type, size_bytes, checksum_sha256, status, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, 'unattached', $6)
     RETURNING *`,
    [
      stored.storageKey,
      String(originalFilename),
      // 存 canonical MIME 而不是 client 宣告值：下載時會直接當 Content-Type 用。
      policy.canonicalMimeType(declared.type),
      stored.sizeBytes,
      stored.checksumSha256,
      String(uploadedBy),
    ]
  ).catch(async (err) => {
    // DB 寫入失敗就不該留下孤兒物件 —— 這條路徑上沒有任何人知道那個 key。
    await storage.delete(stored.storageKey).catch(() => {});
    throw err;
  });

  return { ok: true, file: publicFileShape(inserted.rows[0]) };
}

/**
 * 把一個 `unattached` 檔案綁成某份教材的**候選檔**。
 *
 * 必須在呼叫端的 transaction 內執行（`client`），因為它與「建立教材」或
 * 「重新送審」是同一個業務動作 —— 中途失敗不能留下半套的指標。
 *
 * @param {import("pg").PoolClient} client
 * @param {{materialId: string, fileId: string, userId: string}} args
 */
async function claimCandidate(client, { materialId, fileId, userId }) {
  const locked = await client.query(
    `SELECT id, material_id, status, uploaded_by FROM material_files WHERE id = $1 FOR UPDATE`,
    [String(fileId)]
  );
  if (locked.rows.length === 0) {
    return fail("file_not_found", "指定的檔案不存在，請重新上傳。");
  }
  const file = locked.rows[0];

  // 「不是你上傳的」與「已經被用掉了」都回同一個錯誤：不透露別人的檔案是否存在。
  if (String(file.uploaded_by) !== String(userId) || file.status !== "unattached") {
    return fail("file_not_available", "指定的檔案無法使用，請重新上傳。");
  }

  const material = await client.query(
    `SELECT pending_file_id FROM materials WHERE id = $1`,
    [String(materialId)]
  );
  if (material.rows.length === 0) {
    return fail("not_found", "material not found");
  }

  // 舊的候選檔在被取代的當下就退場（unique index 只允許一個 candidate）。
  // 標成 superseded 而不是刪除：檔案實體與稽核痕跡都保留。
  const previousPendingId = material.rows[0].pending_file_id;
  if (previousPendingId) {
    await client.query(
      `UPDATE material_files SET status = 'superseded', updated_at = NOW()
        WHERE id = $1 AND status = 'candidate'`,
      [previousPendingId]
    );
  }

  const attached = await client.query(
    `UPDATE material_files
        SET material_id = $2, status = 'candidate', updated_at = NOW()
      WHERE id = $1 AND status = 'unattached'
      RETURNING *`,
    [String(fileId), String(materialId)]
  );
  if (attached.rows.length === 0) {
    return fail("file_not_available", "指定的檔案無法使用，請重新上傳。");
  }

  await client.query(
    `UPDATE materials SET pending_file_id = $2, updated_at = NOW() WHERE id = $1`,
    [String(materialId), String(fileId)]
  );

  return { ok: true, file: publicFileShape(attached.rows[0]) };
}

/**
 * 候選檔 → 已核准。**這是全系統唯一寫 `approved_file_id` 的地方。**
 *
 * 必須在核准 transaction 內（教材列已被 `FOR UPDATE` 鎖住），與 status 變更原子完成 ——
 * 否則會出現「教材已上架但仍指向舊檔」或反之的中間狀態。
 *
 * 順序有意義：舊的 approved 必須**先**退成 superseded，才能把候選升上來，
 * 否則 `uq_material_files_one_approved` 會擋下。
 *
 * @param {import("pg").PoolClient} client
 * @param {{materialId: string, adminUserId: string, requireCandidate: boolean}} args
 */
async function promoteCandidate(client, { materialId, adminUserId, requireCandidate }) {
  const current = await client.query(
    `SELECT approved_file_id, pending_file_id FROM materials WHERE id = $1`,
    [String(materialId)]
  );
  if (current.rows.length === 0) return fail("not_found", "material not found");

  const { approved_file_id: approvedId, pending_file_id: pendingId } = current.rows[0];

  if (!pendingId) {
    /*
     * 沒有候選檔。兩種情況：
     *   - 從來沒有已核准檔 → 核准等於上架一份買家下載不到東西的商品。拒絕。
     *   - 已經有已核准檔   → 這次審核沒有換檔（例如只改了文案）。保持原檔，正常放行。
     */
    if (requireCandidate && !approvedId) {
      return fail(
        "candidate_required",
        "這份教材沒有可核准的教材檔案，無法上架。請先請創作者上傳教材檔案。"
      );
    }
    return { ok: true, promoted: false, approvedFileId: approvedId ?? null };
  }

  if (approvedId && approvedId !== pendingId) {
    await client.query(
      `UPDATE material_files SET status = 'superseded', updated_at = NOW()
        WHERE id = $1 AND status = 'approved'`,
      [approvedId]
    );
  }

  const promoted = await client.query(
    `UPDATE material_files
        SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'candidate'
      RETURNING *`,
    [pendingId, String(adminUserId)]
  );
  if (promoted.rows.length === 0) {
    return fail("conflict", "教材檔案狀態已變更，請重新載入後再試一次。");
  }

  await client.query(
    `UPDATE materials SET approved_file_id = $2, pending_file_id = NULL, updated_at = NOW()
      WHERE id = $1`,
    [String(materialId), pendingId]
  );

  return {
    ok: true,
    promoted: true,
    approvedFileId: pendingId,
    supersededFileId: approvedId && approvedId !== pendingId ? approvedId : null,
    file: publicFileShape(promoted.rows[0]),
  };
}

/** 教材的兩個檔案指標（給 Admin 審核介面與創作者自己的教材頁）。 */
async function getMaterialFileSummary(materialId) {
  const { rows } = await db.query(
    `SELECT m.approved_file_id, m.pending_file_id,
            a.original_filename AS a_name, a.mime_type AS a_mime, a.size_bytes AS a_size,
            a.status AS a_status, a.uploaded_at AS a_uploaded, a.approved_at AS a_approved,
            p.original_filename AS p_name, p.mime_type AS p_mime, p.size_bytes AS p_size,
            p.status AS p_status, p.uploaded_at AS p_uploaded
       FROM materials m
       LEFT JOIN material_files a ON a.id = m.approved_file_id
       LEFT JOIN material_files p ON p.id = m.pending_file_id
      WHERE m.id = $1`,
    [String(materialId)]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    approvedFile: r.approved_file_id
      ? {
          id: r.approved_file_id,
          originalFilename: r.a_name,
          mimeType: r.a_mime,
          sizeBytes: Number(r.a_size),
          status: r.a_status,
          uploadedAt: r.a_uploaded,
          approvedAt: r.a_approved,
        }
      : null,
    pendingFile: r.pending_file_id
      ? {
          id: r.pending_file_id,
          originalFilename: r.p_name,
          mimeType: r.p_mime,
          sizeBytes: Number(r.p_size),
          status: r.p_status,
          uploadedAt: r.p_uploaded,
        }
      : null,
  };
}

/**
 * 取某個 slot 的完整檔案列（**含 storage_key**，僅供內部串流用）。
 * @param {"pending"|"approved"} slot
 */
async function getSlotFile(materialId, slot) {
  const column = slot === "approved" ? "approved_file_id" : "pending_file_id";
  const { rows } = await db.query(
    `SELECT f.* FROM materials m JOIN material_files f ON f.id = m.${column} WHERE m.id = $1`,
    [String(materialId)]
  );
  return rows[0] ?? null;
}

/**
 * 買家是否有這份教材的下載權。
 *
 * **不看 `materials.status`** —— 已付款的買家不會因為教材被下架而失去他買到的東西。
 * 看的是：自己的、已核准的訂單，且訂單品項包含這份教材，
 * **且該品項的授權狀態仍為 `active`**。
 *
 * `order_items.entitlement_status` 是**與 `orders.status` 正交**的維度
 * （P1-09 Gate 14）：撤銷單一買家對單一教材的存取，一律走這裡，
 * **不得**以改動訂單狀態為之 —— 那會污染訂單狀態機、對帳與稽核軌跡。
 *
 * 目前尚無任何寫入端會把它設成非 `active`（撤銷／恢復能力屬 Wave 2），
 * 因此本條件對現有資料是 no-op；先加在授權點，是為了讓 Wave 2 只需新增
 * 寫入端，不必再回頭改這條安全關鍵查詢。
 *
 * 註：`routes/me.js`（我的教材清單）與 `repositories/review.repository.js`
 * （可否評價）另有同型查詢。在撤銷能力存在之前三者行為完全一致；
 * 建立撤銷能力時必須**同一批**對齊，屆時一併決定各自的產品語意。
 */
async function hasPurchaseEntitlement(userId, materialId) {
  const { rows } = await db.query(
    `SELECT o.id AS order_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = $1
        AND o.status = 'approved'
        AND oi.material_id = $2
        AND oi.entitlement_status = 'active'
      LIMIT 1`,
    [String(userId), String(materialId)]
  );
  return rows.length > 0 ? { entitled: true, orderId: rows[0].order_id } : { entitled: false, orderId: null };
}

/**
 * 解析買家實際可以下載的檔案。
 *
 * 回傳的失敗碼刻意分開，因為**它們對使用者是完全不同的事**：
 *   - `not_entitled`            你沒有買（403）
 *   - `material_file_unavailable` 你買了，但這份教材目前沒有可下載的檔案（409）
 * 後者涵蓋 legacy 教材（只有 file_key 字串、沒有真檔）與被平台停止交付的檔案。
 */
async function resolveEntitledFile({ userId, materialId }) {
  const entitlement = await hasPurchaseEntitlement(userId, materialId);
  if (!entitlement.entitled) {
    return fail("not_entitled", "你尚未購買這份教材，或訂單尚未完成審核。");
  }

  const { rows } = await db.query(
    `SELECT f.* FROM materials m JOIN material_files f ON f.id = m.approved_file_id WHERE m.id = $1`,
    [String(materialId)]
  );
  const file = rows[0] ?? null;
  if (!file || file.status !== "approved") {
    return fail("material_file_unavailable", "此教材目前尚未提供可下載檔案。", {
      orderId: entitlement.orderId,
    });
  }
  return { ok: true, file, orderId: entitlement.orderId };
}

const TOKEN_BYTES = 32;

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

/**
 * 發一張一次性下載票。
 *
 * 票**綁定 userId + materialId + fileId**：轉貼給別人也只能下載到同一個授權標的，
 * 而且只能用一次。資料庫只存雜湊，因此 DB 外洩不會直接產生可用連結。
 */
async function issueDownloadToken({ userId, materialId, fileId }) {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const ttlSeconds = readTokenTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.query(
    `INSERT INTO material_download_tokens (token_hash, user_id, material_id, file_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(rawToken), String(userId), String(materialId), String(fileId), expiresAt]
  );

  return { rawToken, expiresInSeconds: ttlSeconds };
}

/**
 * 兌換下載票。
 *
 * 「檢查」與「標記已使用」是**同一句 UPDATE**：兩個併發請求只有一個會拿到列，
 * 分成 SELECT 再 UPDATE 會讓同一張票被用兩次。
 *
 * 過期／已使用／不存在一律回同一個錯誤 —— 差別對攻擊者有價值，對使用者沒有。
 */
async function consumeDownloadToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    return fail("download_token_invalid", "下載連結無效或已過期，請重新從「我的下載」取得。");
  }

  const { rows } = await db.query(
    `UPDATE material_download_tokens
        SET consumed_at = NOW()
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
      RETURNING *`,
    [hashToken(rawToken)]
  );
  if (rows.length === 0) {
    return fail("download_token_invalid", "下載連結無效或已過期，請重新從「我的下載」取得。");
  }

  const token = rows[0];
  const file = await db.query(`SELECT * FROM material_files WHERE id = $1`, [token.file_id]);
  if (file.rows.length === 0 || file.rows[0].status === "revoked") {
    return fail("material_file_unavailable", "此教材目前尚未提供可下載檔案。");
  }

  return { ok: true, token, file: file.rows[0] };
}

/**
 * 準備串流一個檔案。
 *
 * 檔案列存在但實體不見了 = 儲存後端出問題（例如 ephemeral filesystem 被重建）。
 * 那是 **503 而不是 404**：資料是對的，是基礎設施壞了，回 404 會讓人以為是資料問題。
 */
async function openFileForDelivery(fileRow) {
  const storage = getPrivateFileStorage();
  const stat = await storage.stat(fileRow.storage_key);
  if (!stat.exists) {
    // `PRE-14`：原本寫「聯絡平台客服」，但那個管道不存在。改指真的到得了的 `/support`。
    return fail(
      "file_object_missing",
      "檔案暫時無法取得，請稍後再試；若持續發生，請透過平台的「聯絡平台」頁面取得協助。"
    );
  }
  return { ok: true, stream: storage.openReadStream(fileRow.storage_key), sizeBytes: stat.sizeBytes };
}

/**
 * 清掉沒被認領的上傳，以及過期的下載票。
 *
 * upload-first 的代價：使用者上傳完就關掉視窗，檔案會留在儲存後端。
 * 因為每個實體物件都有一列，這裡不需要掃描檔案系統。
 *
 * 沒有背景排程框架 —— 這支由維運 CLI 呼叫（見 scripts/cleanup-material-files.js）。
 *
 * ## 2026-08-26（Wave 2 #4）之後的兩個關鍵改動
 *
 * **1. 資格判斷收斂到單一 predicate。**
 * 舊版只問 `status = 'unattached' AND uploaded_at < NOW() - Nh`，
 * **完全不檢查 legal hold、entitlement 或履約快照**。
 * 現在每一個候選都必須通過 `materialFileRetention.canPhysicallyDeleteMaterialFile()`，
 * 且在**同一個 transaction 內、對該列 `FOR UPDATE` 之後重驗一次** ——
 * 否則「查完到刪掉」之間的空窗可以讓一筆剛完成的訂單被無聲地刪掉憑據。
 *
 * **2. 刪除順序反過來，而且 fail-closed。**
 * 舊版先 `storage.delete()` 再 `DELETE FROM material_files`，
 * 因此 `order_items.fulfilled_material_version_id` 的 `ON DELETE RESTRICT`
 * 只擋得住 DB 列 —— 列刪不掉時，**位元組已經沒了**，而且無法復原。
 * 現在是「先刪列（讓所有 FK 在此引爆）→ 再刪實體 → 最後 COMMIT」：
 * 任何一步失敗就 ROLLBACK，列與實體同時留著。
 * 最壞情況從「檔案永久消失」變成「檔案還在」。
 */
async function cleanupOrphans({ olderThanHours = 24, dryRun = false } = {}) {
  const storage = getPrivateFileStorage();
  const retention = require("./materialFileRetention.service");

  const { rows } = await db.query(
    `SELECT id, storage_key FROM material_files
      WHERE status = 'unattached' AND uploaded_at < NOW() - ($1 || ' hours')::interval`,
    [String(Number(olderThanHours))]
  );

  let deletedObjects = 0;
  let deletedRows = 0;
  const skipped = [];
  const failures = [];

  for (const row of rows) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // 在鎖住該列之後重驗 —— 掃描與刪除之間的空窗是真實的。
      const verdict = await retention.canPhysicallyDeleteMaterialFile(row.id, {
        client,
        lock: true,
      });
      if (!verdict.deletable) {
        await client.query("ROLLBACK");
        skipped.push({ id: row.id, reasons: verdict.reasons });
        await writeCleanupSkipLog(row.id, verdict.reasons);
        continue;
      }
      if (dryRun) {
        await client.query("ROLLBACK");
        skipped.push({ id: row.id, reasons: ["dry_run"] });
        continue;
      }

      // 順序關鍵：先刪列。所有 FK（含 fulfilled_material_version_id 的 RESTRICT）
      // 在這一句就會引爆，此時實體檔案還完好。
      await client.query(`DELETE FROM material_files WHERE id = $1`, [row.id]);
      const removed = await storage.delete(row.storage_key);
      await client.query("COMMIT");

      deletedRows += 1;
      if (removed) deletedObjects += 1;
      await writeActivityLog({
        actorId: null,
        actorRole: "system",
        targetType: "material_file",
        targetId: String(row.id),
        action: "material_file.physically_deleted",
        meta: { source: "cleanup_orphans", objectRemoved: removed },
      }).catch(() => {});
    } catch (err) {
      // **fail-closed**：任何錯誤都回到「什麼都沒刪」。
      await client.query("ROLLBACK").catch(() => {});
      failures.push({ id: row.id, message: err.message });
    } finally {
      client.release();
    }
  }

  const tokens = await db.query(
    `DELETE FROM material_download_tokens WHERE expires_at < NOW() - interval '1 day'`
  );

  return {
    candidates: rows.length,
    deletedObjects,
    deletedRows,
    skipped,
    deletedExpiredTokens: tokens.rowCount,
    failures,
  };
}

/** 稽核：被跳過的原因分成 hold 與 dependency 兩種 action，方便直接盤點。 */
async function writeCleanupSkipLog(fileId, reasons) {
  const isHold = reasons.includes("legal_hold");
  await writeActivityLog({
    actorId: null,
    actorRole: "system",
    targetType: "material_file",
    targetId: String(fileId),
    action: isHold
      ? "material_file.cleanup_skipped_due_to_hold"
      : "material_file.cleanup_skipped_due_to_dependency",
    meta: { reasons, source: "cleanup_orphans" },
  }).catch(() => {});
}

module.exports = {
  ERROR_STATUS,
  statusForCode,
  publicFileShape,
  storeUpload,
  claimCandidate,
  promoteCandidate,
  getMaterialFileSummary,
  getSlotFile,
  hasPurchaseEntitlement,
  resolveEntitledFile,
  issueDownloadToken,
  consumeDownloadToken,
  openFileForDelivery,
  cleanupOrphans,
};
