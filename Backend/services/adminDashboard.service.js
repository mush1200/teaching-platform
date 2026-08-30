const db = require("../config/db");
const { REPORTING_TIMEZONE, resolvePreviousPeriod, computeDeltaPercent } = require("../utils/reportingRange");
const reportWorkflow = require("../utils/reportWorkflow");
const consumerComplaint = require("./consumerComplaint.service");

/**
 * Admin dashboard summary 的資料層。
 *
 * ## Snapshot / all-time vs period
 *
 * 同一支 endpoint 同時回傳兩類數字，兩者**不得**互相污染：
 *   - snapshot / all-time：`materialsCount`、`ordersCount`、`usersCount`、`reviewsCount`、
 *     `revenueAmount`、`pending*Count`。完全不吃期間條件。
 *   - period：`periodRevenueAmount`、`new*Count`。只看 `[start, end)` 內發生的事件。
 *
 * ## 時區策略（schema 目前混用兩種 timestamp 型別，必須分開處理）
 *
 * 期間邊界由 caller 以**台北日曆日字串**傳入（`$1` = from、`$2` = endExclusive、`$3` = 時區）。
 * SQL 端再依欄位型別選用對應的邊界運算式：
 *
 * - `INSTANT($n)` → `timestamptz`
 *   把台北日曆日的 00:00 轉成絕對時間點。用於 **TIMESTAMPTZ** 欄位（`review.created_at`）。
 *
 * - `LOCAL($n)` → `timestamp`（無時區）
 *   把上面的絕對時間點再換算成**資料庫 session 時區的牆鐘時間**。用於 **TIMESTAMP（無時區）**
 *   欄位（`orders.created_at` / `orders.paid_at` / `users.created_at` / `materials.created_at`）。
 *
 *   這些欄位存的是 `NOW()` / `CURRENT_TIMESTAMP` 寫入當下、以 DB session 時區呈現的牆鐘值，
 *   所以要比較就必須把邊界換算到同一個牆鐘座標系。用 `current_setting('TimeZone')` 而非
 *   寫死 'Asia/Taipei'：本機 DB 目前確實是 Asia/Taipei（兩次轉換互相抵銷），但若部署到
 *   UTC 的資料庫，這個寫法仍會得出正確邊界，寫死則會整整偏 8 小時。
 *
 * 邊界放在比較式的右側（每次查詢為常數運算式），欄位本身不包函式，保留索引可用性。
 *
 * 本模組**不**執行 `SET TIME ZONE` —— 那會影響同一連線上其他 route 的行為。
 */

/** 台北日曆日 00:00 的絕對時間點（timestamptz）。 */
const INSTANT = (n) => `(($${n}::date)::timestamp AT TIME ZONE $3::text)`;

/** 同一時間點，改以資料庫 session 時區的牆鐘表示（timestamp，無時區）。 */
const LOCAL = (n) => `(${INSTANT(n)} AT TIME ZONE current_setting('TimeZone'))`;

const L_START = LOCAL(1);
const L_END = LOCAL(2);
const I_START = INSTANT(1);
const I_END = INSTANT(2);

/**
 * 比較基準期的邊界（`$4` = previousFrom、`$5` = previousEndExclusive）。
 * 與 current period 走完全相同的換算路徑，兩期的口徑因此必然一致 ——
 * 若比較期用了不同的邊界策略，deltaPercent 會在時區邊界附近失真。
 */
const PL_START = LOCAL(4);
const PL_END = LOCAL(5);
const PI_START = INSTANT(4);
const PI_END = INSTANT(5);

/**
 * @param {{from: string, to: string, endExclusive: string}} period 由 `resolveReportingRange` 產生
 */
