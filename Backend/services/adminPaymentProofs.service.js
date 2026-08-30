const db = require("../config/db");
const paymentTimingPolicy = require("../utils/paymentTimingPolicy");
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
 *
 * ## 憑證影像怎麼交出去
 *
 * **不經由這一層**。本模組只回 metadata 與一條受保護的 `proof_file_path`；
 * 位元組由 `GET /orders/:orderId/payment-proofs/:proofId/file` 交付，授權在
 * `services/paymentProof.service.js`（Admin **或** 訂單擁有者）。
 * 公開的 `proof_url` 已從契約中移除 —— 見 `docs/mvp_rules.md` §12.4。
 */

const REVIEW_STATUSES = Object.freeze(["pending", "approved", "rejected"]);

/**
 * 付款期限。`orders` 沒有 `due_at` 欄位，所以這是**衍生值**而非儲存值：
 * 以人工轉帳的常見實務，訂單建立後 3 個日曆日內完成匯款。
 * 這個常數是唯一定義；改期限只改這裡，不要在 UI 端再算一次。
 */

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
  mpp.storage_status,
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
  -- 買家申報值（P1-09 Gate 6）。reported_ 前綴是語意的一部分：
  -- 這些是買家說的，不是平台查證的事實。Admin UI 必須照此標示，
  -- 不得寫成「實際入帳銀行／金額／時間」。
  mpp.reported_bank_name,
  mpp.reported_account_last4,
  mpp.reported_amount,
  mpp.reported_transfer_at,
  o.user_id,
  o.status              AS order_status,
  o.total_amount        AS order_total_amount,
  o.total_price         AS order_total_price,
  o.discount_amount     AS order_discount_amount,
  o.promo_code          AS order_promo_code,
  o.payment_mode        AS order_payment_mode,
  o.created_at          AS order_created_at,
  o.paid_at             AS order_paid_at,
  -- 四個時間彼此獨立，不得互相冒充（見 docs/mvp_rules.md 第 12.3a 節）：
  --   payment_info_submitted_at  平台何時被告知買家已付款（審核時鐘起算）
  --   payment_received_at        平台在銀行帳戶實際觀察到的入帳時間（Admin 填）
  --   paid_at                    Admin 按下核准的那一刻（既有語意，營收認列依據）
  o.payment_info_submitted_at AS order_payment_info_submitted_at,
  o.payment_received_at AS order_payment_received_at,
  -- 付款期限 enforcement 的 canonical 結果（Wave 2 #12）。
  -- Admin 必須看得出「買家現在還能不能補件」——
  -- 否則會出現 Admin 叫買家重傳、但 backend 拒絕的矛盾。
  -- **frontend 不得自行計算 eligibility。**
  ${paymentTimingPolicy.PAYMENT_SUBMISSION_ALLOWED_SQL} AS order_payment_submission_allowed,
  ${paymentTimingPolicy.PAYMENT_DEADLINE_EXPIRED_SQL} AS order_payment_deadline_expired,
  -- 2026-08-26：付款期限改讀**實體欄位**。
  -- 先前這裡是 (created_at + INTERVAL '3 days') 的即席推算 —— 那個 3 從未由產品拍板，
  -- 而且對 legacy 訂單算出一個它們從未被揭露過的期限。
  -- 現在 legacy 訂單此欄為 NULL，序列化層會誠實回報「未設定」，**不做任何 fallback 推算**。
  o.payment_due_at      AS order_payment_due_at,
  o.review_due_at       AS order_review_due_at,
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

/**
 * 憑證影像的受保護讀取路徑。與 `services/paymentProof.service.js` 的
 * `publicProofShape()` 產生的是同一條路徑 —— 兩邊各拼一次遲早會分歧。
 */
function proofFilePath(orderId, proofId) {
  return `/orders/${encodeURIComponent(String(orderId))}/payment-proofs/${encodeURIComponent(String(proofId))}/file`;
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
    order_payment_info_submitted_at: toIso(row.order_payment_info_submitted_at),
    order_payment_received_at: toIso(row.order_payment_received_at),
    /*
     * 付款期限與核帳期限都是**實體欄位**，不是推算值。
     * legacy 訂單為 `null` —— 它們建立時沒有被揭露過任何期限，
     * **不得**在此 fallback 成 `created_at + N 天`（那正是舊 `PAYMENT_DUE_DAYS` 的錯）。
     */
    order_payment_due_at: toIso(row.order_payment_due_at),
    order_review_due_at: toIso(row.order_review_due_at),
    /** 付款期限是否已過（legacy NULL 一律 false）。 */
    order_payment_deadline_expired: row.order_payment_deadline_expired === true,
    /**
     * 買家現在是否還能提交付款憑證 —— **backend canonical 判準**。
     * 逾期但曾在期限內提交過的訂單仍為 `true`（退件後可重傳）。
     */
    order_payment_submission_allowed: row.order_payment_submission_allowed === true,
    /** 人工核帳是否已逾時。核准後不再逾時；legacy（NULL）一律 false。 */
    review_overdue: paymentTimingPolicy.isReviewOverdue({
      status: row.order_status,
      review_due_at: row.order_review_due_at,
    }),
    order_proof_count: row.order_proof_count ?? null,
    /*
     * **不回傳 `proof_url`**（也不回傳 `storage_key`）。
     *
     * 舊契約直接把 `http://…/uploads/payment-proofs/<file>.png` 交給 Admin UI 當
     * `<img src>`，那條 URL 沒有任何授權 —— 拿到它的人（包含前端 state、瀏覽器
     * 歷史、任何側錄）都能看到別人的匯款畫面。
     *
     * 取而代之的是 `proof_file_path`：一條只由 order id 與 proof id 組成的受保護
     * 路徑，讀它仍然要通過 `requireAuth` + Admin/owner 授權。
     */
    proof_storage_status: row.storage_status ?? null,
    proof_file_available: row.storage_status === "private",
    proof_file_path: proofFilePath(row.order_id, row.id),
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
    /*
     * **買家申報值 —— 不是平台查證的事實。**
     * `reported_transfer_at` ≠ `order_payment_received_at`；
     * `reported_amount` ≠ 平台已確認的入帳金額。
     * 兩個來源刻意並存：付款爭議時「買家說什麼」與「平台看到什麼」都要留得住。
     */
    reported_bank_name: row.reported_bank_name ?? null,
    reported_account_last4: row.reported_account_last4 ?? null,
    reported_amount: row.reported_amount == null ? null : Number(row.reported_amount),
    reported_transfer_at: toIso(row.reported_transfer_at),
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
    `SELECT mpp.id, mpp.order_id, mpp.review_status, mpp.note, mpp.rejection_reason,
            mpp.storage_status, mpp.original_filename,
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
      id: String(row.id),
      order_id: row.order_id,
      review_status: row.review_status,
      note: row.note,
      rejection_reason: row.rejection_reason ?? null,
      original_filename: row.original_filename,
      proof_storage_status: row.storage_status ?? null,
      proof_file_available: row.storage_status === "private",
      proof_file_path: proofFilePath(row.order_id, row.id),
      uploaded_at: toIso(row.uploaded_at),
      reviewed_at: toIso(row.reviewed_at),
    })),
  };
}

module.exports = {
  REVIEW_STATUSES,
  PAYMENT_TIMING_POLICY: paymentTimingPolicy.PAYMENT_TIMING_POLICY,
  INVALID_STATUS_MESSAGE,
  parseReviewStatus,
  listProofs,
  getStatusCounts,
  getProofDetail,
  serializeProof,
};
