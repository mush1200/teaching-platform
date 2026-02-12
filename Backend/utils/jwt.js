const jwt = require("jsonwebtoken");

/**
 * 簽發 JWT（登入成功時用）
 * payload：只放必要資訊（userId, role）
 */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

/**
 * 驗證 JWT（middleware 用）
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  signToken,
  verifyToken,
};
