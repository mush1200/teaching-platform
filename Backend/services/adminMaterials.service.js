const db = require("../config/db");
const {
  parsePagination,
  buildPaginationMeta,
  optionalString,
  toLikePattern,
} = require("../utils/adminQuery");

/**
 * Admin 教材審核佇列的資料層（Epic §5 / §6）。
 *
 * ## 狀態只有三個
 *
 * `materials.status` 在 `routes/materials.js` 的 allowlist 是
 * **`pending_review` / `published` / `unpublished`**，沒有 `draft`、沒有 `rejected`、
 * 沒有 `needs_revision`。UI 的 filter 一律對齊這三個值 ——
 * 曾經在 `RoleShell` 的創作者側欄出現過 `?status=draft` 這種永遠 0 筆的 dead filter，
 * 就是因為前端自己想像了一個後端不存在的狀態。
 *
 * ## 為什麼一定要 server-side 分頁
 *
 * 舊版 `GET /admin/materials` 是 `SELECT ... ORDER BY created_at DESC`，沒有 LIMIT。
 * 資料量長到上萬筆時，這一支 API 會把整張表送到瀏覽器。分頁、篩選、搜尋、排序
 * 全部在 SQL 完成，回應永遠只有一頁。
 *
 * ## 相容性
 *
 * 回應仍是 `{ items }`，只是**多了** `pagination` 與 `statusCounts`。
 * 既有 caller 讀 `items` 的行為不變；需要總數的 caller（Dashboard 的教材 KPI）
 * 改讀 `statusCounts`，而不是把整份清單抓回來自己 filter().length。
 */

const MATERIAL_STATUSES = Object.freeze(["pending_review", "published", "unpublished"]);

/**
 * 排序 allowlist。**不得**把 query 字串直接插進 ORDER BY ——
 * 這裡是白名單對照表，不是字串拼接。
 */
const SORT_OPTIONS = Object.freeze({
  created_desc: "m.created_at DESC, m.id DESC",
  created_asc: "m.created_at ASC, m.id ASC",
  updated_desc: "m.updated_at DESC NULLS LAST, m.id DESC",
  title_asc: "m.title ASC, m.id ASC",
  price_desc: "m.price DESC, m.id DESC",
});
const DEFAULT_SORT = "created_desc";

function parseStatusQuery(raw) {
  if (raw == null) return { valid: true, status: null };
  const status = String(raw).trim();
  if (!status || status === "all") return { valid: true, status: null };
  if (!MATERIAL_STATUSES.includes(status)) return { valid: false };
  return { valid: true, status };
}

function parseSortQuery(raw) {
  if (raw == null) return { valid: true, sort: DEFAULT_SORT };
  const sort = String(raw).trim();
  if (!sort) return { valid: true, sort: DEFAULT_SORT };
  if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sort)) return { valid: false };
  return { valid: true, sort };
}

const INVALID_STATUS_MESSAGE = `status must be one of ${MATERIAL_STATUSES.join("|")}`;
const INVALID_SORT_MESSAGE = `sort must be one of ${Object.keys(SORT_OPTIONS).join("|")}`;

/** 全表的狀態計數。**不受 status / q / 分頁影響** —— filter chip 的數字必須是絕對值。 */
async function getStatusCounts() {
  const result = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM materials GROUP BY status`
  );
  const counts = { total: 0 };
  for (const status of MATERIAL_STATUSES) counts[status] = 0;
  for (const row of result.rows) {
    counts[row.status] = row.count;
    counts.total += row.count;
  }
  return counts;
}

/**
 * @param {{ status?: string|null, q?: string|null, sort?: string, page?: number, limit?: number }} params
 */
async function listMaterials({ status = null, q = null, sort = DEFAULT_SORT, page, limit } = {}) {
  const pagination = parsePagination({ page, limit });
  const conditions = [];
  const params = [];
  let i = 1;

  if (status) {
    conditions.push(`m.status = $${i}`);
    params.push(status);
    i += 1;
  }
  if (q) {
    // 人類可讀的搜尋面：教材標題與創作者 email。
    // 教材 id 也可以（貼 URL 回查），但不是主要入口。
    conditions.push(`(
      m.title ILIKE $${i} ESCAPE E'\\\\'
      OR u.email ILIKE $${i} ESCAPE E'\\\\'
      OR m.id ILIKE $${i} ESCAPE E'\\\\'
    )`);
    params.push(toLikePattern(q));
    i += 1;
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderSql = SORT_OPTIONS[sort] || SORT_OPTIONS[DEFAULT_SORT];

  const countResult = await db.query(
    `SELECT COUNT(*)::bigint AS c
     FROM materials m
     LEFT JOIN users u ON u.id = m.teacher_id
     ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0].c);

  const listResult = await db.query(
    `SELECT m.id, m.title, m.teacher_id, m.status, m.price,
            m.created_at, m.updated_at, m.material_features,
            u.email AS creator_email,
            (SELECT COUNT(*)::int FROM reports r
              WHERE r.material_id = m.id AND r.status IN ('pending', 'investigating', 'awaiting_creator'))
              AS open_report_count
     FROM materials m
     LEFT JOIN users u ON u.id = m.teacher_id
     ${whereSql}
     ORDER BY ${orderSql}
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items: listResult.rows, pagination: buildPaginationMeta(pagination, total) };
}

module.exports = {
  MATERIAL_STATUSES,
  SORT_OPTIONS,
  DEFAULT_SORT,
  INVALID_STATUS_MESSAGE,
  INVALID_SORT_MESSAGE,
  parseStatusQuery,
  parseSortQuery,
  getStatusCounts,
  listMaterials,
  optionalString,
};
