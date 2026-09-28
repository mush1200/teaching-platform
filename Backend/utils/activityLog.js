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
 * ## 選用的 `client` —— 金額操作的稽核原子性（`PRE-18` §W）
 *
 * 本函式原本一律走 pool，因此**無法加入呼叫端的 transaction**：金額寫入 commit 了、
 * 稽核卻可能沒寫成，或反過來。金額操作的權威記錄是 ledger／狀態表本身
 * （與 `DEC-35` §Q13「log 不是決定狀態」一致），但**軌跡與金額分裂**仍然是
 * 稽核上的缺口。
 *
 * 傳入 `client`（一個已 `BEGIN` 的 pg client）即讓稽核與金額**同生同死**。
 * **非交易型呼叫端維持原行為** —— 不傳 `client` 就跟以前完全一樣，
 * 這是為了不把既有 30 餘個呼叫點一次改動。
 *
 * ⚠️ 傳入 `client` 時，同一 transaction 內的多筆事件會拿到**相同的 `created_at`**
 * （`CURRENT_TIMESTAMP` 是交易開始時間）。排序仍為 `created_at DESC, id DESC`，
 * `id` 只是 deterministic tie-breaker，**不表示先後**。
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
  client = null,
}) {
  if (targetId == null || String(targetId).trim() === "") {
    throw new Error(
      `writeActivityLog: targetId is required (targetType=${targetType}, action=${action})`
    );
  }
  // `client` 給定時走呼叫端的 transaction，未給定時走 pool（各自成交易）。
  // 兩條路徑的 SQL 完全相同 —— 這仍然是唯一的寫入點。
  const executor = client || db;
  await executor.query(
    `INSERT INTO activity_logs(actor_id, actor_role, target_type, target_id, action, meta)
     VALUES($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorId, actorRole, targetType, String(targetId), action, JSON.stringify(meta || {})]
  );
}

module.exports = {
  writeActivityLog,
};
