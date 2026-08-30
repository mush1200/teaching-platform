const { Readable } = require("stream");

const db = require("../config/db");
const { getPrivateFileStorage, readPaymentProofMaxBytes } = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");
const policy = require("../utils/paymentProofPolicy");
const paymentTimingPolicy = require("../utils/paymentTimingPolicy");

/**
 * 付款憑證的服務層 —— **儲存、授權、交付**。
 *
 * ## 核心不變條件
 *
 *   1. **付款憑證永遠不是 public asset。** 新憑證只寫進 `private-storage/payment-proofs/`，
 *      DB 只保存 opaque `storage_key`，任何 API 回應都不含 key、路徑或公開 URL。
 *   2. **授權只有兩種人成立**：Admin，或該訂單的擁有者（`orders.user_id`）。
 *      沒有第三條路 —— 沒有 signed URL、沒有 view token、沒有 `/uploads` 靜態路徑。
 *   3. **交付不看訂單狀態、也不看審核結果。** 憑證是使用者自己交易紀錄的一部分：
 *      訂單被核准或憑證被退回都不該讓他看不到自己上傳過什麼。
 *
 * ## 與教材本體的差別（刻意不共用授權模型）
 *
 * 教材看的是**購買授權**（已核准訂單 + `materials.approved_file_id`），一個買家可以
 * 下載他買過的任何教材的最新已核准版本。憑證看的是**訂單擁有權**，而且綁死
 * 「這張憑證屬於這筆訂單」—— 兩者共用的只有 `storage/privateFileStorage.js` 的
 * filesystem primitives 與 `utils/fileDownloadResponse.js` 的 header 組法。
 *
 * ## storage_status
 *
 *   private         已在私有儲存，`storage_key` 必定存在（唯一可交付的狀態）
 *   legacy_public   milestone 之前寫進公開 `uploads/payment-proofs/` 的舊資料，尚未搬移
 *   legacy_external `proof_url` 指向外部網址（seed / fixture 資料），平台沒有這個檔案
 *   legacy_missing  DB 有指標但公開目錄找不到檔案 —— 明確標記，不靜默丟棄
 */

const STORAGE_STATUS = Object.freeze({
  PRIVATE: "private",
  LEGACY_PUBLIC: "legacy_public",
  LEGACY_EXTERNAL: "legacy_external",
  LEGACY_MISSING: "legacy_missing",
});

/**
 * 服務層錯誤碼 → HTTP status。key 就是 `fail()` 用的錯誤碼本身。
 *
 *   415 檔案本身不合格（換一張圖就能解決）
 *   413 太大
 *   403 你不是這筆訂單的人（使用者做什麼都沒用）
 *   409 憑證存在但沒有可交付的位元組（legacy 未搬移／檔案遺失）—— 要找客服
 *   503 資料是對的、儲存後端壞了（稍後重試可能就好）
 */
const ERROR_STATUS = Object.freeze({
  unsupported_proof_type: 415,
  proof_mime_mismatch: 415,
  proof_signature_mismatch: 415,
  proof_too_large: 413,
  empty_proof_file: 400,

  order_not_found: 404,
  proof_not_found: 404,
  forbidden: 403,

  proof_file_unavailable: 409,
  proof_object_missing: 503,
});

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

function statusForCode(code) {
  return ERROR_STATUS[code] ?? 500;
}

/**
 * 對外可見的憑證形狀。**這是唯一允許離開服務層的憑證表示法。**
 *
 * 刻意不含 `storage_key` / `checksum_sha256` / `proof_url` —— 前兩者是儲存後端的定位
 * 資訊，第三個是這個 milestone 要消滅的公開 URL。欄位名沿用既有 API 契約
 * （`proof_mime_type` / `proof_size_bytes` / …），避免為了改儲存方式而動到不相關的形狀。
 */
