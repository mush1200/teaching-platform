const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../config/db");
const { requireAuth } = require("../middlewares/auth");
const { signToken } = require("../utils/jwt");

const router = express.Router();
const ALLOWED_ROLES = new Set(["teacher", "parent", "buyer", "admin"]);

function normalizeRoleForStorage(role) {
  // Compatibility period: accept parent/buyer input but store canonical buyer.
  if (role === "parent" || role === "buyer") return "buyer";
  return role;
}

function normalizeRoleForClient(role) {
  return role === "buyer" ? "parent" : role;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password || !role) {
      return res.status(400).json({ message: "email, password, role are required" });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ message: "role must be teacher|parent|buyer|admin" });
    }

    const exists = await db.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [String(email).trim()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: "email already exists" });
    }

    const roleToStore = normalizeRoleForStorage(String(role));
    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await db.query(
      `INSERT INTO users(id, email, password_hash, role)
       VALUES($1, $2, $3, $4)
       RETURNING id, email, role, created_at`,
      [newId("usr"), String(email).trim(), passwordHash, roleToStore]
    );

    const user = result.rows[0];
    const clientRole = normalizeRoleForClient(user.role);
    const token = signToken({ userId: user.id, role: clientRole });
    return res.status(201).json({ token, user: { ...user, role: clientRole } });
  } catch (err) {
    console.error("register failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const result = await db.query(
      `SELECT id, email, role, password_hash, created_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [String(email).trim()]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: "invalid credentials" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) return res.status(401).json({ message: "invalid credentials" });

    const clientRole = normalizeRoleForClient(user.role);
    const token = signToken({ userId: user.id, role: clientRole });
    return res.json({ token, user: { id: user.id, email: user.email, role: clientRole, created_at: user.created_at } });
  } catch (err) {
    console.error("login failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, role, created_at FROM users WHERE id = $1 LIMIT 1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: "user not found" });
    const user = result.rows[0];
    return res.json({ user: { ...user, role: normalizeRoleForClient(user.role) } });
  } catch (err) {
    console.error("get me failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
