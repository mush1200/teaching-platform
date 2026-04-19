const db = require("../config/db");

const REPORT_COLUMNS =
  "id, material_id, reporter_id, reason, status, created_at, reviewed_at, reviewed_by";

async function findReportById(id) {
  const result = await db.query(`SELECT ${REPORT_COLUMNS} FROM reports WHERE id = $1 LIMIT 1`, [
    String(id),
  ]);
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
 * @returns {Promise<object|null>} 更新後 report 列，若未更新則 null
 */
async function markReportReviewed({ id, reviewedBy }) {
  const result = await db.query(
    `UPDATE reports
     SET status = 'reviewed',
         reviewed_at = NOW(),
         reviewed_by = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING ${REPORT_COLUMNS}`,
    [String(id), String(reviewedBy)]
  );
  return result.rows[0] || null;
}

module.exports = {
  findReportById,
  listReports,
  listReportsByMaterialId,
  markReportReviewed,
};
