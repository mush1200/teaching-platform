/**
 * 教材檔案的保存安全判斷（P1-09 Wave 2 #4 / Gate 14）。
 *
 * ## 這個模組回答的唯一問題
 *
 * **「這個檔案現在可以被實體刪除嗎？」**
 *
 * 它**不決定**保存年限。4 個月、5 年、稅務年限都屬 `RETENTION-MATRIX` 與
 * External Legal / Tax Gate，兩者皆 `PENDING`。這裡只建立
 * 「**何時一定不能刪**」的 safety predicate —— 那個下限不需要等法律定案就成立。
 *
 * ## Fail-closed
 *
 * 只有在**全部必要條件都被明確確認安全**時才回 `deletable: true`。
 * 任何 unknown / error / 查不到 / 狀態不明 → `false`。
 *
 * 特別是：**查詢失敗不得被當成「沒有 dependency」**。
 * 舊的 `cleanupOrphans()` 正是這個形狀 —— per-row `try/catch` 把 DB 錯誤
 * 吞成「這筆失敗」，而實體檔案在那之前**已經刪掉了**。
 *
 * ## 為什麼所有 cleanup 都必須走這裡
 *
 * 讓多支維運腳本各自判斷資格，等於讓「可以刪嗎」有多個互相不同步的答案。
 * 新增任何刪除路徑時**必須**呼叫 `canPhysicallyDeleteMaterialFile()`，
 * 不得自行拼 SQL 條件。
 *
 * ## `revoked_final` 不等於可以刪
 *
 * 授權終止與位元組保存是**兩個不同的 lifecycle**。
 * `revoked_final` 只表示「這個買家不再能下載」，不表示
 * 「平台不再需要保存當初交付的東西」—— 爭議、檢舉、稅務、舉證都可能仍需要它。
 * 因此 `revoked_final` 只移除「授權依賴」這一個 blocker，
 * 履約快照、legal hold、指標引用等其他 blocker 一概照舊。
 */

const db = require("../config/db");
const { writeActivityLog } = require("../utils/activityLog");

/**
 * 仍可能恢復的授權狀態 —— 全部視為 dependency。
 *
 * `revoked_pending` 之所以在內：它的存在意義就是「還沒定案」
 * （見 `services/entitlement.service.js` 的轉移表，它可以回到 `active`）。
 * 在未定案時刪掉檔案，等於替尚未做出的決定執行了不可逆的處分。
 */
const RESTORABLE_ENTITLEMENT_STATUSES = Object.freeze(["active", "suspended", "revoked_pending"]);

/**
 * 目前唯一被視為「可能可回收」的檔案狀態。
 *
 * `unattached` = 上傳後沒被任何教材認領，因此**從未交付給任何人**，
 * 也不可能附著任何交易義務。
 *
 * `superseded` / `revoked` 的回收**刻意不在本輪開放** ——
 * 它們曾經是某份教材的實體，回收與否取決於尚未定案的保存年限。
 * 文件（`docs/material-file-storage-and-delivery.md` §8.5）已載明
 * 「只要曾經有 approved 訂單含這份教材，永不實體刪除」，
 * 但那條政策在本輪之前**沒有任何程式碼在執行**。
 */
const RECLAIMABLE_STATUSES = Object.freeze(["unattached"]);

/** 阻擋刪除的理由代碼（穩定值，供稽核與測試斷言）。 */
const BLOCK_REASONS = Object.freeze({
  NOT_FOUND: "file_not_found",
  LOOKUP_FAILED: "dependency_lookup_failed",
  LEGAL_HOLD: "legal_hold",
  STATUS_NOT_RECLAIMABLE: "status_not_reclaimable",
  LIVE_POINTER: "referenced_by_material_pointer",
  ENTITLEMENT: "restorable_entitlement_dependency",
  FULFILLMENT_SNAPSHOT: "fulfillment_snapshot_dependency",
  DOWNLOAD_TOKEN: "outstanding_download_token",
});

/**
 * 判斷某個教材檔案是否可以被**實體刪除**。
 *
 * @param {string} fileId
 * @param {{client?: import("pg").PoolClient, lock?: boolean}} [opts]
 *   `client` 讓呼叫端在自己的 transaction 內重驗；`lock` 會對該列 `FOR UPDATE`。
 * @returns {Promise<{deletable: boolean, reasons: string[], checks: object, file: object|null}>}
 */
