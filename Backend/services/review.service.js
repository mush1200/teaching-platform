const reviewRepository = require("../repositories/review.repository");

function newReviewId() {
  return `rev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toCreatedResponse(row) {
  return {
    id: row.id,
    materialId: row.material_id,
    rating: row.rating,
    comment: row.comment,
  };
}

function toPublicListItem(row) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

function toMeListItem(row) {
  return {
    id: row.id,
    materialId: row.material_id,
    orderItemId: row.order_item_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

/**
 * 建立評論：需 order.status = approved、order 擁有者 = reviewer、material 與 order_item 一致、每 order_item 僅一筆。
 */
async function createReview({ reviewerId, orderItemId, rating, comment }) {
  const ratingNum = Number(rating);
  if (!orderItemId || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    const err = new Error("orderItemId and rating (1-5) are required");
    err.code = "VALIDATION";
    throw err;
  }

  const ctx = await reviewRepository.findOrderItemForReview(orderItemId);
  if (!ctx) {
    const err = new Error("order_item not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  if (String(ctx.order_user_id) !== String(reviewerId)) {
    const err = new Error("forbidden");
    err.code = "FORBIDDEN_OWNER";
    throw err;
  }

  if (ctx.order_status !== "approved") {
    const err = new Error("order is not approved");
    err.code = "FORBIDDEN_STATUS";
    throw err;
  }

  const existing = await reviewRepository.findReviewByOrderItemId(orderItemId);
  if (existing) {
    const err = new Error("review already exists for this order_item");
    err.code = "CONFLICT";
    throw err;
  }

  const id = newReviewId();
  const row = await reviewRepository.insertReview({
    id,
    materialId: ctx.order_item_material_id,
    orderItemId,
    reviewerId,
    rating: ratingNum,
    comment,
  });

  return {
    response: toCreatedResponse(row),
    audit: {
      reviewId: row.id,
      materialId: ctx.order_item_material_id,
      orderItemId: String(orderItemId),
      userId: String(reviewerId),
    },
  };
}

async function listMaterialReviews(materialId) {
  const rows = await reviewRepository.listByMaterialId(materialId);
  return rows.map(toPublicListItem);
}

async function listMyReviews(reviewerId) {
  const rows = await reviewRepository.listByReviewerId(reviewerId);
  return rows.map(toMeListItem);
}

module.exports = {
  createReview,
  listMaterialReviews,
  listMyReviews,
  toPublicListItem,
};
