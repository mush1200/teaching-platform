const db = require("../config/db");
const { parsePagination, buildPaginationMeta, toLikePattern } = require("../utils/adminQuery");

/**
 * 活動紀錄的查詢層（Epic §8）。
 *
 * ## 問題
 *
 * 舊版 `GET /admin/activity-logs` 只接受 `actor_id` / `actor_role` / `action` /
 * `target_type` / `target_id` 的**精確相等**比對，而且回應裡只有這些原始欄位。
 * 也就是說：Admin 必須先知道一個內部 id 才查得到東西，查到之後看到的還是 id。
 * 那是 DB console，不是營運工具。
 *
 * ## 這裡加了什麼
 *
 *   1. `q` —— 人類看得懂的搜尋面：操作者 email、訂單編號、教材標題、教材／訂單 id。
 *      注意它同時涵蓋 **actor** 與 **target** 兩側：Admin 心裡想的是「這個人做了什麼」
 *      或「這張訂單發生過什麼」，不會先分清楚自己要查的是哪一欄。
 *   2. `from` / `to` —— 日期區間（含當日）。
 *   3. 每一列補上 `actor_email` / `target_label`，讓 UI 能組出
 *      「管理員 xxx 核准付款 · 訂單 #ord_…」而不是三個 id。
 *
 * 既有的精確比對參數**全部保留**：既有 caller（`/admin/users/:id/activity-logs` 等
 * scoped 頁面、Postman collection）行為不變，`q` 是額外的 AND 條件。
 *
 * ## 不動的部分
 *
 * `activity_logs` 是稽核軌跡。這裡只讀，不寫、不刪、不改寫既有列（含 `actor_role`
 * 裡的 legacy `parent`）。`meta` 也原封不動回傳 —— technical metadata 不刪除，
 * 只是在 UI 上降級到「詳細資訊」。
 */

/**
 * target_type → 可讀標籤的 JOIN。
 *
 * 用 LEFT JOIN + CASE 而不是三次查詢：`target_id` 的型別依 `target_type` 而異，
 * 一次 JOIN 全部再靠 CASE 選出正確的那個，SQL 只跑一輪。
 */
const ENRICHED_SELECT = `
  l.id, l.actor_id, l.actor_role, l.action, l.target_type, l.target_id, l.meta, l.created_at,
  au.email AS actor_email,
  CASE
    WHEN l.target_type = 'material' THEN m.title
    WHEN l.target_type = 'order'    THEN l.target_id
    WHEN l.target_type = 'report'   THEN rm.title
    WHEN l.target_type = 'user'     THEN tu.email
    ELSE NULL
  END AS target_label,
  ou.email AS order_buyer_email`;

const ENRICHED_FROM = `
  FROM activity_logs l
  LEFT JOIN users au     ON au.id = l.actor_id
  LEFT JOIN materials m  ON l.target_type = 'material' AND m.id = l.target_id
  LEFT JOIN orders o     ON l.target_type = 'order'    AND o.id = l.target_id
  LEFT JOIN users ou     ON ou.id = o.user_id
  LEFT JOIN reports r    ON l.target_type = 'report'   AND r.id = l.target_id
  LEFT JOIN materials rm ON rm.id = r.material_id
  LEFT JOIN users tu     ON l.target_type = 'user'     AND tu.id = l.target_id`;

/** 供 UI 的「操作類型」下拉；只回實際出現過的 action，不是硬編的想像清單。 */
async function listDistinctActions() {
  const result = await db.query(
    `SELECT action, COUNT(*)::int AS count
     FROM activity_logs
     WHERE action IS NOT NULL AND action <> ''
     GROUP BY action
     ORDER BY action ASC`
  );
  return result.rows;
}

/** 同上，供「操作者類型」下拉。含 legacy `parent` —— 那是歷史事實，不過濾掉。 */
async function listDistinctActorRoles() {
  const result = await db.query(
    `SELECT actor_role, COUNT(*)::int AS count
     FROM activity_logs
     WHERE actor_role IS NOT NULL AND actor_role <> ''
     GROUP BY actor_role
     ORDER BY actor_role ASC`
  );
  return result.rows;
}

function serializeRow(row) {
  const created = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: String(row.id),
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    actor_email: row.actor_email ?? null,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    target_label: row.target_label ?? null,
    order_buyer_email: row.order_buyer_email ?? null,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    created_at: created,
  };
}

/**
 * @param {object} filters actor_id / actor_role / action / target_type / target_id / q / from / to
 * @param {{ page?: number, limit?: number }} pageQuery
 */
async function listLogs(filters = {}, pageQuery = {}) {
  const pagination = parsePagination(pageQuery);
  const conditions = [];
  const params = [];
  let i = 1;

  const addEq = (col, val) => {
    if (val != null && val !== "") {
      conditions.push(`${col} = $${i}`);
      params.push(val);
      i += 1;
    }
  };

  addEq("l.actor_id", filters.actor_id);
  addEq("l.actor_role", filters.actor_role);
  addEq("l.action", filters.action);
  addEq("l.target_type", filters.target_type);
  addEq("l.target_id", filters.target_id);

  if (filters.q) {
    conditions.push(`(
      au.email ILIKE $${i} ESCAPE E'\\\\'
      OR m.title ILIKE $${i} ESCAPE E'\\\\'
      OR rm.title ILIKE $${i} ESCAPE E'\\\\'
      OR tu.email ILIKE $${i} ESCAPE E'\\\\'
      OR ou.email ILIKE $${i} ESCAPE E'\\\\'
      OR l.target_id ILIKE $${i} ESCAPE E'\\\\'
      OR l.action ILIKE $${i} ESCAPE E'\\\\'
    )`);
    params.push(toLikePattern(filters.q));
    i += 1;
  }

  // 日期為**含當日**：`to` 比對到當天 23:59:59（half-open 到隔日 00:00）。
  if (filters.from) {
    conditions.push(`l.created_at >= $${i}::date`);
    params.push(filters.from);
    i += 1;
  }
  if (filters.to) {
    conditions.push(`l.created_at < ($${i}::date + INTERVAL '1 day')`);
    params.push(filters.to);
    i += 1;
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::bigint AS c ${ENRICHED_FROM} ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0].c);

  const listResult = await db.query(
    `SELECT ${ENRICHED_SELECT}
     ${ENRICHED_FROM}
     ${whereSql}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows.map(serializeRow),
    // `totalPages` 是新增欄位；舊版只有 `{ page, limit, total }`，前端已有 fallback。
    pagination: buildPaginationMeta(pagination, total),
  };
}

/** ISO 日期（YYYY-MM-DD）；其他格式一律當成未提供，不要把垃圾丟進 `::date` cast。 */
function parseIsoDate(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

module.exports = {
  listLogs,
  listDistinctActions,
  listDistinctActorRoles,
  parseIsoDate,
  serializeRow,
};
