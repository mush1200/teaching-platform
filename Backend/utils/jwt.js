const jwt = require("jsonwebtoken");

/**
 * 簽發 JWT（登入成功時用）
 * payload：只放必要資訊（userId, role）
 */
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

/**
 * 與 routes/auth 手動 jwt.sign 使用同一預設 secret，避免本機未設 .env 時登入後驗證失敗
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signToken,
  verifyToken,
};
