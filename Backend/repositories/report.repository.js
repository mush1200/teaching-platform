const db = require("../config/db");
const { parsePagination, buildPaginationMeta, toLikePattern } = require("../utils/adminQuery");

const REPORT_COLUMNS =
  "id, material_id, reporter_id, reason, status, resolution, resolution_note, created_at, updated_at, reviewed_at, reviewed_by";

/**
 * 案件清單／詳情共用的 enrich 欄位。
 *
 * Admin 需要的是「誰檢舉了誰的哪一份教材」，不是三個 ID。這些 JOIN 只有一份定義，
 * 清單與詳情共用 —— 兩邊各寫一次就會出現「清單顯示 email、詳情顯示 id」這種分歧。
 *
 * `users.email` 是目前 users 表上**唯一**的人類可讀識別欄位（沒有 name / display_name），
 * 因此 email 就是 canonical 的「人」的顯示值。
 */
const REPORT_ENRICHED_SELECT = `
  r.id, r.material_id, r.reporter_id, r.reason, r.status,
  r.resolution, r.resolution_note,
  r.created_at, r.updated_at, r.reviewed_at, r.reviewed_by,
  m.title        AS material_title,
  m.status       AS material_status,
  m.teacher_id   AS creator_id,
  cu.email       AS creator_email,
  ru.email       AS reporter_email,
  au.email       AS reviewed_by_email,
  (SELECT COUNT(*)::int FROM report_events e WHERE e.report_id = r.id) AS event_count,
  (SELECT MAX(e.created_at) FROM report_events e WHERE e.report_id = r.id) AS last_event_at`;

const REPORT_ENRICHED_FROM = `
  FROM reports r
  LEFT JOIN materials m ON m.id = r.material_id
  LEFT JOIN users cu ON cu.id = m.teacher_id
  LEFT JOIN users ru ON ru.id = r.reporter_id
  LEFT JOIN users au ON au.id = r.reviewed_by`;

async function findReportById(id) {
  const result = await db.query(`SELECT ${REPORT_COLUMNS} FROM reports WHERE id = $1 LIMIT 1`, [
    String(id),
  ]);
  return result.rows[0] || null;
}

/** Enriched 單筆（含教材／創作者／檢舉人 email）。 */
async function findEnrichedReportById(id) {
  const result = await db.query(
    `SELECT ${REPORT_ENRICHED_SELECT} ${REPORT_ENRICHED_FROM} WHERE r.id = $1 LIMIT 1`,
    [String(id)]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ status?: string | null }} [filters]
 */
async function listReports(filters = {}) {
  const status = filters.status != null && String(filters.status).trim() !== ""
    ? String(filters.status).trim()
    : null;
  if (status) {
    const result = await db.query(
      `SELECT ${REPORT_COLUMNS} FROM reports WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT ${REPORT_COLUMNS} FROM reports ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * 分頁 + enrich 的案件佇列（Admin 檢舉管理主清單）。
 *
 * @param {{ statuses?: string[]|null, q?: string|null, page?: number, limit?: number }} params
 */
async function listReportCases({ statuses = null, q = null, page, limit } = {}) {
  const pagination = parsePagination({ page, limit });
  const conditions = [];
  const params = [];
  let i = 1;

  if (Array.isArray(statuses) && statuses.length > 0) {
    conditions.push(`r.status = ANY($${i}::text[])`);
    params.push(statuses);
    i += 1;
  }
  if (q) {
    // 人類可讀的搜尋面：教材標題、檢舉理由、檢舉人／創作者 email。
    // case id 也允許 —— 它出現在 URL 裡，Admin 貼回來查是合理的，只是不作為主要入口。
    conditions.push(`(
      m.title ILIKE $${i} ESCAPE E'\\\\'
      OR r.reason ILIKE $${i} ESCAPE E'\\\\'
      OR ru.email ILIKE $${i} ESCAPE E'\\\\'
      OR cu.email ILIKE $${i} ESCAPE E'\\\\'
      OR r.id ILIKE $${i} ESCAPE E'\\\\'
    )`);
    params.push(toLikePattern(q));
    i += 1;
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::bigint AS c ${REPORT_ENRICHED_FROM} ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0].c);

  const listResult = await db.query(
    `SELECT ${REPORT_ENRICHED_SELECT}
     ${REPORT_ENRICHED_FROM}
     ${whereSql}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items: listResult.rows, pagination: buildPaginationMeta(pagination, total) };
}

/** 依狀態計數，供 Admin queue 的 filter chip 顯示待辦數量（不受目前篩選影響）。 */
async function countReportsByStatus() {
  const result = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status`
  );
  const counts = {};
  for (const row of result.rows) counts[row.status] = row.count;
  return counts;
}

/**
 * @param {string} materialId
 * @param {{ status?: string | null }} [filters]
 */
async function listReportsByMaterialId(materialId, filters = {}) {
  const status = filters.status != null && String(filters.status).trim() !== ""
    ? String(filters.status).trim()
    : null;
  if (status) {
    const result = await db.query(
      `SELECT ${REPORT_COLUMNS} FROM reports
       WHERE material_id = $1 AND status = $2
       ORDER BY created_at DESC`,
      [String(materialId), status]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT ${REPORT_COLUMNS} FROM reports
     WHERE material_id = $1
     ORDER BY created_at DESC`,
    [String(materialId)]
  );
  return result.rows;
}

