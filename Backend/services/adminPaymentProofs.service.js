const db = require("../config/db");
const { parsePagination, buildPaginationMeta, toLikePattern } = require("../utils/adminQuery");

/**
 * 付款憑證審核的資料層（Epic §3 / §4）。
 *
 * ## 為什麼要有這一層
 *
 * 舊的 `GET /admin/payment-proofs` 只回憑證本身 + `order.user_id` + `order.status`。
 * Admin 看得到「核准／拒絕」兩顆按鈕，卻**看不到應付金額、付款人、訂單內容** ——
 * 沒有任何可以據以判斷的資訊。同一支 API 也沒有搜尋，所以 UI 只好退化成
 * 「請手動輸入憑證 ID」。
 *
 * 這裡把一次判斷需要的東西一次查齊：訂單 + 買家 + 金額 + 期限 + 憑證。
 *
 * ## 這個平台**沒有**的付款申報欄位
 *
 * `POST /orders/:id/payment-proof` 只收檔案（`multer.array('proofs')`），
 * 沒有付款日期、匯款金額、帳號末五碼、付款人姓名這些欄位，
 * `manual_payment_proofs` 也沒有對應的 column。
 * 因此本模組**不會**編造「使用者付款申報」區塊 —— 只顯示真的存在的資料：
 * 上傳時間、檔名、MIME、大小、憑證影像。缺的欄位列在最終報告的
 * 「Requires product decision」。
 */

const REVIEW_STATUSES = Object.freeze(["pending", "approved", "rejected"]);

/**
 * 付款期限。`orders` 沒有 `due_at` 欄位，所以這是**衍生值**而非儲存值：
 * 以人工轉帳的常見實務，訂單建立後 3 個日曆日內完成匯款。
 * 這個常數是唯一定義；改期限只改這裡，不要在 UI 端再算一次。
 */
const PAYMENT_DUE_DAYS = 3;

function parseReviewStatus(raw) {
  if (raw == null) return { valid: true, status: null };
  const status = String(raw).trim();
  if (!status || status === "all") return { valid: true, status: null };
  if (!REVIEW_STATUSES.includes(status)) return { valid: false };
  return { valid: true, status };
}

const INVALID_STATUS_MESSAGE = `status must be one of ${REVIEW_STATUSES.join("|")}`;

/**
 * 清單／詳情共用的 SELECT。兩邊各寫一次就會出現「清單有金額、詳情沒有」這種分歧。
 *
 * `buyer_email` 是目前唯一能拿到的「人」的識別（users 表沒有姓名欄位），
 * 因此它同時是顯示值與搜尋面。
 */
const PROOF_SELECT = `
  mpp.id,
  mpp.order_id,
  mpp.proof_url,
  mpp.proof_mime_type,
  mpp.proof_size_bytes,
  mpp.original_filename,
  mpp.review_status,
  mpp.uploaded_at,
  mpp.created_at,
  mpp.reviewed_at,
  mpp.reviewed_by,
  mpp.note,
  mpp.rejection_reason,
  o.user_id,
  o.status              AS order_status,
  o.total_amount        AS order_total_amount,
  o.total_price         AS order_total_price,
  o.discount_amount     AS order_discount_amount,
  o.promo_code          AS order_promo_code,
  o.payment_mode        AS order_payment_mode,
  o.created_at          AS order_created_at,
  o.paid_at             AS order_paid_at,
  (o.created_at + INTERVAL '${PAYMENT_DUE_DAYS} days') AS order_payment_due_at,
  bu.email              AS buyer_email,
  ru.email              AS reviewed_by_email,
  (SELECT COUNT(*)::int FROM manual_payment_proofs m2 WHERE m2.order_id = o.id) AS order_proof_count`;

const PROOF_FROM = `
  FROM manual_payment_proofs mpp
  JOIN orders o ON o.id = mpp.order_id
  LEFT JOIN users bu ON bu.id = o.user_id
  LEFT JOIN users ru ON ru.id = mpp.reviewed_by`;

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeProof(row) {
  return {
    id: String(row.id),
    order_id: row.order_id,
    user_id: row.user_id,
    buyer_email: row.buyer_email ?? null,
    order_status: row.order_status,
    order_total_amount: row.order_total_amount == null ? null : Number(row.order_total_amount),
    order_total_price: row.order_total_price == null ? null : Number(row.order_total_price),
    order_discount_amount:
      row.order_discount_amount == null ? null : Number(row.order_discount_amount),
    order_promo_code: row.order_promo_code ?? null,
    order_payment_mode: row.order_payment_mode ?? null,
    order_created_at: toIso(row.order_created_at),
    order_paid_at: toIso(row.order_paid_at),
    order_payment_due_at: toIso(row.order_payment_due_at),
    order_proof_count: row.order_proof_count ?? null,
    proof_url: row.proof_url,
    proof_mime_type: row.proof_mime_type,
    proof_size_bytes: row.proof_size_bytes,
    original_filename: row.original_filename,
    review_status: row.review_status,
    uploaded_at: toIso(row.uploaded_at),
    created_at: toIso(row.created_at),
    reviewed_at: toIso(row.reviewed_at),
    reviewed_by: row.reviewed_by,
    reviewed_by_email: row.reviewed_by_email ?? null,
    note: row.note,
    rejection_reason: row.rejection_reason ?? null,
  };
}

