const db = require("../config/db");
const paymentTimingPolicy = require("../utils/paymentTimingPolicy");
const { LATEST_PROOF_ORDER_BY_SQL } = require("../utils/paymentProofReview");

/**
 * Buyer Orders 的資料層 —— **`order_progress_state` 的唯一 canonical 定義**。
 *
 * ## 這一層回答的問題
 *
 *   Buyer：「我這張訂單現在走到哪一步了？」
 *
 * 對照組是 `services/adminOrders.service.js` 的 `operational_status`，那一份回答的是
 *   Admin：「我現在要處理什麼？」
 *
 * 兩者**刻意不合併**成單一 universal state：vocabulary 與 JTBD 都不同。
 * 它們唯一共用的是「哪一筆憑證是最新的」（`LATEST_PROOF_ORDER_BY_SQL`），
 * 因為同一張訂單在兩邊必須指向同一筆憑證，否則會講出互相矛盾的故事。
 *
 * ## `order_progress_state` 是衍生欄位，不是 DB column
 *
 * 它**只計算、不落地**。`orders.status` 只有 `pending_payment` / `approved` / `cancelled`
 * 三個值，`reviewing` / `rejected` / `proof_uploaded` 永遠不得寫回 `orders.status`。
 *
 * ## Precedence（順序即語意，不可調換）
 *
 *   approved → 最新憑證 pending → 最新憑證 rejected → 有憑證但非上述 → 無憑證
 *
 * 1. **`orders.status = 'approved'` 必須最先短路。** 核准時會把同一張訂單其餘 pending
 *    憑證標成 `rejected`（note = 'superseded by approved proof'，見 `routes/admin.js`），
 *    若先看憑證，已完成的訂單會倒退成「審核未通過」。
 *
 * 2. **判斷依據是「最新一筆憑證」，不是「歷史上是否存在某種憑證」。**
 *    舊版對全部歷史憑證做 `EXISTS rejected`，且排在 `EXISTS pending` 之前 ——
 *    買家被退件後重新上傳，舊的 rejected 會永遠壓過新的 pending，
 *    於是買家看到「審核未通過，請重新上傳」但其實已經上傳、正在等審核（`COR-01`）。
 *    把兩個 EXISTS 對調只能修 `rejected + pending` 這一組樣本，回答不了
 *    `pending + rejected + pending` 或更長的歷史，所以正式改為 latest-proof 語意。
 *
 * ## 不得依賴檔案層資訊
 *
 * business state 的來源只有 `orders.status` ＋ `manual_payment_proofs.review_status`
 * ＋ canonical 排序。`storage_key` / `storage_status` / `checksum_sha256` / MIME / 檔名
 * 一律**不得**參與 progress 判斷（見 `SEC-01`，`docs/mvp_rules.md` §12.4）。
 */

/** Buyer 可見的進度值。**這是完整集合**，不得新增（前端四個頁面依這些字串判斷）。 */
const ORDER_PROGRESS_STATES = Object.freeze([
  "pending", // 尚未上傳任何憑證
  "proof_uploaded", // 最新憑證已核准，但訂單尚未核准（審核流程中的過渡）
  "reviewing", // 最新憑證等待 Admin 審核
  "rejected", // 最新憑證被退回，且尚未重新上傳
  "approved", // 訂單已核准，可下載
  "cancelled", // 訂單已取消（legacy 終態，唯讀，沒有任何付款動作）—— `COR-03`
]);

/**
 * 最新一筆憑證。**list 與 detail 共用同一段 LATERAL**，
 * 兩邊各寫一次 SQL 正是 `COR-01` 出現「列表說審核中、詳情說已退件」的成因。
 *
 * 用 `LEFT JOIN LATERAL ... LIMIT 1` 而不是每個欄位各一個 correlated subquery：
 * `/me/orders` 是 list endpoint，最新憑證只需要在單一 SQL 內算一次，
 * 不得退化成「N 筆訂單 → N 次憑證查詢」。
 */
const LATEST_PROOF_LATERAL_SQL = `
       LEFT JOIN LATERAL (
         SELECT m.id,
                m.review_status,
                COALESCE(m.uploaded_at, m.created_at) AS effective_at,
                m.reviewed_at
         FROM manual_payment_proofs m
         WHERE m.order_id = o.id
         ${LATEST_PROOF_ORDER_BY_SQL}
         LIMIT 1
       ) latest_proof ON TRUE`;

