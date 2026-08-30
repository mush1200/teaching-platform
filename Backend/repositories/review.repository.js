const db = require("../config/db");

async function materialExists(materialId) {
  const result = await db.query(`SELECT 1 FROM materials WHERE id = $1 LIMIT 1`, [String(materialId)]);
  return result.rows.length > 0;
}

/**
 * 這個買家目前是否具備對該教材發表評價的資格。
 *
 * **看的是「現在是否持有有效授權」，不是「曾經買過」**（P1-09 Gate 14）：
 * 除了訂單已核准，該品項的 `entitlement_status` 也必須是 `active`。
 *
 * 理由：發表評價是**產生對外公開且不可逆內容**的新寫入。
 * 若平台已經暫停或撤銷某人對某教材的存取（退款、爭議、侵權下架處置中），
 * 還讓他就該教材發表公開評價是不連貫的。
 *
 * **這只擋新評價，不影響既有評價** —— 已發表的內容不因授權狀態變更而消失。
 * 訂單歷史與營收認列亦不受影響（那些是「曾經買過」的事實，見
 * `teacherSales` / `adminDashboard` / `buyerOrders`，**刻意不加此條件**）。
 */
async function hasApprovedOrderForMaterial(parentId, materialId) {
  const result = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1
         AND oi.material_id = $2
         AND o.status = 'approved'
         AND oi.entitlement_status = 'active'
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
