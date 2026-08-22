const db = require("../config/db");

/**
 * Admin Orders 的資料層 —— **operational state 的唯一 canonical 定義**。
 *
 * ## 三層狀態，不得互相冒充（見 docs/mvp_rules.md §5、§19）
 *
 *   1. **Order status**（`orders.status`）
 *      production 只有三個值：`pending_payment` / `approved` / `cancelled`
 *      （`cancelled` 為 legacy 歷史列，目前沒有任何 writer）。
 *
 *   2. **Payment proof review status**（`manual_payment_proofs.review_status`）
 *      `pending` / `approved` / `rejected`。憑證被退回**不會**改動 `orders.status`。
 *
 *   3. **Admin operational state**（本模組）
 *      由 1 + 2 衍生，**只計算、不落地**。不得寫回 `orders.status`。
 *
 * 過去 Admin Orders 直接拿 `orders.status` 當篩選條件，導致：
 *   - 「待付款」把「已上傳待審」與「憑證被退回」一起收進來（真正待付款只佔少數）
 *   - 「待審核」被前端 map 成 dead status `paid`（0 rows，且 `paid` 的歷史語意其實是「已核准」）
 * 因此篩選與列徽章一律改由本模組的 `OPERATIONAL_STATUS_SQL` 決定。
 *
 * ## Precedence（順序即語意，不可調換）
 *
 *   approved → cancelled → pending_review → payment_rejected → awaiting_payment
 *
 * `approved` 必須最先短路：核准時會把同一張訂單其餘 pending 憑證標成
 * `rejected`（note = 'superseded by approved proof'），若先判斷憑證就會把已核准訂單
 * 誤分到 `payment_rejected`。
 *
 * `pending_review` 必須排在 `payment_rejected` 之前：買家在憑證被退回後重新上傳時，
 * 同一張訂單會同時存在舊的 `rejected` 與新的 `pending`，此時**必須**是待審核。
 * 這是本模組最重要的 regression 條件（tests/adminOrdersFilter.db.test.js Case 4）。
 */

/** UI 篩選值 = API `status` query token = 本陣列，三者 1:1，不再有任何 mapping 層。 */
const OPERATIONAL_STATUSES = Object.freeze([
  "awaiting_payment",
  "pending_review",
  "payment_rejected",
  "approved",
  "cancelled",
]);

/**
 * Canonical derived state。**篩選與回傳欄位共用這一份運算式**，
 * 兩邊各寫一次 SQL 正是上一版 filter 與 badge 語意分歧的成因。
 *
 * 後三個分支刻意不再重複 `o.status = 'pending_payment'` 條件：`approved` / `cancelled`
 * 已在前兩個分支短路，對所有 production 可達的值，加或不加結果完全相同；
 * 省略後這個 CASE 變成 total function（永遠落在五個值之一），
 * 五個 bucket 因此必然是 orders 的一個 partition（見 §22 invariant test）。
 */
const OPERATIONAL_STATUS_SQL = `
      CASE
        WHEN o.status = 'approved' THEN 'approved'
        WHEN o.status = 'cancelled' THEN 'cancelled'
        WHEN EXISTS (
          SELECT 1 FROM manual_payment_proofs m
          WHERE m.order_id = o.id AND m.review_status = 'pending'
        ) THEN 'pending_review'
        WHEN EXISTS (
          SELECT 1 FROM manual_payment_proofs m
          WHERE m.order_id = o.id AND m.review_status = 'rejected'
        ) THEN 'payment_rejected'
        ELSE 'awaiting_payment'
      END`;

/**
 * `?status=` 解析。行為與 `/admin/payment-proofs` 對齊：
 * 未帶（或空字串）→ 不篩選；非法值 → 400，**不得**靜默回空集合。
 *
 * @returns {{valid: true, status: string|null} | {valid: false}}
 */
function parseOperationalStatusQuery(raw) {
  if (raw == null) return { valid: true, status: null };
  const status = String(raw).trim();
  if (!status) return { valid: true, status: null };
  if (!OPERATIONAL_STATUSES.includes(status)) return { valid: false };
  return { valid: true, status };
}

/** 非法 `status` 的錯誤訊息；與 allowlist 同源，新增狀態時不會忘記改文案。 */
const INVALID_STATUS_MESSAGE = `status must be one of ${OPERATIONAL_STATUSES.join("|")}`;

/**
 * 訂單清單。`status` 為 `OPERATIONAL_STATUSES` 之一或 `null`（全部）。
 *
 * `payment_proof_latest_status` 的排序沿用 repo 既有的 latest-proof 規則
 * （`me.js`、`admin.js` 的憑證清單）：`COALESCE(uploaded_at, created_at)` —— 資料庫中
 * 存在 `uploaded_at IS NULL` 的舊憑證，只用 `uploaded_at` 排序會把它們排到最後。
 */
async function listOrders({ status = null } = {}) {
  const result = await db.query(
    `SELECT *
     FROM (
       SELECT
         o.id, o.user_id, o.status, o.payment_mode, o.total_amount, o.total_price,
         o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier,
         o.paid_at, o.cancelled_at, o.created_at, o.updated_at,
         ${OPERATIONAL_STATUS_SQL} AS operational_status,
         (SELECT COUNT(*)::int FROM manual_payment_proofs m
          WHERE m.order_id = o.id AND m.review_status = 'pending') AS payment_proof_pending_review_count,
         (SELECT m.review_status FROM manual_payment_proofs m
          WHERE m.order_id = o.id
          ORDER BY COALESCE(m.uploaded_at, m.created_at) DESC, m.id DESC
          LIMIT 1) AS payment_proof_latest_status
       FROM orders o
     ) t
     WHERE $1::text IS NULL OR t.operational_status = $1::text
     ORDER BY t.created_at DESC`,
    [status]
  );
  return result.rows;
}

module.exports = {
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_SQL,
  INVALID_STATUS_MESSAGE,
  parseOperationalStatusQuery,
  listOrders,
};
