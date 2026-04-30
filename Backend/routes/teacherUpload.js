const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "material-media");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

function publicBaseUrl() {
  const explicit = process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL;
  if (explicit && String(explicit).trim()) {
    return String(explicit).replace(/\/$/, "");
  }
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 32);
    const safeExt = /^\.[a-zA-Z0-9]+$/.test(ext) ? ext : "";
    const name = `${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}${safeExt}`;
    cb(null, name);
  },
});

/**
 * POST /teacher/uploads/material-media?kind=cover|detail|demo
 * multipart field name: file
 */
router.post(
  "/uploads/material-media",
  requireAuth,
  requireRole("teacher"),
  (req, res, next) => {
    const raw = String(req.query.kind || "cover");
    const kind = ["cover", "detail", "demo"].includes(raw) ? raw : "cover";
    const maxBytes = kind === "demo" ? 80 * 1024 * 1024 : 10 * 1024 * 1024;

    const upload = multer({
      storage,
      limits: { fileSize: maxBytes },
      fileFilter: (_req, file, cb) => {
        if (kind === "cover" || kind === "detail") {
          if (IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
          return cb(new Error("Only JPEG, PNG, GIF, or WebP images are allowed"));
        }
        if (kind === "demo") {
          if (VIDEO_TYPES.has(file.mimetype)) return cb(null, true);
          return cb(new Error("Only MP4 or WebM video is allowed for demo upload"));
        }
        return cb(new Error("Invalid kind"));
      },
    }).single("file");

    upload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: kind === "demo" ? "video file too large (max 80MB)" : "image file too large (max 10MB)" });
        }
        return res.status(400).json({ message: err.message || "upload failed" });
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "file is required (multipart field: file)" });
    }
    const base = publicBaseUrl();
    const url = `${base}/uploads/material-media/${req.file.filename}`;
    res.status(201).json({ url, filename: req.file.filename });
  }
);

module.exports = router;