async function canPhysicallyDeleteMaterialFile(fileId, { client = null, lock = false } = {}) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const reasons = [];
  const checks = {};

  if (!fileId) {
    return { deletable: false, reasons: [BLOCK_REASONS.NOT_FOUND], checks, file: null };
  }

  let file = null;
  try {
    const { rows } = await q(
      `SELECT id, material_id, status, storage_key, legal_hold, hold_reason, uploaded_at
         FROM material_files WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [String(fileId)]
    );
    file = rows[0] ?? null;
  } catch (err) {
    // **查不到 ≠ 沒有依賴。** 查詢壞掉時我們對這個檔案一無所知。
    return {
      deletable: false,
      reasons: [BLOCK_REASONS.LOOKUP_FAILED],
      checks: { error: err.message },
      file: null,
    };
  }

  if (!file) {
    return { deletable: false, reasons: [BLOCK_REASONS.NOT_FOUND], checks, file: null };
  }

  if (file.legal_hold === true) reasons.push(BLOCK_REASONS.LEGAL_HOLD);
  checks.legalHold = file.legal_hold === true;

  if (!RECLAIMABLE_STATUSES.includes(file.status)) reasons.push(BLOCK_REASONS.STATUS_NOT_RECLAIMABLE);
  checks.status = file.status;

  // 以下每一個依賴查詢**各自** fail-closed：任何一個壞掉就整體不可刪。
  try {
    const pointer = await q(
      `SELECT 1 FROM materials WHERE approved_file_id = $1 OR pending_file_id = $1 LIMIT 1`,
      [String(fileId)]
    );
    checks.livePointer = pointer.rows.length > 0;
    if (checks.livePointer) reasons.push(BLOCK_REASONS.LIVE_POINTER);
  } catch (err) {
    checks.livePointerError = err.message;
    reasons.push(BLOCK_REASONS.LOOKUP_FAILED);
  }

  // 履約快照：**與授權狀態無關**。只要有任何品項記錄「當初交付的是這個版本」，
  // 那份位元組就是該筆交易的憑據 —— 包含 `revoked_final` 的品項。
  try {
    const fulfilled = await q(
      `SELECT COUNT(*)::int AS n FROM order_items WHERE fulfilled_material_version_id = $1`,
      [String(fileId)]
    );
    checks.fulfillmentReferences = fulfilled.rows[0].n;
    if (checks.fulfillmentReferences > 0) reasons.push(BLOCK_REASONS.FULFILLMENT_SNAPSHOT);
  } catch (err) {
    checks.fulfillmentError = err.message;
    reasons.push(BLOCK_REASONS.LOOKUP_FAILED);
  }

  // 授權依賴綁在**教材**而不是版本（買家買的是教材，見
  // `docs/material-file-storage-and-delivery.md` §7.1）。因此只要這份教材
  // 還有任何仍可能恢復的授權，它的檔案就不得回收。
  if (file.material_id) {
    try {
      const ent = await q(
        `SELECT COUNT(*)::int AS n
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.material_id = $1
            AND o.status = 'approved'
            AND oi.entitlement_status = ANY($2::text[])`,
        [String(file.material_id), RESTORABLE_ENTITLEMENT_STATUSES]
      );
      checks.restorableEntitlements = ent.rows[0].n;
      if (checks.restorableEntitlements > 0) reasons.push(BLOCK_REASONS.ENTITLEMENT);
    } catch (err) {
      checks.entitlementError = err.message;
      reasons.push(BLOCK_REASONS.LOOKUP_FAILED);
    }
  } else {
    checks.restorableEntitlements = 0;
  }

  // 已發出但尚未使用、也還沒過期的下載票 —— 刪掉會讓買家拿到 503。
  try {
    const tokens = await q(
      `SELECT COUNT(*)::int AS n FROM material_download_tokens
        WHERE file_id = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [String(fileId)]
    );
    checks.outstandingTokens = tokens.rows[0].n;
    if (checks.outstandingTokens > 0) reasons.push(BLOCK_REASONS.DOWNLOAD_TOKEN);
  } catch (err) {
    checks.tokenError = err.message;
    reasons.push(BLOCK_REASONS.LOOKUP_FAILED);
  }

  const unique = [...new Set(reasons)];
  return { deletable: unique.length === 0, reasons: unique, checks, file };
}