/**
 * Canonical derived state。依賴 `LATEST_PROOF_LATERAL_SQL` 提供的 `latest_proof` 別名。
 *
 * ## 兩個終態必須先短路（順序即語意）
 *
 * 1. **`approved`** —— 核准時會把同一張訂單其餘 pending 憑證標成 `rejected`，
 *    若先看憑證，已完成的訂單會倒退成「審核未通過」。
 * 2. **`cancelled`**（`COR-03`）—— 舊版沒有這個分支，於是已取消且無憑證的訂單
 *    落到 `ELSE 'pending'`，前端徽章顯示「待付款」，同一張卡片卻被
 *    `isHistoricalOrder()` 歸進「歷史訂單」，兩者互相矛盾。
 *    `cancelled` 是 read-only 的 legacy 終態，**沒有任何付款動作可做**，
 *    因此它的進度不該由憑證推導 —— 修在這裡而不是前端，是因為 `COR-01` 已經把
 *    「買家進度」收斂成這一個欄位，在前端補一個 `status === 'cancelled'` 的判斷
 *    等於把徽章的來源又拆回兩個。
 *
 * 最後兩個分支刻意不重複 `o.status = 'pending_payment'`：兩個終態都已在上面短路。
 *
 * 這個 CASE 是 total function：永遠落在 `ORDER_PROGRESS_STATES` 之一。
 */
const ORDER_PROGRESS_STATE_SQL = `
              CASE
                WHEN o.status = 'approved' THEN 'approved'
                WHEN o.status = 'cancelled' THEN 'cancelled'
                WHEN latest_proof.review_status = 'pending' THEN 'reviewing'
                WHEN latest_proof.review_status = 'rejected' THEN 'rejected'
                WHEN latest_proof.review_status IS NOT NULL THEN 'proof_uploaded'
                ELSE 'pending'
              END`;

/** list 與 detail 共用的欄位；兩邊的 `order_progress_state` 因此必然一致。 */
const BUYER_ORDER_COLUMNS_SQL = `
              o.id, o.user_id, o.status, o.payment_mode, o.total_amount, o.total_price,
              o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier,
              o.paid_at, o.cancelled_at, o.created_at, o.updated_at,
              -- 付款期限與核帳期限（P1-09 Gate 6，2026-08-26）。
              -- 兩者都是**實體欄位**：期限是對買家揭露過的承諾（消保法 §18 I(2)），
              -- 政策日後調整時既有訂單必須維持當初的期限，因此不得即席推算。
              -- legacy 訂單為 NULL —— 它們從未被揭露過期限，前端必須誠實顯示「未設定」。
              o.payment_due_at, o.payment_info_submitted_at, o.review_due_at,
              -- **付款期限 enforcement 的 canonical 結果**（Wave 2 #12）。
              -- 前端**不得**自行用日期判斷是否還能提交 —— 那會與 backend 的
              -- enforcement 分家（尤其 A2：逾期但曾在期限內提交過的訂單仍可重傳）。
              ${paymentTimingPolicy.PAYMENT_SUBMISSION_ALLOWED_SQL} AS payment_submission_allowed,
              ${paymentTimingPolicy.PAYMENT_DEADLINE_EXPIRED_SQL} AS payment_deadline_expired,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'pending'),
                0
              ) AS payment_proof_pending_review_count,
              COALESCE(
                (SELECT COUNT(*)::int FROM manual_payment_proofs m
                 WHERE m.order_id = o.id),
                0
              ) AS payment_proof_uploaded_count,
              latest_proof.review_status AS payment_proof_latest_status,
              latest_proof.effective_at AS payment_proof_latest_uploaded_at,
              ${ORDER_PROGRESS_STATE_SQL} AS order_progress_state`;

/** `GET /me/orders` —— 買家自己的訂單清單。 */
/**
 * 退件原因（結構化 code ＋ 自由文字備註）—— **list 與 detail 共用同一段 SQL**。
 *
 * 兩者先前只有 detail 帶這兩個欄位，於是「我的訂單」列表看得到「審核未通過」與
 * 「重新上傳付款憑證」的 CTA，卻**說不出被退的原因**；買家最合理的下一步就是
 * 把同一張憑證再傳一次。Admin 的退件表單則明寫著「退回原因（必選，購買者會看到）」——
 * 那個「看到」的地方本來就該包含列表。
 *
 * `COR-02` 的守則原封不動保留在這裡：**只有 `order_progress_state = 'rejected'`
 * 時才回傳**。`note` 欄位在 Admin 核准訂單時會被借用來寫營運字串
 * （`'superseded by approved proof'`），非 rejected 時回傳它就是把內部備註送到買家 payload。
 * 抽成共用常數之後，這條守則不會因為 list 與 detail 各寫一次而分歧。
 */
