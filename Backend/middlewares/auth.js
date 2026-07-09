const { verifyToken } = require("../utils/jwt");

function normalizeRoleForCompatibility(role) {
  return role === "buyer" ? "parent" : role;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.user = { ...decoded, role: normalizeRoleForCompatibility(decoded?.role) }; // { userId, role, iat, exp }
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

/**
 * 若有 Bearer token 且有效則設定 req.user；無 token 或無效則視為匿名（不擋請求）。
 * 用於 GET /materials 等需依角色顯示不同內容的讀取 API。
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.user = { ...decoded, role: normalizeRoleForCompatibility(decoded?.role) };
  } catch {
    // 匿名讀取：略過無效／過期 token，與未帶 token 行為一致
  }

  next();
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!req.user.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requiredRole = normalizeRoleForCompatibility(role);
    const userRole = normalizeRoleForCompatibility(req.user.role);
    if (userRole !== requiredRole) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    next();
  };
}

function requireParent(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const userRole = normalizeRoleForCompatibility(req.user.role);
  if (userRole !== "parent") {
    return res.status(403).json({ message: "Only parent can create order" });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireRole, requireParent };
