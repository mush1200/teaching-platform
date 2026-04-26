const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = express.Router();

function toPositiveInt(value, fallback) {
  const num = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function parseDateStart(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseDateEnd(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function buildOrderStatusCondition(status, params, allowAll = false) {
  if (status && status !== "all") {
    params.push(status);
    return ` AND o.status = $${params.length} `;
  }
  if (allowAll) return "";
  return ` AND o.status IN ('approved', 'completed') `;
}

function buildDateRangeCondition(fromIso, toIso, params) {
  let sql = "";
  if (fromIso) {
    params.push(fromIso);
    sql += ` AND o.created_at >= $${params.length} `;
  }
  if (toIso) {
    params.push(toIso);
    sql += ` AND o.created_at <= $${params.length} `;
  }
  return sql;
}

router.get("/summary", requireAuth, requireRole("teacher"), async (req, res) => {
  const teacherId = req.user.userId;
  const fromIso = parseDateStart(req.query.from);
  const toIso = parseDateEnd(req.query.to);
  const status = req.query.status ? String(req.query.status) : null;

  try {
    const params = [teacherId];
    const statusSql = buildOrderStatusCondition(status, params);
    const dateSql = buildDateRangeCondition(fromIso, toIso, params);

    const summaryResult = await db.query(
      `SELECT
         COALESCE(SUM(oi.quantity), 0)::int AS total_sold_units,
         COALESCE(SUM(oi.subtotal), 0)::int AS total_revenue,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COUNT(DISTINCT oi.material_id)::int AS materials_count
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = $1
       ${statusSql}
       ${dateSql}`,
      params
    );

    const trendParams = [teacherId];
    const trendStatusSql = buildOrderStatusCondition(status, trendParams);
    const trendDateSql = buildDateRangeCondition(fromIso, toIso, trendParams);
    const trendResult = await db.query(
      `SELECT DATE(o.created_at) AS day,
              COALESCE(SUM(oi.quantity), 0)::int AS sold_units,
              COALESCE(SUM(oi.subtotal), 0)::int AS revenue
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = $1
       ${trendStatusSql}
       ${trendDateSql}
       GROUP BY DATE(o.created_at)
       ORDER BY DATE(o.created_at) ASC`,
      trendParams
    );

    const summary = summaryResult.rows[0] || {
      total_sold_units: 0,
      total_revenue: 0,
      total_orders: 0,
      materials_count: 0,
    };
    return res.json({
      totalSoldUnits: Number(summary.total_sold_units || 0),
      totalRevenue: Number(summary.total_revenue || 0),
      totalOrders: Number(summary.total_orders || 0),
      materialsCount: Number(summary.materials_count || 0),
      trend: trendResult.rows.map((row) => ({
        day: row.day,
        soldUnits: Number(row.sold_units || 0),
        revenue: Number(row.revenue || 0),
      })),
    });
  } catch (err) {
    console.error("teacher sales summary failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/materials", requireAuth, requireRole("teacher"), async (req, res) => {
  const teacherId = req.user.userId;
  const fromIso = parseDateStart(req.query.from);
  const toIso = parseDateEnd(req.query.to);
  const status = req.query.status ? String(req.query.status) : null;
  const search = req.query.search ? String(req.query.search).trim() : "";
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(100, toPositiveInt(req.query.limit, 20));
  const offset = (page - 1) * limit;

  try {
    const baseParams = [teacherId];
    let whereSql = ` WHERE oi.seller_id = $1 `;
    whereSql += buildOrderStatusCondition(status, baseParams);
    whereSql += buildDateRangeCondition(fromIso, toIso, baseParams);

    if (search) {
      baseParams.push(`%${search}%`);
      whereSql += ` AND (m.title ILIKE $${baseParams.length} OR oi.material_id ILIKE $${baseParams.length}) `;
    }

    const countQuery = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM (
         SELECT oi.material_id
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         INNER JOIN materials m ON m.id = oi.material_id
         ${whereSql}
         GROUP BY oi.material_id
       ) s`,
      baseParams
    );
    const total = Number(countQuery.rows[0]?.total || 0);

    const listParams = [...baseParams, limit, offset];
    const rows = await db.query(
      `SELECT
         oi.material_id AS "materialId",
         m.title AS title,
         COALESCE(SUM(oi.quantity), 0)::int AS "soldUnits",
         COALESCE(SUM(oi.subtotal), 0)::int AS revenue,
         MAX(o.created_at) AS "lastSoldAt"
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN materials m ON m.id = oi.material_id
       ${whereSql}
       GROUP BY oi.material_id, m.title
       ORDER BY COALESCE(SUM(oi.subtotal), 0) DESC, MAX(o.created_at) DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    return res.json({
      items: rows.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("teacher sales by materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/records", requireAuth, requireRole("teacher"), async (req, res) => {
  const teacherId = req.user.userId;
  const fromIso = parseDateStart(req.query.from);
  const toIso = parseDateEnd(req.query.to);
  const status = req.query.status ? String(req.query.status) : null;
  const materialId = req.query.materialId ? String(req.query.materialId).trim() : "";
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(100, toPositiveInt(req.query.limit, 20));
  const offset = (page - 1) * limit;

  try {
    const params = [teacherId];
    let whereSql = ` WHERE oi.seller_id = $1 `;
    whereSql += buildOrderStatusCondition(status, params, true);
    whereSql += buildDateRangeCondition(fromIso, toIso, params);

    if (!status || status === "all") {
      whereSql += ` AND o.status IN ('approved', 'completed') `;
    }

    if (materialId) {
      params.push(materialId);
      whereSql += ` AND oi.material_id = $${params.length} `;
    }

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN materials m ON m.id = oi.material_id
       ${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total || 0);

    const listParams = [...params, limit, offset];
    const result = await db.query(
      `SELECT
         o.id AS "orderId",
         oi.id AS "orderItemId",
         oi.material_id AS "materialId",
         m.title AS "materialTitle",
         oi.quantity AS quantity,
         COALESCE(oi.subtotal, 0)::int AS subtotal,
         COALESCE(oi.price_snapshot, 0)::int AS "unitPrice",
         o.user_id AS "buyerId",
         o.status AS "orderStatus",
         o.created_at AS "createdAt",
         o.paid_at AS "paidAt"
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN materials m ON m.id = oi.material_id
       ${whereSql}
       ORDER BY o.created_at DESC, oi.id DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    return res.json({
      items: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("teacher sales records failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
