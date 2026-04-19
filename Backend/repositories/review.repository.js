const db = require("../config/db");

async function materialExists(materialId) {
  const result = await db.query(`SELECT 1 FROM materials WHERE id = $1 LIMIT 1`, [String(materialId)]);
  return result.rows.length > 0;
}

async function hasApprovedOrderForMaterial(parentId, materialId) {
  const result = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1
         AND oi.material_id = $2
         AND o.status = 'approved'
       LIMIT 1
     ) AS ok`,
    [String(parentId), String(materialId)]
  );
  return result.rows[0]?.ok === true;
}

async function findReviewByMaterialAndParent(materialId, parentId) {
  const result = await db.query(
    `SELECT id FROM review WHERE material_id = $1 AND parent_id = $2 LIMIT 1`,
    [String(materialId), String(parentId)]
  );
  return result.rows[0] || null;
}

async function insertReview({ id, materialId, parentId, rating, comment }) {
  const result = await db.query(
    `INSERT INTO review(id, material_id, parent_id, rating, comment)
     VALUES($1, $2, $3, $4, $5)
     RETURNING id, material_id, rating, comment, created_at`,
    [id, String(materialId), String(parentId), rating, comment ?? null]
  );
  return result.rows[0];
}

async function listByMaterialId(materialId) {
  const result = await db.query(
    `SELECT id, rating, comment, created_at, parent_id
     FROM review
     WHERE material_id = $1
     ORDER BY created_at DESC`,
    [String(materialId)]
  );
  return result.rows;
}

async function listByParentId(parentId) {
  const result = await db.query(
    `SELECT id, material_id, rating, comment, created_at
     FROM review
     WHERE parent_id = $1
     ORDER BY created_at DESC`,
    [String(parentId)]
  );
  return result.rows;
}

async function ratingStats(materialId) {
  const result = await db.query(
    `SELECT ROUND(AVG(rating)::numeric, 1) AS average,
            COUNT(*)::integer AS count
     FROM review
     WHERE material_id = $1`,
    [String(materialId)]
  );
  const row = result.rows[0];
  return {
    average: row.average === null ? null : Number(row.average),
    count: Number(row.count) || 0,
  };
}

module.exports = {
  materialExists,
  hasApprovedOrderForMaterial,
  findReviewByMaterialAndParent,
  insertReview,
  listByMaterialId,
  listByParentId,
  ratingStats,
};