async function getDashboardSummary(period) {
  // 比較基準期一律由 Backend 決定（含 this_month 的上月同期與月長夾取），
  // 前端不得自行推算 —— 那會讓同一套規則存在兩份實作。
  const previous = resolvePreviousPeriod(period);
  const p = [period.from, period.endExclusive, REPORTING_TIMEZONE, previous.from, previous.endExclusive];

  const [ordersRes, usersRes, materialsRes, reviewRes, pendingProofsRes, pendingReportsRes,
    actionableReportsRes, overdueComplaintsRes] =
    await Promise.all([
    /*
     * 一次掃描取得 orders 的四個指標。
     *   ordersCount          所有訂單，不分狀態（all-time）
     *   revenueAmount        all-time 已核准營收（保留給既有 caller；UI 已不顯示）
     *   newOrdersCount       期間內「建立」的訂單 → created_at
     *   periodRevenueAmount  期間內「核准」的訂單金額 → paid_at
     * created_at 與 paid_at 是兩個不同事件，刻意不共用同一個日期欄位。
     * `paid_at IS NOT NULL` 是必要的：歷史資料存在 status='approved' 但 paid_at 為 NULL 的
     * 舊訂單，它們沒有可靠的認列時間點，不得用 created_at 頂替（會污染營收語意）。
     */
    db.query(
      `SELECT
         COUNT(*)::int AS orders_count,
         COALESCE(SUM(
           CASE WHEN status = 'approved' THEN COALESCE(total_amount, total_price, 0) ELSE 0 END
         ), 0)::bigint AS revenue,
         COUNT(*) FILTER (
           WHERE created_at >= ${L_START} AND created_at < ${L_END}
         )::int AS new_orders_count,
         COALESCE(SUM(
           CASE
             WHEN status = 'approved'
              AND paid_at IS NOT NULL
              AND paid_at >= ${L_START}
              AND paid_at < ${L_END}
             THEN COALESCE(total_amount, total_price, 0)
             ELSE 0
           END
         ), 0)::bigint AS period_revenue,
         COUNT(*) FILTER (
           WHERE created_at >= ${PL_START} AND created_at < ${PL_END}
         )::int AS prev_new_orders_count,
         COALESCE(SUM(
           CASE
             WHEN status = 'approved'
              AND paid_at IS NOT NULL
              AND paid_at >= ${PL_START}
              AND paid_at < ${PL_END}
             THEN COALESCE(total_amount, total_price, 0)
             ELSE 0
           END
         ), 0)::bigint AS prev_period_revenue
       FROM orders`,
      p
    ),
    // 本輪沿用現行 user 口徑：不分 role（角色細分屬獨立產品決策）。
    db.query(
      `SELECT
         COUNT(*)::int AS users_count,
         COUNT(*) FILTER (WHERE created_at >= ${L_START} AND created_at < ${L_END})::int AS new_users_count,
         COUNT(*) FILTER (WHERE created_at >= ${PL_START} AND created_at < ${PL_END})::int AS prev_new_users_count
       FROM users`,
      p
    ),
    // 期間內「建立」的教材。materials 沒有 published_at，因此不做「期間內上架數」。
    db.query(
      `SELECT
         COUNT(*)::int AS materials_count,
         COUNT(*) FILTER (WHERE created_at >= ${L_START} AND created_at < ${L_END})::int AS new_materials_count,
         COUNT(*) FILTER (WHERE created_at >= ${PL_START} AND created_at < ${PL_END})::int AS prev_new_materials_count
       FROM materials`,
      p
    ),
    // review.created_at 是 TIMESTAMPTZ → 直接與絕對時間點比較，不可套用 LOCAL()。
    db.query(
      `SELECT
         COUNT(*)::int AS reviews_count,
         COUNT(*) FILTER (WHERE created_at >= ${I_START} AND created_at < ${I_END})::int AS new_reviews_count,
         COUNT(*) FILTER (WHERE created_at >= ${PI_START} AND created_at < ${PI_END})::int AS prev_new_reviews_count,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS current_week,
         COUNT(*) FILTER (
           WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'
         )::int AS previous_week
       FROM review`,
      p
    ),
    db.query(`SELECT COUNT(*)::int AS c FROM manual_payment_proofs WHERE review_status = 'pending'`),
    db.query(`SELECT COUNT(*)::int AS c FROM reports WHERE status = 'pending'`),
    /*
     * **Dashboard 待辦的 canonical 定義**：現在需要 Admin 執行下一步的案件。
     *
     * 狀態清單來自 `utils/reportWorkflow.js` 的 `ADMIN_ACTIONABLE_REPORT_STATUSES`
     * （`pending` + `investigating`），**不是**在這裡手寫一組 status array ——
     * Dashboard 與檢舉頁各自寫一份，正是兩邊數字對不起來的成因。
     *
     * `awaiting_creator` 刻意不計：球在創作者手上（見該常數的說明）。
     * terminal（含 legacy `reviewed`）自然也不在其中。
     */
    db.query(`SELECT COUNT(*)::int AS c FROM reports WHERE status = ANY($1::text[])`, [
      [...reportWorkflow.ADMIN_ACTIONABLE_REPORT_STATUSES],
    ]),
    /*
     * **已逾法定期限且仍需處理的消費申訴數**（`P1-09` Gate 3 / Wave 2 #11）。
     *
     * 判準來自 `services/consumerComplaint.service.js` 的 `OVERDUE_SQL` ——
     * **不是**在這裡手寫一組條件。Dashboard 與 `/admin/complaints?overdue=1`
     * 各寫一份，正是「告警說 3 件、點進去只有 2 件」的成因，
     * 而那會直接毀掉告警的可信度。
     *
     * `resolved` / `closed` 已在該判準中排除 —— 已處理完的案件不是待辦告警。
     */
    db.query(
      `SELECT COUNT(*)::int AS c FROM consumer_complaints WHERE ${consumerComplaint.OVERDUE_SQL}`
    ),
  ]);

  const o = ordersRes.rows[0] || {};
  const u = usersRes.rows[0] || {};
  const m = materialsRes.rows[0] || {};
  const r = reviewRes.rows[0] || {};

  const current = {
    revenue: Number(o.period_revenue || 0),
    orders: Number(o.new_orders_count || 0),
    users: Number(u.new_users_count || 0),
    materials: Number(m.new_materials_count || 0),
    reviews: Number(r.new_reviews_count || 0),
  };
  const prev = {
    revenue: Number(o.prev_period_revenue || 0),
    orders: Number(o.prev_new_orders_count || 0),
    users: Number(u.prev_new_users_count || 0),
    materials: Number(m.prev_new_materials_count || 0),
    reviews: Number(r.prev_new_reviews_count || 0),
  };

  /*
   * @deprecated 舊的 7 天滾動指標，已被 previous-period comparison 取代。
   * 目前沒有任何 caller（前端已停用），保留 response 欄位僅為避免 breaking change；
   * 它把「從 0 成長」硬編成 100%，與 `computeDeltaPercent` 的 canonical 規則不一致。
   */
  const currentWeek = Number(r.current_week || 0);
  const previousWeek = Number(r.previous_week || 0);
  const wowReviewDeltaPercent =
    previousWeek > 0 ? Math.round(((currentWeek - previousWeek) / previousWeek) * 100) : currentWeek > 0 ? 100 : 0;

  return {
    // 解析後的期間 metadata：caller（含 UI）應以此為準顯示區間，不要自行推算。
    periodFrom: period.from,
    periodTo: period.to,
    periodTimezone: REPORTING_TIMEZONE,
    periodPreset: period.preset,

    // Period metrics — 受 reporting period 控制
    periodRevenueAmount: current.revenue,
    newOrdersCount: current.orders,
    newUsersCount: current.users,
    newMaterialsCount: current.materials,
    newReviewsCount: current.reviews,

    // 比較基準期（緊鄰前一等長期間；this_month 為上月同期）
    previousPeriodFrom: previous.from,
    previousPeriodTo: previous.to,
    previousPeriodRevenueAmount: prev.revenue,
    previousNewOrdersCount: prev.orders,
    previousNewUsersCount: prev.users,
    previousNewMaterialsCount: prev.materials,
    previousNewReviewsCount: prev.reviews,

    /*
     * Canonical 成長率（`computeDeltaPercent`）。`null` 代表 previous = 0 且 current > 0，
     * 百分比在數學上無有限值 —— UI 顯示「新增」，不得自行代換成 100。
     */
    revenueDeltaPercent: computeDeltaPercent(current.revenue, prev.revenue),
    newOrdersDeltaPercent: computeDeltaPercent(current.orders, prev.orders),
    newUsersDeltaPercent: computeDeltaPercent(current.users, prev.users),
    newMaterialsDeltaPercent: computeDeltaPercent(current.materials, prev.materials),
    newReviewsDeltaPercent: computeDeltaPercent(current.reviews, prev.reviews),

    // Snapshot / all-time — 不受 reporting period 影響
    materialsCount: Number(m.materials_count || 0),
    ordersCount: Number(o.orders_count || 0),
    revenueAmount: Number(o.revenue || 0),
    reviewsCount: Number(r.reviews_count || 0),
    usersCount: Number(u.users_count || 0),
    pendingProofsCount: Number(pendingProofsRes.rows[0]?.c || 0),
    /**
     * @deprecated 語意上仍然是**字面**的 `status = 'pending'`（新進、沒有人接手）。
     * Dashboard 的待辦卡已改用 `actionableReportsCount`；保留此欄位是為了不破壞既有 caller，
     * 且它的名字與內容仍然相符 —— 不會變成「名字說 pending、實際卻是別的東西」的技術債。
     */
    pendingReportsCount: Number(pendingReportsRes.rows[0]?.c || 0),
    /**
     * 現在需要 Admin 執行下一步的檢舉數（`pending` + `investigating`）。
     * 定義見 `utils/reportWorkflow.js` 的 `ADMIN_ACTIONABLE_REPORT_STATUSES`。
     */
    actionableReportsCount: Number(actionableReportsRes.rows[0]?.c || 0),
    /**
     * 已逾消保法 §43 II 十五日期限、且**仍需處理**的申訴數。
     * canonical 判準見 `consumerComplaint.service.js` 的 `OVERDUE_SQL`；
     * 與 `/admin/complaints?overdue=1` 回傳的集合**必定一致**。
     */
    overdueComplaintsCount: Number(overdueComplaintsRes.rows[0]?.c || 0),
    wowReviewDeltaPercent,
  };
}

module.exports = { getDashboardSummary };
