const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();
const { requireAuth } = require("../middlewares/auth");
const authController = require("../controllers/authController");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
// Day2 先用記憶體暫存，先把流程跑通
const users = []; // { id, email, passwordHash, role, createdAt }

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "email and password are required" });

    const exists = users.find((u) => u.email === email);
    if (exists) return res.status(409).json({ message: "email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id: newId(),
      email,
      passwordHash,
      role: role || "user",
      createdAt: new Date().toISOString(),
    };
    users.push(user);

    return res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "server error" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "email and password are required" });

    const user = users.find((u) => u.email === email);
    if (!user) return res.status(401).json({ message: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "invalid credentials" });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({ token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "server error" });
  }
});

// GET /auth/me（驗證 token）
router.get("/me", requireAuth, (req, res) => {
  const user = users.find((u) => u.id === req.user.userId);
  if (!user) return res.status(401).json({ message: "user not found" });

  return res.json({
    user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
  });
});

module.exports = router;