const REJECTED_PROOF_COLUMNS_SQL = `
              CASE WHEN ${ORDER_PROGRESS_STATE_SQL} = 'rejected' THEN
                (SELECT m.note
                 FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'rejected'
                 ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
                 LIMIT 1)
              END AS payment_proof_rejected_note,
              CASE WHEN ${ORDER_PROGRESS_STATE_SQL} = 'rejected' THEN
                (SELECT m.rejection_reason
                 FROM manual_payment_proofs m
                 WHERE m.order_id = o.id AND m.review_status = 'rejected'
                 ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
                 LIMIT 1)
              END AS payment_proof_rejected_reason`;

async function listBuyerOrders(userId) {
  const result = await db.query(
    `SELECT ${BUYER_ORDER_COLUMNS_SQL},
              ${REJECTED_PROOF_COLUMNS_SQL}
       FROM orders o
       ${LATEST_PROOF_LATERAL_SQL}
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * `GET /me/orders/:orderId` —— 單筆訂單。
 *
 * **不做授權**：呼叫端（route）負責 404 / 403。這裡只保證 detail 的
 * `order_progress_state` 與 list 來自同一段 SQL。
 *
 * detail 額外帶的欄位：
 *   - `payment_proof_rejected_note` / `payment_proof_rejected_reason`
 *     取**最新一筆被退回的憑證**，且**只在 `order_progress_state = 'rejected'` 時回傳**
 *     （見下方 `COR-02`）
 *   - `payment_proof_latest_reviewed_at` 取**最近一次被審核**的時間（時間戳，非文字，不受限制）
 *
 * ## `COR-02`：退件備註只在「真的被退件」時才進 payload
 *
 * `note` 是**買家可見**的自由文字，但 Admin 核准訂單時會借用同一個欄位寫入營運字串
 * （`routes/admin.js` 把其餘 pending 憑證標成 rejected 並寫 `note = 'superseded by
 * approved proof'`）。那串字是寫給營運看的，不是給買家的退件理由 ——
 * 於是已核准訂單的買家 payload 會夾帶它（實測兩個 DB 各 3 筆）。
 * 目前買家 UI 只在 `rejected` 分支渲染，所以是 **payload 外洩、尚未顯示**；
 * 但只要日後有人在別的分支渲染這個欄位，買家就會直接看到內部備註。
 *
 * **採用 completion criteria 的選項 (b)：payload 在非 `rejected` 時不回退件備註。**
 * 沒有採用選項 (a)（supersede 改用結構化欄位）的理由是實測資料：
 * `review_status = 'rejected'` 但 `rejection_reason IS NULL` 的憑證在 dev DB 有 42 筆、
 * security test DB 有 63 筆（legacy 退件資料早於 reason code 的導入），
 * 因此「`rejection_reason` 為 NULL」**無法**當成 supersede 的結構化標記；
 * 要走 (a) 就得新增欄位＋migration，而那修的是同一個外洩的更遠端。
 * (b) 直接關掉整類外洩（不只 supersede 這一串），且無 schema 變更。
 *
 * 條件用的是**同一份** `ORDER_PROGRESS_STATE_SQL`，不是另外寫一次判斷 ——
 * 否則「什麼時候算 rejected」又會有第二個定義。
 *
 * @returns {Promise<object|null>}
 */
async function getBuyerOrder(orderId) {
  const result = await db.query(
    `SELECT ${BUYER_ORDER_COLUMNS_SQL},
              ${REJECTED_PROOF_COLUMNS_SQL},
              (SELECT m.reviewed_at
               FROM manual_payment_proofs m
               WHERE m.order_id = o.id
               ORDER BY COALESCE(m.reviewed_at, m.uploaded_at, m.created_at) DESC, m.id DESC
               LIMIT 1) AS payment_proof_latest_reviewed_at
       FROM orders o
       ${LATEST_PROOF_LATERAL_SQL}
       WHERE o.id = $1
       LIMIT 1`,
    [orderId]
  );
  return result.rows[0] || null;
}

module.exports = {
  ORDER_PROGRESS_STATES,
  ORDER_PROGRESS_STATE_SQL,
  LATEST_PROOF_LATERAL_SQL,
  listBuyerOrders,
  getBuyerOrder,
};