/**
 * pending → reviewed only（WHERE status = pending）。
 *
 * **Legacy**：舊的「標記已讀」路徑（`PATCH /admin/reports/:id { status: "reviewed" }`）。
 * 新的處置流程請用 `updateStatusIfUnchanged`（見 services/reportAdmin.service.js）。
 *
 * @returns {Promise<object|null>} 更新後 report 列，若未更新則 null
 */
async function markReportReviewed({ id, reviewedBy }) {
  const result = await db.query(
    `UPDATE reports
     SET status = 'reviewed',
         reviewed_at = NOW(),
         reviewed_by = $2,
         updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING ${REPORT_COLUMNS}`,
    [String(id), String(reviewedBy)]
  );
  return result.rows[0] || null;
}

/**
 * 條件式狀態轉移：只有當目前狀態仍等於 `expectedFrom` 時才更新。
 *
 * `WHERE status = $expectedFrom` 是這裡的重點 —— 兩個 Admin 同時開著同一張案件時，
 * 第二個人的操作必須失敗（回 null → 409），而不是覆蓋掉第一個人的判定。
 *
 * `resolution` / `resolution_note` 用 `COALESCE` 合併：轉移到 investigating 之類的
 * 中間狀態時不帶處置，既有值不應被清成 NULL。
 *
 * @param {import("pg").PoolClient} client
 */
async function updateStatusIfUnchanged(
  client,
  {
    id,
    expectedFrom,
    nextStatus,
    resolution = null,
    resolutionNote = null,
    reviewedBy = null,
    stampReviewed = false,
  }
) {
  const result = await client.query(
    `UPDATE reports
     SET status = $3,
         resolution = COALESCE($4, resolution),
         resolution_note = COALESCE($5, resolution_note),
         reviewed_by = CASE WHEN $7 THEN $6 ELSE reviewed_by END,
         reviewed_at = CASE WHEN $7 THEN NOW() ELSE reviewed_at END,
         updated_at = NOW()
     WHERE id = $1 AND status = $2
     RETURNING ${REPORT_COLUMNS}`,
    [
      String(id),
      String(expectedFrom),
      String(nextStatus),
      resolution,
      resolutionNote,
      reviewedBy,
      Boolean(stampReviewed),
    ]
  );
  return result.rows[0] || null;
}

/** 取得目前狀態並鎖列；轉移前一定要先鎖，否則 read-then-write 之間會被插隊。 */
async function lockReportForUpdate(client, id) {
  const result = await client.query(
    `SELECT r.id, r.status, r.material_id, m.teacher_id AS creator_id, m.status AS material_status
     FROM reports r
     LEFT JOIN materials m ON m.id = r.material_id
     WHERE r.id = $1
     FOR UPDATE OF r`,
    [String(id)]
  );
  return result.rows[0] || null;
}

/** @param {import("pg").PoolClient|null} client 省略時走 pool（單一 statement 不需要交易）。 */
async function insertReportEvent(
  client,
  { reportId, actorId, actorRole, eventType, message = null, meta = {} }
) {
  const runner = client || db;
  const result = await runner.query(
    `INSERT INTO report_events(report_id, actor_id, actor_role, event_type, message, meta)
     VALUES($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, report_id, actor_id, actor_role, event_type, message, meta, created_at`,
    [
      String(reportId),
      actorId || null,
      actorRole || null,
      String(eventType),
      message,
      JSON.stringify(meta || {}),
    ]
  );
  return result.rows[0];
}