function publicProofShape(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    order_id: row.order_id,
    original_filename: row.original_filename,
    proof_mime_type: row.proof_mime_type,
    proof_size_bytes: row.proof_size_bytes == null ? null : Number(row.proof_size_bytes),
    review_status: row.review_status,
    rejection_reason: row.rejection_reason ?? null,
    note: row.note ?? null,
    /*
     * **買家申報值** —— `reported_` 前綴是語意的一部分，回應層刻意保留它。
     * 這些不是平台查證的事實：`reported_transfer_at` **不是** `payment_received_at`，
     * `reported_amount` **不是**平台已確認的入帳金額。UI 必須照此標示。
     */
    reported_bank_name: row.reported_bank_name ?? null,
    reported_account_last4: row.reported_account_last4 ?? null,
    reported_amount: row.reported_amount == null ? null : Number(row.reported_amount),
    reported_transfer_at: row.reported_transfer_at ?? null,
    uploaded_at: row.uploaded_at,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at ?? null,
    /** 有沒有可交付的位元組。legacy 未搬移／遺失的憑證是 false。 */
    proof_file_available: row.storage_status === STORAGE_STATUS.PRIVATE,
    /**
     * 受保護的讀取路徑。**只由 order id 與 proof id 組成** —— 兩者都已經是呼叫端
     * 手上的東西，不洩漏任何儲存資訊；沒有授權的人拿到這條路徑一樣讀不到內容。
     */
    proof_file_path: `/orders/${encodeURIComponent(String(row.order_id))}/payment-proofs/${encodeURIComponent(String(row.id))}/file`,
  };
}

/* -------------------------------------------------------------------------- */
/* 上傳                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 驗證並寫入一批付款憑證。
 *
 * 呼叫端（`routes/order.js`）已經驗過訂單擁有權、訂單狀態與張數上限
 * （`orderService.uploadProof`）；這裡只負責「檔案本身合不合格」與「怎麼安全地存」。
 *
 * ## 為什麼失敗要清掉已寫入的物件
 *
 * 一次可以傳三張。第二張不合格時，第一張已經在私有儲存裡但不會有任何 DB 列指向它 ——
 * 那是一個永遠不會被讀到、也不會被任何清理程序認出來的孤兒。因此任何失敗路徑
 * （驗證失敗、DB 交易失敗）都會把這一批已寫入的 key 全部刪掉。
 *
 * @param {object} args
 * @param {string} args.orderId
 * @param {string} args.uploadedBy 上傳者（= 訂單擁有者）
 * @param {Array<{originalname: string, mimetype: string, buffer: Buffer}>} args.files
 *   multer memoryStorage 的檔案。憑證上限 10 MB × 3，緩衝在記憶體是可接受的；
 *   教材本體（100 MB）才需要 streaming storage engine。
 * @param {{bankName: string|null, accountLast4: string|null, amount: number|null,
 *          transferAt: Date|null}|null} [args.reported]
 *   **買家申報**的付款辨識資訊（已由 `utils/reportedPayment.js` 驗過格式）。
 *   同一批上傳的每一列都寫入相同的申報值 —— 一次提交就是一次申報。
 *
 *   **不得覆寫舊列。** 退件後重新提交會建立新的 `manual_payment_proofs` 列，
 *   舊列的申報內容原地保留：那是買家當時說了什麼的事實，
 *   是後續消費申訴（§12.10）與付款爭議核對的基礎。
 */
