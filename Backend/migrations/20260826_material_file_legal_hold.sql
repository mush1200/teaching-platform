-- 教材檔案的 legal hold（P1-09 Wave 2 #4 / Gate 14）。
--
-- 目的**不是**建立法務案件管理系統，而是把既有的實體刪除路徑
-- （`services/materialFile.service.js` 的 `cleanupOrphans()`）變成**可安全驗收**的東西。
--
-- 現況的問題（本 migration 之前）：
--   1. 刪除資格只問 `status = 'unattached' AND uploaded_at < NOW() - Nh`，
--      **完全不檢查 entitlement、履約快照或任何保存義務**。
--   2. `storage.delete()` 在 `DELETE FROM material_files` **之前**執行 ——
--      因此 `order_items.fulfilled_material_version_id` 的 `ON DELETE RESTRICT`
--      只保護得了 DB 列，**保護不了實體檔案**：列刪不掉時，位元組已經沒了。
--   3. 任何錯誤都被 per-row `catch` 吞掉當成「這筆失敗」，而不是「停下來」。
--
-- 為什麼掛在 `material_files` 而不是獨立 hold 表：
--   repo 既有 pattern 就是「current snapshot 欄位 ＋ `activity_logs` 歷程」
--   （`users.account_status` 凍結、`materials.review_*` 審核快照）。
--   hold 的問題只有「這個檔案現在能不能刪」，是單一當前狀態；
--   歷程由 `activity_logs`（`target_type = 'material_file'`）保存。
--   獨立 hold 表要到「一個案件涵蓋多個標的、需要案件層級生命週期」才划算 ——
--   那屬於被明確排除的完整法務系統。
--
-- **刻意不加 `retention_until`：** 保存年限尚無 authoritative source
-- （待 `RETENTION-MATRIX` ／ External Legal / Tax Gate）。加了只有兩種下場：
-- 全部填 NULL 而在 fail-closed 下擋住所有清理（連從未交付的孤兒上傳都清不掉），
-- 或把 NULL 解讀為「無保存義務」—— 那正是用預設值假裝知道答案。
-- 本輪只建立「**何時一定不能刪**」的 safety predicate，不決定任何年限。

DO $$ BEGIN
  IF current_database() <> 'teaching_platform_security_test'
     AND current_database() <> 'teaching_platform' THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

ALTER TABLE material_files
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_set_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS hold_set_by TEXT,
  ADD COLUMN IF NOT EXISTS hold_released_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS hold_released_by TEXT;

DO $$ BEGIN
  ALTER TABLE material_files
    ADD CONSTRAINT material_files_hold_set_by_fkey
    FOREIGN KEY (hold_set_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE material_files
    ADD CONSTRAINT material_files_hold_released_by_fkey
    FOREIGN KEY (hold_released_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hold 必須說得出理由與時間 —— 一個沒有理由的保存指令無法被稽核，
-- 也無法回答「什麼時候可以解除」。
DO $$ BEGIN
  ALTER TABLE material_files
    ADD CONSTRAINT material_files_hold_requires_reason CHECK (
      legal_hold = FALSE
      OR (hold_reason IS NOT NULL AND btrim(hold_reason) <> '' AND hold_set_at IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 解除紀錄不得憑空存在：有解除時間就必須曾經設過 hold。
-- **解除後不清空 `hold_reason` / `hold_set_at` / `hold_set_by`** ——
-- 那是稽核軌跡（與 `users` 的解凍規則一致）。
DO $$ BEGIN
  ALTER TABLE material_files
    ADD CONSTRAINT material_files_hold_release_requires_set CHECK (
      hold_released_at IS NULL OR hold_set_at IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 被 hold 的檔案要能一句 SQL 盤點出來（稽核與清理前檢查）。
CREATE INDEX IF NOT EXISTS idx_material_files_legal_hold
  ON material_files (legal_hold) WHERE legal_hold = TRUE;

COMMIT;
