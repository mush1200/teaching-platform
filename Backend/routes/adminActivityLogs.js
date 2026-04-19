const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

function parsePagination(query) {
  let page = Number.parseInt(String(query.page ?? "1"), 10);
  let limit = Number.parseInt(String(query.limit ?? "20"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function optionalString(q, key) {
  const v = q[key];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function serializeRow(row) {
  const created =
    row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: String(row.id),
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    created_at: created,
  };
}

/**
 * @param {object} filters - actor_id, actor_role, action, target_type, target_id (each optional string or null)
 */
async function selectLogs(filters, pagination) {
  const { page, limit, offset } = pagination;
  const conditions = [];
  const params = [];
  let i = 1;

  const addEq = (col, val) => {
    if (val != null && val !== "") {
      conditions.push(`${col} = $${i}`);
      params.push(val);
      i += 1;
    }
  };

  addEq("actor_id", filters.actor_id);
  addEq("actor_role", filters.actor_role);
  addEq("action", filters.action);
  addEq("target_type", filters.target_type);
  addEq("target_id", filters.target_id);

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::bigint AS c FROM activity_logs ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0].c);

  const listParams = [...params, limit, offset];
  const limitIdx = i;
  const offsetIdx = i + 1;
  const result = await db.query(
    `SELECT id, actor_id, actor_role, action, target_type, target_id, meta, created_at
     FROM activity_logs
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  return {
    items: result.rows.map(serializeRow),
    pagination: { page, limit, total },
  };
}

/** GET /admin/activity-logs */
router.get("/activity-logs", async (req, res) => {
  try {
    const q = req.query || {};
    const filters = {
      actor_id: optionalString(q, "actor_id"),
      actor_role: optionalString(q, "actor_role"),
      action: optionalString(q, "action"),
      target_type: optionalString(q, "target_type"),
      target_id: optionalString(q, "target_id"),
    };
    const pagination = parsePagination(q);
    const body = await selectLogs(filters, pagination);
    return res.json(body);
  } catch (err) {
    console.error("admin list activity logs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/activity-logs/:id — matches list item `id`（BIGSERIAL、UUID、TEXT PK 皆以字串對齊） */
router.get("/activity-logs/:id", async (req, res) => {
  try {
    const raw = String(req.params.id || "").trim();
    if (!raw) {
      return res.status(404).json({ message: "activity log not found" });
    }
    // 勿僅允許數字：部分環境 activity_logs.id 為 UUID / TEXT；統一用 id::text 比對
    const result = await db.query(
      `SELECT id, actor_id, actor_role, action, target_type, target_id, meta, created_at
       FROM activity_logs WHERE id::text = $1`,
      [raw]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "activity log not found" });
    }
    return res.json(serializeRow(result.rows[0]));
  } catch (err) {
    console.error("admin get activity log failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/users/:userId/activity-logs — actor_id = userId */
router.get("/users/:userId/activity-logs", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const filters = {
      actor_id: userId || null,
      actor_role: null,
      action: null,
      target_type: null,
      target_id: null,
    };
    const pagination = parsePagination(req.query || {});
    const body = await selectLogs(filters, pagination);
    return res.json(body);
  } catch (err) {
    console.error("admin list user activity logs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/materials/:materialId/activity-logs — material target rows */
router.get("/materials/:materialId/activity-logs", async (req, res) => {
  try {
    const materialId = String(req.params.materialId || "").trim();
    const filters = {
      actor_id: null,
      actor_role: null,
      action: null,
      target_type: "material",
      target_id: materialId || null,
    };
    const pagination = parsePagination(req.query || {});
    const body = await selectLogs(filters, pagination);
    return res.json(body);
  } catch (err) {
    console.error("admin list material activity logs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** GET /admin/orders/:orderId/activity-logs — order target rows */
router.get("/orders/:orderId/activity-logs", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const filters = {
      actor_id: null,
      actor_role: null,
      action: null,
      target_type: "order",
      target_id: orderId || null,
    };
    const pagination = parsePagination(req.query || {});
    const body = await selectLogs(filters, pagination);
    return res.json(body);
  } catch (err) {
    console.error("admin list order activity logs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