/**
 * @param {{ status?: string|null, q?: string|null, page?: number, limit?: number }} params
 */
async function listProofs({ status = null, q = null, page, limit } = {}) {
  const pagination = parsePagination({ page, limit });
  const conditions = [];
  const params = [];
  let i = 1;

  if (status) {
    conditions.push(`mpp.review_status = $${i}`);
    params.push(status);
    i += 1;
  }
  if (q) {
    /*
     * Human-friendly lookup（Epic §3）。Admin 手上會有的東西是**訂單編號**或
     * **買家 email**，不是憑證的內部 id。憑證 id 仍可搜（從 URL 貼回來），
     * 但它是最後一個選項，不是主要入口。
     *
     * `users` 沒有姓名欄位，所以「購買者姓名」目前無法搜尋 —— 見最終報告。
     */
    conditions.push(`(
      mpp.order_id ILIKE $${i} ESCAPE E'\\\\'
      OR bu.email ILIKE $${i} ESCAPE E'\\\\'
      OR mpp.id ILIKE $${i} ESCAPE E'\\\\'
    )`);
    params.push(toLikePattern(q));
    i += 1;
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::bigint AS c ${PROOF_FROM} ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0].c);

  const listResult = await db.query(
    `SELECT ${PROOF_SELECT}
     ${PROOF_FROM}
     ${whereSql}
     ORDER BY COALESCE(mpp.uploaded_at, mpp.created_at) DESC, mpp.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows.map(serializeProof),
    pagination: buildPaginationMeta(pagination, total),
  };
}

/** 全表的審核狀態計數；filter chip 的數字不受目前篩選影響。 */
async function getStatusCounts() {
  const result = await db.query(
    `SELECT review_status, COUNT(*)::int AS count FROM manual_payment_proofs GROUP BY review_status`
  );
  const counts = { total: 0 };
  for (const status of REVIEW_STATUSES) counts[status] = 0;
  for (const row of result.rows) {
    counts[row.review_status] = row.count;
    counts.total += row.count;
  }
  return counts;
}

/**
 * 單筆審核所需的完整 context：憑證 + 訂單 + 買家 + 訂單明細 + 同訂單其他憑證。
 *
 * 「同訂單其他憑證」不是裝飾：買家在憑證被退回後會重新上傳，Admin 必須看得到
 * 上一次為什麼被退，否則會用同樣的理由再退一次。
 */
async function getProofDetail(proofId) {
  const proofResult = await db.query(
    `SELECT ${PROOF_SELECT} ${PROOF_FROM} WHERE mpp.id = $1 LIMIT 1`,
    [String(proofId)]
  );
  if (proofResult.rows.length === 0) return null;
  const proof = serializeProof(proofResult.rows[0]);

  const itemsResult = await db.query(
    `SELECT oi.id, oi.material_id, oi.title_snapshot AS material_title,
            oi.quantity, COALESCE(oi.price_snapshot, 0)::int AS unit_price,
            COALESCE(oi.subtotal, 0)::int AS subtotal
     FROM order_items oi
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC, oi.id ASC`,
    [proof.order_id]
  );

  const siblingsResult = await db.query(
    `SELECT mpp.id, mpp.review_status, mpp.note, mpp.rejection_reason,
            mpp.proof_url, mpp.original_filename,
            COALESCE(mpp.uploaded_at, mpp.created_at) AS uploaded_at,
            mpp.reviewed_at
     FROM manual_payment_proofs mpp
     WHERE mpp.order_id = $1 AND mpp.id <> $2
     ORDER BY COALESCE(mpp.uploaded_at, mpp.created_at) DESC, mpp.id DESC`,
    [proof.order_id, String(proofId)]
  );

  return {
    proof,
    orderItems: itemsResult.rows,
    otherProofs: siblingsResult.rows.map((row) => ({
      ...row,
      uploaded_at: toIso(row.uploaded_at),
      reviewed_at: toIso(row.reviewed_at),
    })),
  };
}

module.exports = {
  REVIEW_STATUSES,
  PAYMENT_DUE_DAYS,
  INVALID_STATUS_MESSAGE,
  parseReviewStatus,
  listProofs,
  getStatusCounts,
  getProofDetail,
  serializeProof,
};
