const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { parsePagination, optionalString } = require("../utils/adminQuery");
const activityLogsService = require("../services/adminActivityLogs.service");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

/**
 * 活動紀錄。查詢邏輯全部在 `services/adminActivityLogs.service.js`；
 * 這裡只負責參數解析與 HTTP 形狀。
 *
 * scoped 路由（`/users/:id/...`、`/materials/:id/...`、`/orders/:id/...`）
 * 與主清單共用同一個 service —— 兩邊各寫一次 SQL，就會出現「主清單有 actor email、
 * scoped 頁面沒有」這種分歧。
 */

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
 * GET /admin/activity-logs
 *
 * Query：
 *   `q`            —— 人類可讀搜尋（操作者 email / 教材標題 / 訂單編號 / 對象 email / action）
 *   `from` / `to`  —— YYYY-MM-DD，含當日
 *   `actor_id` / `actor_role` / `action` / `target_type` / `target_id` —— 精確比對（既有契約）
 *   `page` / `limit`
 */
router.get("/activity-logs", async (req, res) => {
  try {
    const q = req.query || {};
    const filters = {
      actor_id: optionalString(q, "actor_id"),
      actor_role: optionalString(q, "actor_role"),
      action: optionalString(q, "action"),
      target_type: optionalString(q, "target_type"),
      target_id: optionalString(q, "target_id"),
      q: optionalString(q, "q"),
      from: activityLogsService.parseIsoDate(q.from),
      to: activityLogsService.parseIsoDate(q.to),
    };
    const body = await activityLogsService.listLogs(filters, parsePagination(q));
    return res.json(body);
  } catch (err) {
    console.error("admin list activity logs failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /admin/activity-logs/filters — 篩選下拉的選項來源。
 *
 * 回傳**實際出現過**的 action 與 actor_role（含各自筆數），不是硬編清單。
 * 硬編的下拉會在新增 action 之後靜靜地漏掉它，而 Admin 不會知道。
 */
router.get("/activity-logs/filters", async (_req, res) => {
  try {
    const [actions, actorRoles] = await Promise.all([
      activityLogsService.listDistinctActions(),
      activityLogsService.listDistinctActorRoles(),
    ]);
    return res.json({ actions, actorRoles });
  } catch (err) {
    console.error("admin list activity log filters failed:", err);
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

/** scoped 清單共用：固定一個 filter，其餘 query（q / 日期 / 分頁）照常生效。 */
function scopedListHandler(buildFilters) {
  return async (req, res) => {
    try {
      const q = req.query || {};
      const filters = {
        actor_id: null,
        actor_role: null,
        action: null,
        target_type: null,
        target_id: null,
        q: optionalString(q, "q"),
        from: activityLogsService.parseIsoDate(q.from),
        to: activityLogsService.parseIsoDate(q.to),
        ...buildFilters(req),
      };
      const body = await activityLogsService.listLogs(filters, parsePagination(q));
      return res.json(body);
    } catch (err) {
      console.error("admin list scoped activity logs failed:", err);
      return res.status(500).json({ message: "server error" });
    }
  };
}

/** GET /admin/users/:userId/activity-logs — actor_id = userId */
router.get(
  "/users/:userId/activity-logs",
  scopedListHandler((req) => ({ actor_id: String(req.params.userId || "").trim() || null }))
);

/** GET /admin/materials/:materialId/activity-logs — material target rows */
router.get(
  "/materials/:materialId/activity-logs",
  scopedListHandler((req) => ({
    target_type: "material",
    target_id: String(req.params.materialId || "").trim() || null,
  }))
);

/** GET /admin/orders/:orderId/activity-logs — order target rows */
router.get(
  "/orders/:orderId/activity-logs",
  scopedListHandler((req) => ({
    target_type: "order",
    target_id: String(req.params.orderId || "").trim() || null,
  }))
);

module.exports = router;
