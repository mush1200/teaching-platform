class Purchase {
  constructor({ id, userId, materialId, status }) {
    this.id = id;
    this.userId = userId;
    this.materialId = materialId;
    this.status = status || "pending"; // pending | approved | rejected
    this.createdAt = new Date();
  }
}

module.exports = Purchase;
