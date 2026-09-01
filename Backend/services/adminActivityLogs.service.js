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
 * `action` query → action 陣列，或 `null`（不篩選）。
 *
 * 接受單值（`order_created`）與逗號分隔多值（`order_created,report_created`）。
 * 空片段（`a,,b`、結尾逗號）一律丟棄，重複值去重 —— 這些都只影響 SQL 的
 * 冗餘，不影響結果集，但留著會讓 query plan 與除錯輸出變髒。
 * 整串都是空白時視為未提供，**不得**變成 `= ANY('{}')`（那會回空集合，
 * 也就是把「沒有篩選」靜默地變成「篩掉全部」）。
 */
function parseActionFilter(raw) {
  if (raw == null) return null;
  const values = String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  return [...new Set(values)];
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
  addEq("l.target_type", filters.target_type);
  addEq("l.target_id", filters.target_id);

  /*
   * `action` 是**唯一**接受多值的精確比對欄位。
   *
   * 單值語意完全不變（`ANY(ARRAY['x'])` ≡ `= 'x'`），既有 caller
   * （`/admin/activity-logs?action=order_created`、scoped 路由、Postman）行為不動；
   * 逗號分隔則讓「一次要一組 action」成為 API 能表達的東西。
   *
   * 為什麼需要它：Dashboard 的「需要注意的活動」是一組 action 的 latest-N。
   * 若改成「抓一大頁回前端再自己 filter」，當高頻事件（加入購物車、下載）
   * 塞滿那一頁時，widget 會顯示「尚無」——但平台上其實有更早的異常事件。
   * 那是**靜默漏顯示**，不是效能取捨，所以過濾必須發生在有完整資料的這一層。
   *
   * 一律走 parameterized array，不做字串拼接。
   */
  const actions = parseActionFilter(filters.action);
  if (actions) {
    conditions.push(`l.action = ANY($${i}::text[])`);
    params.push(actions);
    i += 1;
  }

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
     ORDER BY l.created_at DESC, l.id DESC -- id 是 UUID，僅作 deterministic tie-breaker
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows.map(serializeRow),
    // `totalPages` 是新增欄位；舊版只有 `{ page, limit, total }`，前端已有 fallback。
    pagination: buildPaginationMeta(pagination, total),
  };
}

/**
 * 單筆紀錄（`GET /admin/activity-logs/:id`）。
 *
 * 與清單共用 `ENRICHED_SELECT` / `serializeRow`。
 *
 * 這支端點原本在 route 層自己寫了一段 plain `SELECT` 加一份 local `serializeRow`，
 * 於是同一筆事件在清單有 `actor_email` / `target_label`、在詳情頁沒有 —— 詳情頁
 * 因此只能顯示 `actor_id` 與 `target_id` 兩個 uuid，正是「必須先知道內部 id 才看得懂」
 * 的那個問題。共用之後兩邊的形狀一致，UI 的 `describeActivity()` 在哪裡都組得出同一句話。
 *
 * `id` 一律以 `id::text` 比對：canonical schema 為 TEXT UUID（2026-08-26 `SCHEMA-01`），
 * 而 2026-08-26 之前由新版 bootstrap 建立的環境可能是 BIGSERIAL —— 字串比對兩者皆可。
 *
 * @returns 序列化後的紀錄，查無則 `null`（由 route 決定回 404）。
 */
async function getLogById(id) {
  const raw = String(id ?? "").trim();
  if (!raw) return null;
  const result = await db.query(
    `SELECT ${ENRICHED_SELECT}
     ${ENRICHED_FROM}
     WHERE l.id::text = $1`,
    [raw]
  );
  return result.rows.length > 0 ? serializeRow(result.rows[0]) : null;
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
  getLogById,
  parseActionFilter,
  listDistinctActions,
  listDistinctActorRoles,
  parseIsoDate,
  serializeRow,
};
