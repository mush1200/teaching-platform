/**
 * 買家授權狀態的管理能力（P1-09 Gate 14）。
 *
 * ## 核心不變條件：與 `orders.status` 正交
 *
 * 暫停或撤銷「單一買家對單一教材」的存取，**一律走 `order_items.entitlement_status`**。
 * **不得**取消訂單、不得改動已核准訂單的狀態、不得動 `paid_at`、
 * 不得改寫付款核准歷史 —— 那會污染訂單狀態機、對帳與稽核軌跡。
 *
 * 正確的結果是：**訂單仍是 `approved`，但存取被拒絕。**
 *
 * ## 狀態
 *
 * 沿用 Wave 1 #1 建立的四個值（本輪**不擴充** state machine）：
 *
 *   active           目前可取得平台交付／存取
 *   suspended        暫停未來交付，可恢復（爭議處理中等）
 *   revoked_pending  因退款／解除／法律流程停止存取，仍可能恢復或需稽核
 *   revoked_final    流程已完結，平台確定不再恢復 —— **終態**
 *
 * `revoked_final` 是終態：那正是「final」的意思。若日後需要恢復，
 * 那是一個新的產品／法律決定，不應該由狀態機默默允許。
 *
 * ## 這裡只有管理能力，沒有法律判斷
 *
 * **本模組不決定「什麼時候應該撤銷」。** 法定解除是否成立、退款是否核准、
 * 何時進入 `revoked_final`，都屬 Gate 14 尚未完成的部分與 External Legal Gate。
 * 這裡提供的是**受控且留下軌跡的狀態變更能力**。
 *
 * ## suspend / revoke ≠ 刪除
 *
 * 狀態變更**不刪除**任何東西：
 *   - `order_items` 那一列仍在（稽核與爭議舉證需要）
 *   - `fulfilled_material_version_id` 不動（履約事實）
 *   - `material_files` 不動（`ON DELETE RESTRICT` 另有保護）
 */

const db = require("../config/db");

const STATUSES = Object.freeze(["active", "suspended", "revoked_pending", "revoked_final"]);

/** 合法轉移。`revoked_final` 沒有出口 —— 終態。 */
const TRANSITIONS = Object.freeze({
  active: ["suspended", "revoked_pending"],
  suspended: ["active", "revoked_pending"],
  revoked_pending: ["active", "revoked_final"],
  revoked_final: [],
});

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

/** 目前狀態與相關稽核欄位。找不到品項時回 `null`。 */
async function getEntitlement(orderItemId) {
  const { rows } = await db.query(
    `SELECT oi.id, oi.order_id, oi.material_id, oi.entitlement_status,
            oi.access_suspended_at, oi.access_suspended_by, oi.access_suspension_reason,
            oi.access_restored_at, oi.access_restored_by,
            oi.fulfilled_material_version_id, oi.fulfilled_at,
            o.user_id AS buyer_id, o.status AS order_status
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = $1`,
    [String(orderItemId)]
  );
  return rows[0] ?? null;
}

/**
 * 變更授權狀態。
 *
 * `reason` 為必填 —— 這是一個會影響買家已付費權利的動作，
 * 沒有理由的變更在爭議中無法解釋。
 */
async function changeStatus({ orderItemId, toStatus, reason, actorId, actorRole } = {}) {
  if (!orderItemId) return fail("order_item_required", "orderItemId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  if (!STATUSES.includes(toStatus)) {
    return fail("invalid_status", `toStatus must be one of: ${STATUSES.join(", ")}`);
  }
  const cleanReason = reason != null && String(reason).trim() !== "" ? String(reason).trim() : null;
  if (!cleanReason) {
    return fail("reason_required", "reason is required — an unexplained entitlement change cannot be defended in a dispute");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id, entitlement_status FROM order_items WHERE id = $1 FOR UPDATE`,
      [String(orderItemId)]
    );
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("order_item_not_found", "order item not found");
    }

    const from = found.rows[0].entitlement_status;
    if (from === toStatus) {
      await client.query("ROLLBACK");
      return fail("already_in_state", `entitlement is already ${toStatus}`, { from });
    }
    if (!TRANSITIONS[from].includes(toStatus)) {
      await client.query("ROLLBACK");
      return fail(
        "invalid_transition",
        `cannot move entitlement from ${from} to ${toStatus}` +
          (from === "revoked_final" ? " — revoked_final is terminal" : ""),
        { from, allowed: TRANSITIONS[from] }
      );
    }

    // 恢復為 active 時**保留** `access_suspended_*` —— 那是稽核軌跡，
    // 不因恢復而抹去「這個授權曾經被停過、原因是什麼」。
    const updated =
      toStatus === "active"
        ? await client.query(
            `UPDATE order_items
                SET entitlement_status = 'active',
                    access_restored_at = NOW(),
                    access_restored_by = $2
              WHERE id = $1
              RETURNING *`,
            [String(orderItemId), String(actorId)]
          )
        : await client.query(
            `UPDATE order_items
                SET entitlement_status = $3,
                    access_suspended_at = NOW(),
                    access_suspended_by = $2,
                    access_suspension_reason = $4
              WHERE id = $1
              RETURNING *`,
            [String(orderItemId), String(actorId), toStatus, cleanReason]
          );

    await client.query("COMMIT");

    // 狀態變更歷程走 repo 既有的稽核軌跡（`activity_logs`），
    // 不另建 event table —— `order_items` 上的欄位是**目前狀態**，歷程在這裡。
    const { writeActivityLog } = require("../utils/activityLog");
    await writeActivityLog({
      actorId,
      actorRole: actorRole ?? null,
      targetType: "order_item",
      targetId: String(orderItemId),
      action: "entitlement.status_changed",
      meta: { from, to: toStatus, reason: cleanReason },
    });

    return { ok: true, from, to: toStatus, orderItem: updated.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** 狀態變更歷程（新到舊），來自 `activity_logs`。 */
async function listStatusHistory(orderItemId) {
  const { rows } = await db.query(
    `SELECT actor_id, actor_role, action, meta, created_at
       FROM activity_logs
      WHERE target_type = 'order_item' AND target_id = $1
        AND action = 'entitlement.status_changed'
      ORDER BY created_at DESC, id DESC`,
    [String(orderItemId)]
  );
  return rows;
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  getEntitlement,
  changeStatus,
  listStatusHistory,
};