// ---------------------------------------------------------------------------
// Legal hold primitive
// ---------------------------------------------------------------------------
//
// **只提供 set / release / read。** 不做 orchestration ——
// 本輪不假設每一筆 `refund_remedy_cases` 或 `report_cases` 都需要 hold，
// 那是尚未做出的產品與法律判斷。這裡只讓那些流程「未來能夠」設定它。

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

/**
 * 對某個教材檔案設定 legal hold。
 *
 * `reason` 必填 —— 一個沒有理由的保存指令無法被稽核，也無法判斷何時可解除。
 */
async function setLegalHold({ fileId, reason, actorId, actorRole = null } = {}) {
  if (!fileId) return fail("file_required", "fileId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  const clean = reason != null && String(reason).trim() !== "" ? String(reason).trim() : null;
  if (!clean) return fail("reason_required", "reason is required — a hold must be explainable");

  const { rows } = await db.query(
    `UPDATE material_files
        SET legal_hold = TRUE,
            hold_reason = $2,
            hold_set_at = NOW(),
            hold_set_by = $3,
            -- 重新設定 hold 時清掉上一次的解除紀錄（那次已經寫進 activity_logs）。
            hold_released_at = NULL,
            hold_released_by = NULL,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, material_id, status, legal_hold, hold_reason, hold_set_at, hold_set_by,
                hold_released_at, hold_released_by`,
    [String(fileId), clean, String(actorId)]
  );
  if (rows.length === 0) return fail("file_not_found", "material file not found");

  await writeActivityLog({
    actorId,
    actorRole,
    targetType: "material_file",
    targetId: String(fileId),
    action: "material_file.legal_hold_set",
    meta: { reason: clean, materialId: rows[0].material_id ?? null },
  });

  return { ok: true, file: rows[0] };
}

/**
 * 解除 legal hold。
 *
 * **`hold_reason` / `hold_set_at` / `hold_set_by` 不清空** ——
 * 那是稽核軌跡（與 `users` 解凍保留凍結紀錄的規則一致）。
 */
async function releaseLegalHold({ fileId, reason, actorId, actorRole = null } = {}) {
  if (!fileId) return fail("file_required", "fileId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  const clean = reason != null && String(reason).trim() !== "" ? String(reason).trim() : null;
  if (!clean) return fail("reason_required", "reason is required — a release must be explainable");

  const existing = await db.query(`SELECT id, legal_hold FROM material_files WHERE id = $1`, [
    String(fileId),
  ]);
  if (existing.rows.length === 0) return fail("file_not_found", "material file not found");
  if (existing.rows[0].legal_hold !== true) return fail("not_on_hold", "file is not under legal hold");

  const { rows } = await db.query(
    `UPDATE material_files
        SET legal_hold = FALSE,
            hold_released_at = NOW(),
            hold_released_by = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, material_id, status, legal_hold, hold_reason, hold_set_at, hold_set_by,
                hold_released_at, hold_released_by`,
    [String(fileId), String(actorId)]
  );

  await writeActivityLog({
    actorId,
    actorRole,
    targetType: "material_file",
    targetId: String(fileId),
    action: "material_file.legal_hold_released",
    meta: { reason: clean },
  });

  return { ok: true, file: rows[0] };
}

async function getLegalHold(fileId) {
  const { rows } = await db.query(
    `SELECT id, material_id, status, legal_hold, hold_reason, hold_set_at, hold_set_by,
            hold_released_at, hold_released_by
       FROM material_files WHERE id = $1`,
    [String(fileId)]
  );
  return rows[0] ?? null;
}

/** hold 的設定／解除歷程，來自既有的 `activity_logs`。 */
async function listHoldHistory(fileId) {
  const { rows } = await db.query(
    `SELECT actor_id, actor_role, action, meta, created_at
       FROM activity_logs
      WHERE target_type = 'material_file' AND target_id = $1
      ORDER BY created_at DESC, id DESC`,
    [String(fileId)]
  );
  return rows;
}

module.exports = {
  RESTORABLE_ENTITLEMENT_STATUSES,
  RECLAIMABLE_STATUSES,
  BLOCK_REASONS,
  canPhysicallyDeleteMaterialFile,
  setLegalHold,
  releaseLegalHold,
  getLegalHold,
  listHoldHistory,
};