/** 案件時間軸（含 actor email，讓 UI 不必再查一次 users）。 */
async function listReportEvents(reportId) {
  const result = await db.query(
    `SELECT e.id, e.report_id, e.actor_id, e.actor_role, e.event_type, e.message, e.meta, e.created_at,
            u.email AS actor_email
     FROM report_events e
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.report_id = $1
     ORDER BY e.created_at ASC, e.id ASC`,
    [String(reportId)]
  );
  return result.rows;
}

/**
 * Creator 端的案件清單：只回**自己教材**上的檢舉。
 *
 * 授權條件寫在 SQL 的 `m.teacher_id = $1` 上，不是在 route 裡先查一次再比對 ——
 * 少一次比對就會變成跨創作者的資料外洩。
 *
 * 刻意**不回傳** `reporter_id` / `reporter_email` / `reason` 全文以外的檢舉人資訊：
 * 創作者需要知道「被檢舉什麼」，不需要知道「是誰檢舉的」。
 */
async function listCreatorCases({ creatorId, statuses = null, page, limit } = {}) {
  const pagination = parsePagination({ page, limit });
  const params = [String(creatorId)];
  let i = 2;
  let statusSql = "";
  if (Array.isArray(statuses) && statuses.length > 0) {
    statusSql = ` AND r.status = ANY($${i}::text[])`;
    params.push(statuses);
    i += 1;
  }

  const countResult = await db.query(
    `SELECT COUNT(*)::bigint AS c
     FROM reports r
     JOIN materials m ON m.id = r.material_id
     WHERE m.teacher_id = $1${statusSql}`,
    params
  );
  const total = Number(countResult.rows[0].c);

  const listResult = await db.query(
    `SELECT r.id, r.material_id, r.status, r.resolution, r.created_at, r.updated_at,
            m.title AS material_title,
            m.status AS material_status,
            (SELECT e.message FROM report_events e
              WHERE e.report_id = r.id AND e.event_type = 'creator_response_requested'
              ORDER BY e.created_at DESC LIMIT 1) AS latest_request_message,
            (SELECT e.created_at FROM report_events e
              WHERE e.report_id = r.id AND e.event_type = 'creator_response_requested'
              ORDER BY e.created_at DESC LIMIT 1) AS latest_request_at
     FROM reports r
     JOIN materials m ON m.id = r.material_id
     WHERE m.teacher_id = $1${statusSql}
     ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC, r.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items: listResult.rows, pagination: buildPaginationMeta(pagination, total) };
}

/** Creator 端詳情。回 null 表示「不存在**或**不屬於這位創作者」—— 兩者對外一律 404。 */
async function findCreatorCase({ reportId, creatorId }) {
  const result = await db.query(
    `SELECT r.id, r.material_id, r.status, r.resolution, r.resolution_note,
            r.created_at, r.updated_at,
            m.title AS material_title, m.status AS material_status, m.teacher_id AS creator_id
     FROM reports r
     JOIN materials m ON m.id = r.material_id
     WHERE r.id = $1 AND m.teacher_id = $2
     LIMIT 1`,
    [String(reportId), String(creatorId)]
  );
  return result.rows[0] || null;
}

/**
 * Creator 可見的案件時間軸。
 *
 * 過濾掉 `admin_note` —— 那是 Admin 的內部調查筆記，不是要給創作者看的內容。
 * 其餘（要求說明、創作者自己的回覆、狀態變更、最終處置）都可見。
 */
async function listCreatorVisibleEvents(reportId) {
  const result = await db.query(
    `SELECT e.id, e.report_id, e.actor_role, e.event_type, e.message, e.meta, e.created_at
     FROM report_events e
     WHERE e.report_id = $1 AND e.event_type <> 'admin_note'
     ORDER BY e.created_at ASC, e.id ASC`,
    [String(reportId)]
  );
  return result.rows;
}

module.exports = {
  findReportById,
  findEnrichedReportById,
  listReports,
  listReportCases,
  countReportsByStatus,
  listReportsByMaterialId,
  markReportReviewed,
  updateStatusIfUnchanged,
  lockReportForUpdate,
  insertReportEvent,
  listReportEvents,
  listCreatorCases,
  findCreatorCase,
  listCreatorVisibleEvents,
};
