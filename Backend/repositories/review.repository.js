const db = require("../config/db");

async function findOrderItemForReview(orderItemId) {
  const result = await db.query(
    `SELECT oi.id AS order_item_id,
            oi.material_id AS order_item_material_id,
            o.id AS order_id,
            o.user_id AS order_user_id,
            o.status AS order_status
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1
     LIMIT 1`,
    [String(orderItemId)]
  );
  return result.rows[0] || null;
}

async function findReviewByOrderItemId(orderItemId) {
  const result = await db.query(`SELECT id FROM review WHERE order_item_id = $1 LIMIT 1`, [
    String(orderItemId),
  ]);
  return result.rows[0] || null;
}

async function insertReview({ id, materialId, orderItemId, reviewerId, rating, comment }) {
  const result = await db.query(
    `INSERT INTO review(id, material_id, order_item_id, reviewer_id, rating, comment)
     VALUES($1, $2, $3, $4, $5, $6)
     RETURNING id, material_id, rating, comment, created_at`,
    [id, String(materialId), String(orderItemId), String(reviewerId), rating, comment ?? null]
  );
  return result.rows[0];
}

async function listByMaterialId(materialId) {
  const result = await db.query(
    `SELECT id, rating, comment, created_at
     FROM review
     WHERE material_id = $1
     ORDER BY created_at DESC`,
    [String(materialId)]
  );
  return result.rows;
}

async function listByReviewerId(reviewerId) {
  const result = await db.query(
    `SELECT id, material_id, order_item_id, rating, comment, created_at
     FROM review
     WHERE reviewer_id = $1
     ORDER BY created_at DESC`,
    [String(reviewerId)]
  );
  return result.rows;
}

module.exports = {
  findOrderItemForReview,
  findReviewByOrderItemId,
  insertReview,
  listByMaterialId,
  listByReviewerId,
};
