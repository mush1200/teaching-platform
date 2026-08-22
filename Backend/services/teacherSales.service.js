const db = require("../config/db");
const { REPORTING_TIMEZONE } = require("../utils/reportingRange");
const { TRUNC_UNIT, KEY_FORMAT, resolveGranularity, expectedBucketKeys, fillBuckets } = require("../utils/trendBuckets");

/**
 * Creator（teacher）銷售統計的資料層。
 *
 * ## Canonical semantics（見 docs/mvp_rules.md §18）
 *
 *   Meaning : **Creator Gross Sales** —— 已成交的創作者商品行金額，**折扣前**
 *   Amount  : SUM(order_items.subtotal)
 *   Status  : orders.status = 'approved'
 *   Date    : orders.paid_at（admin 核准付款的時間）
 *   Window  : Asia/Taipei 日曆日，half-open [start, end)
 *
 * 與 Admin 的 recognized revenue **刻意**只差在金額基準：
 *   Admin   = orders.total_amount（折扣後、order-level）
 *   Creator = Σ order_items.subtotal（折扣前、item-level）
 * 兩者涵蓋**完全相同的一組訂單、在完全相同的日期上**，差額恰為 `orders.discount_amount`。
 * 本階段不做折扣分攤，因此多創作者訂單有折扣時 Σ Creator > Admin 是預期且可解釋的。
 *
 * ## 時區策略
 *
 * `orders.paid_at` 是 **TIMESTAMP（無時區）**，存的是 `NOW()` 寫入當下、以 DB session
 * 時區呈現的牆鐘值。因此沿用 Admin 的同一組運算式：邊界用 `LOCAL()` 換算到同一個牆鐘
 * 座標系，趨勢分組用 `TPE_WALL()` 換算成台北牆鐘後再 `date_trunc`。兩者互為逆向、落在
 * 同一座標系，bucket 與 filter 必然對得上。
 *
 * 本模組**不**執行 `SET TIME ZONE`，也不依賴 Node TZ 或瀏覽器時區。
 */

/** 台北日曆日 00:00 的絕對時間點（timestamptz）。 */
const INSTANT = (n) => `(($${n}::date)::timestamp AT TIME ZONE $3::text)`;
/** 同一時間點，改以資料庫 session 時區的牆鐘表示（timestamp，無時區）。 */
const LOCAL = (n) => `(${INSTANT(n)} AT TIME ZONE current_setting('TimeZone'))`;
/** 無時區欄位 → 台北牆鐘值，供 `date_trunc` 分組。 */
const TPE_WALL = (col) => `((${col} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $3::text)`;

/**
 * **Canonical eligible-sale predicate。**
 *
 * summary / materials / records / trend 一律共用這一份，避免四支查詢各自手寫 status
 * 集合而再次 semantic drift（上一輪的 `IN ('approved','completed')` 就是這樣長出來的）。
 *
 * `oi.seller_id = $4` 直接來自已驗簽 JWT 的 `req.user.userId`，**永遠不接受 query 參數**
 * —— 這是跨創作者隔離的 P0 security invariant。
 *
 * `paid_at IS NOT NULL` 是必要條件：資料庫存在 `status='approved'` 但 `paid_at` 為 NULL
 * 的歷史列，它們沒有可靠的認列時間點。**不得** fallback 成 `COALESCE(paid_at, created_at)`
 * —— 那會再次破壞認列語意。這些列因此不會出現在任何期間統計中（已知 legacy data gap）。
 *
 * 參數固定為 $1 = from、$2 = endExclusive、$3 = timezone、$4 = sellerId；
 * 呼叫端的額外參數一律從 $5 開始。
 */
const ELIGIBLE_SALE = `
  oi.seller_id = $4
  AND o.status = 'approved'
  AND o.paid_at IS NOT NULL
  AND o.paid_at >= ${LOCAL(1)}
  AND o.paid_at < ${LOCAL(2)}
`;

/** 所有查詢共用的前四個參數。 */
function baseParams(period, sellerId) {
  return [period.from, period.endExclusive, REPORTING_TIMEZONE, String(sellerId)];
}

/** 期間 metadata：caller（含 UI）應以此顯示區間，不要自行推算。 */
function periodMeta(period) {
  return {
    periodFrom: period.from,
    periodTo: period.to,
    periodTimezone: REPORTING_TIMEZONE,
    periodPreset: period.preset,
  };
}

/**
 * `granularity` 只能來自 `resolveGranularity`（三個固定值），再經對照表取值，
 * 因此不會有外部字串進入 SQL。
 */
function bucketExpr(column, granularity) {
  return `to_char(date_trunc('${TRUNC_UNIT[granularity]}', ${TPE_WALL(column)}), '${KEY_FORMAT[granularity]}')`;
}

/**
 * 期間內的銷售總覽 + 趨勢。
 *
 * @param {{from: string, to: string, endExclusive: string, preset: string}} period
 * @param {string} sellerId 來自 JWT 的創作者 id
 */
