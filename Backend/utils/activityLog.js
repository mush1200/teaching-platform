/**
 * 稽核軌跡的唯一寫入點。
 *
 * ## `id` 是 identity，不是 time
 *
 * `activity_logs.id` 是 `TEXT DEFAULT gen_random_uuid()::text` —— **UUID，不單調遞增**。
 * 因此**任何地方都不得用 `id` 表示事件先後**：
 *
 *   * ❌ `ORDER BY id`
 *   * ❌ `MAX(id)` 當「最新事件」
 *   * ❌ `WHERE id > $lastId` 當 pagination cursor
 *   * ✅ `ORDER BY created_at DESC, id DESC`（`id` 只是 deterministic tie-breaker）
 *
 * 這一點在 2026-08-26 之前是隱性的：canonical 文件宣告 `id BIGSERIAL`，
 * 而實際資料庫是 UUID（`SCHEMA-01`）。文件已對齊實況。
 *
 * ### 同一 `created_at` 的先後
 *
 * `CURRENT_TIMESTAMP` 是**交易開始時間**，因此同一個 transaction 內寫入的多筆
 * 稽核事件會拿到**完全相同**的 `created_at`。本函式使用 pool（每次各自成交易），
 * 既有 5599 列中同秒重複為 **0** 組，所以目前不會發生。
 *
 * 若日後需要在單一 transaction 內寫多筆並保證先後，**不要**改用 `id` 排序（UUID 無序），
 * 而應加入明確的序號欄位或改用 `clock_timestamp()`。在真的有這個需求之前不預先設計。
 *
 * ## `targetId` 為必填
 *
 * 資料庫的 `target_id` 是 `NOT NULL`（既有 5599 列無一例外）。
 * 舊版這裡有一條 `targetId ? String(targetId) : null` 的路徑 ——
 * 那條路在真實資料庫會直接違反約束，只是從來沒有呼叫端走到而已。
 * 現在明確拒絕，錯誤訊息指得出問題，而不是拋出 PG 的約束違反。
 */

const db = require("../config/db");

async function writeActivityLog({
  actorId = null,
  actorRole = null,
  targetType,
  targetId,
  action,
  meta = {},
}) {
  if (targetId == null || String(targetId).trim() === "") {
    throw new Error(
      `writeActivityLog: targetId is required (targetType=${targetType}, action=${action})`
    );
  }
  await db.query(
    `INSERT INTO activity_logs(actor_id, actor_role, target_type, target_id, action, meta)
     VALUES($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorId, actorRole, targetType, String(targetId), action, JSON.stringify(meta || {})]
  );
}

module.exports = {
  writeActivityLog,
};
