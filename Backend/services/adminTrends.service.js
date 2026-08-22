const db = require("../config/db");
const { REPORTING_TIMEZONE } = require("../utils/reportingRange");
const { TRUNC_UNIT, KEY_FORMAT, resolveGranularity, expectedBucketKeys, fillBuckets } = require("../utils/trendBuckets");

/**
 * Admin dashboard 趨勢圖的資料層。
 *
 * ## 兩條序列，兩個不同事件
 *
 *   revenue → `orders.paid_at`（admin 核准付款的時間）＋ `status = 'approved'`
 *   orders  → `orders.created_at`（下單時間）＋ **不分狀態**（＝「新增訂單」趨勢）
 *
 * 兩者刻意不共用日期欄位，也不共用 status 條件；這與 KPI 的
 * `periodRevenueAmount` / `newOrdersCount` 完全一致（見 docs/mvp_rules.md §15.3–15.4）。
 *
 * ## 時區策略
 *
 * `orders.created_at` / `orders.paid_at` 是 **TIMESTAMP（無時區）**，存的是 `NOW()`
 * 寫入當下、以 DB session 時區呈現的牆鐘值。因此：
 *
 *   邊界（沿用 summary service 的策略）
 *     LOCAL($n) 把台北日曆日 00:00 換算成 DB session 時區的牆鐘值
 *
 *   分組
 *     TPE_WALL(col) 把欄位值換算成**台北**牆鐘值後再 `date_trunc`
 *
 * 兩者互為逆向但落在同一個座標系，因此 bucket 與 filter 一定對得上。
 * 絕不可一邊用台北邊界、另一邊用 `date_trunc(col)` 的隱含時區 —— 那會讓
 * 邊界附近的資料掉進錯誤的 bucket，或落在期間內卻沒有對應 bucket。
 *
 * `review.created_at` 是 TIMESTAMPTZ，走的是另一條路徑；本輪沒有 reviews 趨勢圖，
 * 因此這裡不需要處理（KPI 端的策略見 `adminDashboard.service.js`）。
 *
 * 邊界放在比較式右側（常數運算式），欄位本身不包函式，保留索引可用性。
 * 分組運算式無法避免包住欄位，但那發生在 filter 之後，只作用於已篩出的列。
 */

/** 台北日曆日 00:00 的絕對時間點（timestamptz）。 */
const INSTANT = (n) => `(($${n}::date)::timestamp AT TIME ZONE $3::text)`;
/** 同一時間點，改以資料庫 session 時區的牆鐘表示（timestamp，無時區）。 */
const LOCAL = (n) => `(${INSTANT(n)} AT TIME ZONE current_setting('TimeZone'))`;
/** 無時區欄位 → 台北牆鐘值，供 `date_trunc` 分組。 */
const TPE_WALL = (col) => `((${col} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $3::text)`;

const L_START = LOCAL(1);
const L_END = LOCAL(2);

/**
 * `granularity` 只能來自 `resolveGranularity`（三個固定值），再經 TRUNC_UNIT / KEY_FORMAT
 * 對照表取值，因此不會有外部字串進入 SQL。
 */
function bucketExpr(column, granularity) {
  return `to_char(date_trunc('${TRUNC_UNIT[granularity]}', ${TPE_WALL(column)}), '${KEY_FORMAT[granularity]}')`;
}

/**
 * @param {{from: string, to: string, endExclusive: string, preset: string}} period
 *   由 `resolveReportingRange` 產生（summary 與 trends 共用同一個 resolver）
 */
async function getDashboardTrends(period) {
  const granularity = resolveGranularity(period);
  const params = [period.from, period.endExclusive, REPORTING_TIMEZONE];

  const revenueBucket = bucketExpr("paid_at", granularity);
  const ordersBucket = bucketExpr("created_at", granularity);

  const [revenueRes, ordersRes] = await Promise.all([
    /*
     * 營收趨勢：期間內「被核准」的訂單金額。
     * `paid_at IS NOT NULL` 是必要條件 —— 歷史資料存在 status='approved' 但 paid_at 為 NULL
     * 的舊訂單，它們沒有可靠的認列時間點，**不得**退回用 created_at 分組（會污染營收語意）。
     * 這些訂單因此不會出現在任何 bucket 中，屬已知的 legacy gap。
     */
    db.query(
      `SELECT ${revenueBucket} AS bucket,
              COALESCE(SUM(COALESCE(total_amount, total_price, 0)), 0)::bigint AS value
       FROM orders
       WHERE status = 'approved'
         AND paid_at IS NOT NULL
         AND paid_at >= ${L_START}
         AND paid_at < ${L_END}
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
    // 新增訂單趨勢：期間內建立的訂單筆數，不分最終狀態。
    db.query(
      `SELECT ${ordersBucket} AS bucket,
              COUNT(*)::int AS value
       FROM orders
       WHERE created_at >= ${L_START}
         AND created_at < ${L_END}
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
  ]);

  // 分組與補 0 分離：SQL 只回有資料的 bucket，完整序列一律由 helper 產生。
  const keys = expectedBucketKeys(period, granularity);

  return {
    periodFrom: period.from,
    periodTo: period.to,
    periodTimezone: REPORTING_TIMEZONE,
    periodPreset: period.preset,
    granularity,
    revenue: fillBuckets(keys, revenueRes.rows),
    orders: fillBuckets(keys, ordersRes.rows),
  };
}

module.exports = { getDashboardTrends };