async function storeUploads({ orderId, uploadedBy, files, reported = null }) {
  const maxBytes = readPaymentProofMaxBytes();
  const storage = getPrivateFileStorage();

  // 先把整批都驗完再寫任何一個位元組：一批裡有壞檔就整批拒絕，不留半套。
  const validated = [];
  for (const file of files) {
    const declared = policy.validateDeclaredFile({
      originalFilename: file.originalname,
      declaredMimeType: file.mimetype,
    });
    if (!declared.valid) return fail(declared.code, declared.message);

    const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.alloc(0);
    if (buffer.length === 0) {
      return fail("empty_proof_file", "檔案是空的，請重新選擇。");
    }
    if (buffer.length > maxBytes) {
      const mb = Math.floor(maxBytes / (1024 * 1024));
      return fail("proof_too_large", `每張憑證圖片不可超過 ${mb} MB。`);
    }

    const signature = policy.validateFileSignature(
      declared.type,
      buffer.subarray(0, policy.SIGNATURE_PROBE_BYTES)
    );
    if (!signature.valid) return fail(signature.code, signature.message);

    validated.push({ file, buffer, type: declared.type });
  }

  const writtenKeys = [];
  const discardWritten = async () => {
    for (const key of writtenKeys) {
      await storage.delete(key).catch(() => {});
    }
  };

  const stored = [];
  try {
    for (const item of validated) {
      const result = await storage.put(Readable.from(item.buffer), {
        namespace: NAMESPACES.PAYMENT_PROOFS,
      });
      writtenKeys.push(result.storageKey);
      stored.push({ ...result, item });
    }
  } catch (err) {
    await discardWritten();
    if (err?.code === "EMPTY_FILE") return fail("empty_proof_file", "檔案是空的，請重新選擇。");
    throw err;
  }

  const client = await db.pool.connect();
  const created = [];
  try {
    await client.query("BEGIN");
    for (const { storageKey, sizeBytes, checksumSha256, item } of stored) {
      const inserted = await client.query(
        `INSERT INTO manual_payment_proofs(
           order_id, storage_key, checksum_sha256, storage_status,
           proof_mime_type, proof_size_bytes, original_filename,
           uploaded_by, review_status, uploaded_at,
           reported_bank_name, reported_account_last4, reported_amount, reported_transfer_at
         )
         VALUES($1, $2, $3, 'private', $4, $5, $6, $7, 'pending', NOW(), $8, $9, $10, $11)
         RETURNING id, order_id, storage_status, proof_mime_type, proof_size_bytes,
                   original_filename, review_status, rejection_reason, note,
                   reported_bank_name, reported_account_last4, reported_amount, reported_transfer_at,
                   uploaded_at, created_at, reviewed_at`,
        [
          String(orderId),
          storageKey,
          checksumSha256,
          // 存 canonical MIME 而不是 client 宣告值：讀取時會直接當 Content-Type 用。
          policy.canonicalMimeType(item.type),
          sizeBytes,
          item.file.originalname || null,
          String(uploadedBy),
          // 買家申報值寫在**每一列憑證**上，不是訂單上 ——
          // 退件後重新提交會產生新列，舊列的申報內容原地保留（見下方說明）。
          reported?.bankName ?? null,
          reported?.accountLast4 ?? null,
          reported?.amount ?? null,
          reported?.transferAt ?? null,
        ]
      );
      created.push(inserted.rows[0]);
    }

    /*
     * `orders.payment_info_submitted_at` = **平台何時被告知買家已付款**。
     *
     * 這是人工付款審核 SLA（`review_due_at`）的**起算點** ——
     * 不能用 `payment_received_at`（銀行實際入帳），因為那是 Admin 查帳時才發現的
     * 過去時間，從它起算會變成回溯計算，可能一發現就已經逾時。
     *
     * 每次提交都更新（而非只記第一次）：退件後買家重新上傳時，
     * 審核時鐘應該從**新的提交**起算，平台不該為買家的延遲被記逾時。
     * 完整的提交歷程仍保存在 `manual_payment_proofs.uploaded_at`（每列一次提交）。
     *
     * **不動 `orders.status`、不動 `paid_at`。**
     * `review_due_at` 本次刻意不計算 —— SLA 的天數尚未由產品拍板
     * （baseline §3.1：VALUE PENDING PRODUCT DECISION），不自行發明數字。
     */
    /*
     * `review_due_at` = 本次提交日（台灣日曆日）+ 3 個日曆日的**末日終了**
     * （產品決策 2026-08-26；canonical 見 `utils/paymentTimingPolicy.js`）。
     *
     * **與 `payment_info_submitted_at` 一起、在同一個 UPDATE 內重算** ——
     * 退件後重新提交會開啟**新的審核週期**，舊的（已被退件的）提交
     * 不得繼續把它的期限壓在新提交上。
     *
     * **不得以 `payment_received_at` 起算** —— 那是 Admin 查帳時才發現的過去時間，
     * 從它起算會變成回溯計算；平台的人工處理義務從「收到買家的付款申報」開始。
     */
    const submittedAt = new Date();
    await client.query(
      `UPDATE orders
          SET payment_info_submitted_at = $2,
              review_due_at = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [String(orderId), submittedAt, paymentTimingPolicy.reviewDueAt(submittedAt)]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    await discardWritten();
    throw err;
  } finally {
    client.release();
  }

  return { ok: true, proofs: created.map(publicProofShape) };
}

/* -------------------------------------------------------------------------- */
/* 授權                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 這個人能不能碰這筆訂單的憑證。
 *
 * **唯一的授權規則**（`docs/mvp_rules.md` §12.3）：
 *
 *     Admin  OR  authenticated order owner
 *
 * `user.role` 來自已驗簽的 JWT（`middlewares/auth.js`），不是 `tp_role` cookie。
 *
 * 非擁有者回 403 而不是 404：與既有的 `GET /orders/:id` 一致。訂單 id 本來就不是
 * 秘密（買家自己看得到、寫在通知信裡），這裡藏不藏都不影響安全，行為一致比較重要。
 */
async function authorizeOrderAccess({ orderId, user }) {
  const { rows } = await db.query(`SELECT id, user_id FROM orders WHERE id = $1 LIMIT 1`, [
    String(orderId),
  ]);
  if (rows.length === 0) return fail("order_not_found", "order not found");

  const isAdmin = user?.role === "admin";
  const isOwner = String(rows[0].user_id) === String(user?.userId);
  if (!isAdmin && !isOwner) return fail("forbidden", "forbidden");

  return { ok: true, order: rows[0], isAdmin, isOwner };
}

/** 一筆訂單的憑證清單（metadata，不含位元組）。授權同上。 */
async function listOrderProofs({ orderId, user }) {
  const access = await authorizeOrderAccess({ orderId, user });
  if (!access.ok) return access;

  const { rows } = await db.query(
    `SELECT id, order_id, storage_status, proof_mime_type, proof_size_bytes,
            original_filename, review_status, rejection_reason, note,
            reported_bank_name, reported_account_last4, reported_amount, reported_transfer_at,
            uploaded_at, created_at, reviewed_at
       FROM manual_payment_proofs
      WHERE order_id = $1
      ORDER BY COALESCE(uploaded_at, created_at) DESC, id DESC`,
    [String(orderId)]
  );
  return { ok: true, proofs: rows.map(publicProofShape) };
}

/**
 * 解析一張可交付的憑證（含 `storage_key`，**僅供內部串流用**）。
 *
 * 查詢條件同時綁 `id` 與 `order_id`：光靠 proof id 猜不到別人的憑證，因為授權是對
 * **訂單**做的，而 proof 必須真的屬於那筆訂單。少了後半段就是一個 IDOR ——
 * 攻擊者用自己的訂單 id 通過授權，再帶別人的 proof id 取檔。
 */
async function resolveProofForAccess({ orderId, proofId, user }) {
  const access = await authorizeOrderAccess({ orderId, user });
  if (!access.ok) return access;

  const { rows } = await db.query(
    `SELECT id, order_id, storage_key, storage_status, proof_mime_type, proof_size_bytes,
            original_filename, review_status, rejection_reason, note,
            uploaded_at, created_at, reviewed_at
       FROM manual_payment_proofs
      WHERE id = $1 AND order_id = $2
      LIMIT 1`,
    [String(proofId), String(orderId)]
  );
  if (rows.length === 0) return fail("proof_not_found", "payment proof not found");

  const proof = rows[0];
  if (proof.storage_status !== STORAGE_STATUS.PRIVATE || !proof.storage_key) {
    /*
     * legacy 憑證（未搬移／外部網址／檔案遺失）。**不回退到公開 URL** ——
     * 那正是這個 milestone 要關掉的東西。回 409 讓呼叫端知道「這筆有紀錄但沒有檔案」。
     */
    return fail(
      "proof_file_unavailable",
      "這張憑證沒有可顯示的影像檔（舊資料尚未轉入安全儲存或檔案已遺失），請聯絡平台客服。",
      { storageStatus: proof.storage_status }
    );
  }

  return { ok: true, proof, isAdmin: access.isAdmin, isOwner: access.isOwner };
}

/**
 * 準備串流一張憑證。
 *
 * 列存在但實體不見了 = 儲存後端出問題。那是 **503 而不是 404**：資料是對的，
 * 是基礎設施壞了，回 404 會讓人以為是資料問題。
 */
async function openProofForDelivery(proofRow) {
  const storage = getPrivateFileStorage();
  const stat = await storage.stat(proofRow.storage_key);
  if (!stat.exists) {
    return fail("proof_object_missing", "憑證影像暫時無法取得，請稍後再試或聯絡平台客服。");
  }
  return {
    ok: true,
    stream: storage.openReadStream(proofRow.storage_key),
    sizeBytes: stat.sizeBytes,
  };
}

module.exports = {
  STORAGE_STATUS,
  ERROR_STATUS,
  statusForCode,
  publicProofShape,
  storeUploads,
  authorizeOrderAccess,
  listOrderProofs,
  resolveProofForAccess,
  openProofForDelivery,
};
