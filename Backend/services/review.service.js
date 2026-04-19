const reviewRepository = require("../repositories/review.repository");

function newReviewId() {
  return `rev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function rowToPublicReview(row) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    created_at: row.created_at,
    parent_id: row.parent_id,
  };
}

function rowToMyReview(row) {
  return {
    id: row.id,
    material_id: row.material_id,
    rating: row.rating,
    comment: row.comment,
    created_at: row.created_at,
  };
}

function rowToCreated(row) {
  return {
    id: row.id,
    material_id: row.material_id,
    rating: row.rating,
    comment: row.comment,
    created_at: row.created_at,
  };
}

/**
 * 建立評論：需存在 approved 之 order，且 order_item.material_id、orders.user_id（parent）與請求一致；每 material 每位 parent 僅一則。
 */
async function createReview({ parentId, materialId, rating, comment }) {
  const ratingNum = Number(rating);
  if (!materialId || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    const err = new Error("material_id and rating (1-5) are required");
    err.code = "VALIDATION";
    throw err;
  }

  const exists = await reviewRepository.materialExists(materialId);
  if (!exists) {
    const err = new Error("material not found");
    err.code = "MATERIAL_NOT_FOUND";
    throw err;
  }

  const allowed = await reviewRepository.hasApprovedOrderForMaterial(parentId, materialId);
  if (!allowed) {
    const err = new Error("not allowed");
    err.code = "FORBIDDEN_ENTITLEMENT";
    throw err;
  }

  const existing = await reviewRepository.findReviewByMaterialAndParent(materialId, parentId);
  if (existing) {
    const err = new Error("already reviewed");
    err.code = "CONFLICT";
    throw err;
  }

  const id = newReviewId();
  const row = await reviewRepository.insertReview({
    id,
    materialId,
    parentId,
    rating: ratingNum,
    comment,
  });

  return {
    response: rowToCreated(row),
    audit: {
      materialId: String(materialId),
      parentId: String(parentId),
      rating: ratingNum,
    },
  };
}

async function listMaterialReviews(materialId) {
  const rows = await reviewRepository.listByMaterialId(materialId);
  return rows.map(rowToPublicReview);
}

async function listMyReviews(parentId) {
  const rows = await reviewRepository.listByParentId(parentId);
  return rows.map(rowToMyReview);
}

async function getMaterialRatingStats(materialId) {
  return reviewRepository.ratingStats(materialId);
}

module.exports = {
  createReview,
  listMaterialReviews,
  listMyReviews,
  getMaterialRatingStats,
};