async function getSalesSummary(period, sellerId) {
  const params = baseParams(period, sellerId);
  const granularity = resolveGranularity(period);

  const [totalsRes, trendRes] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(oi.quantity), 0)::int AS total_sold_units,
         COALESCE(SUM(oi.subtotal), 0)::bigint AS total_sales_amount,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COUNT(DISTINCT oi.material_id)::int AS materials_count
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE ${ELIGIBLE_SALE}`,
      params
    ),
    db.query(
      `SELECT ${bucketExpr("o.paid_at", granularity)} AS bucket,
              COALESCE(SUM(oi.subtotal), 0)::bigint AS sales_amount,
              COALESCE(SUM(oi.quantity), 0)::int AS sold_units
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE ${ELIGIBLE_SALE}
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
  ]);

  const t = totalsRes.rows[0] || {};
  // 分組與補 0 分離：SQL 只回有資料的 bucket，完整序列一律由 helper 產生（圖表不跳日期）。
  const keys = expectedBucketKeys(period, granularity);
  const amounts = fillBuckets(keys, trendRes.rows.map((r) => ({ bucket: r.bucket, value: r.sales_amount })));
  const units = fillBuckets(keys, trendRes.rows.map((r) => ({ bucket: r.bucket, value: r.sold_units })));

  return {
    ...periodMeta(period),
    granularity,

    totalSoldUnits: Number(t.total_sold_units || 0),
    /** Canonical：Creator Gross Sales（折扣前）。 */
    totalSalesAmount: Number(t.total_sales_amount || 0),
    /** @deprecated 與 `totalSalesAmount` 同值。名稱誤導（它不是 revenue），保留僅為相容。 */
    totalRevenue: Number(t.total_sales_amount || 0),
    totalOrders: Number(t.total_orders || 0),
    materialsCount: Number(t.materials_count || 0),

    /**
     * `key` 是 machine-friendly 識別碼（`YYYY-MM-DD` / `...THH` / `YYYY-MM`），
     * **不是** PostgreSQL 的 date 物件 —— 舊實作把 PG date 直接送到前端再
     * `toISOString()`，導致每個點的日期都早一天。
     */
    trend: amounts.map((point, i) => ({
      key: point.key,
      salesAmount: point.value,
      soldUnits: units[i].value,
      /** @deprecated `key` 的別名。 */
      day: point.key,
      /** @deprecated `salesAmount` 的別名。 */
      revenue: point.value,
    })),
  };
}

/** 期間內以教材維度聚合的銷售。 */
async function getSalesByMaterial(period, sellerId, { search = "", page = 1, limit = 20 } = {}) {
  const params = baseParams(period, sellerId);
  let filterSql = "";
  if (search) {
    params.push(`%${search}%`);
    filterSql = ` AND (m.title ILIKE $${params.length} OR oi.material_id ILIKE $${params.length}) `;
  }

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM (
       SELECT oi.material_id
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN materials m ON m.id = oi.material_id
       WHERE ${ELIGIBLE_SALE} ${filterSql}
       GROUP BY oi.material_id
     ) s`,
    params
  );
  const total = Number(countRes.rows[0]?.total || 0);

  const listParams = [...params, limit, (page - 1) * limit];
  const rows = await db.query(
    `SELECT
       oi.material_id AS "materialId",
       m.title AS title,
       COALESCE(SUM(oi.quantity), 0)::int AS "soldUnits",
       COALESCE(SUM(oi.subtotal), 0)::int AS "salesAmount",
       MAX(o.paid_at) AS "lastSoldAt"
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     INNER JOIN materials m ON m.id = oi.material_id
     WHERE ${ELIGIBLE_SALE} ${filterSql}
     GROUP BY oi.material_id, m.title
     ORDER BY COALESCE(SUM(oi.subtotal), 0) DESC, MAX(o.paid_at) DESC
     LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams
  );

  return {
    ...periodMeta(period),
    // `lastSoldAt` 現在是**最近成交時間**（paid_at），不再是最近下單時間。
    items: rows.rows.map((r) => ({
      ...r,
      /** @deprecated `salesAmount` 的別名。 */
      revenue: r.salesAmount,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** 期間內的成交明細。 */
async function getSalesRecords(period, sellerId, { materialId = "", page = 1, limit = 20 } = {}) {
  const params = baseParams(period, sellerId);
  let filterSql = "";
  if (materialId) {
    params.push(materialId);
    filterSql = ` AND oi.material_id = $${params.length} `;
  }

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     INNER JOIN materials m ON m.id = oi.material_id
     WHERE ${ELIGIBLE_SALE} ${filterSql}`,
    params
  );
  const total = Number(countRes.rows[0]?.total || 0);

  const listParams = [...params, limit, (page - 1) * limit];
  const rows = await db.query(
    `SELECT
       o.id AS "orderId",
       oi.id AS "orderItemId",
       oi.material_id AS "materialId",
       m.title AS "materialTitle",
       oi.quantity AS quantity,
       COALESCE(oi.subtotal, 0)::int AS subtotal,
       COALESCE(oi.price_snapshot, 0)::int AS "unitPrice",
       o.user_id AS "buyerId",
       o.status AS "orderStatus",
       o.created_at AS "createdAt",
       o.paid_at AS "paidAt"
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     INNER JOIN materials m ON m.id = oi.material_id
     WHERE ${ELIGIBLE_SALE} ${filterSql}
     ORDER BY o.paid_at DESC, oi.id DESC
     LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams
  );

  return {
    ...periodMeta(period),
    // 主排序改為成交時間（paid_at）—— 這是 Creator Sales 頁，不是下單記錄。
    items: rows.rows,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = { getSalesSummary, getSalesByMaterial, getSalesRecords };
