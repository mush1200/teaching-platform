-- 教材上架審核 workflow（Material Review MVP Phase 1）
--
-- 目標：讓「創作者送出 → Admin 核准／退回 → 創作者修改 → 重新送審 → 上架」
-- 完整存在於資料庫中。在此之前，`materials.status` 只有三個值，
-- 沒有「退回修改」這個狀態，也沒有任何欄位可以保存退回原因。
--
-- 安全性：
--   * 只做加法（ADD COLUMN / 放寬 CHECK），沒有任何欄位或列被刪除。
--   * `pending_review` / `published` / `unpublished` 三個既有值全部仍然合法，資料不動。
--   * `activity_logs` 完全不動。
--   * `published_at` 的 backfill 見下方說明 —— 刻意**不**憑空造時間。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js，正常啟動即會套用；
-- 本檔為 reference copy（與 Backend/migrations/ 其餘檔案相同慣例）。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- 1) 放寬 status allowlist：新增 changes_requested（需修改，球在創作者手上）。
--
-- DROP + ADD 放在同一個 DO block（單一 statement）內，不會出現「沒有任何 CHECK」的視窗。
-- 這個 constraint 在既有資料庫是手動建立的（repo 內原本沒有建立它的程式碼），
-- 因此這裡同時負責「放寬既有的」與「為全新資料庫建立」。
DO $$
BEGIN
  ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_status_check;
  ALTER TABLE materials
    ADD CONSTRAINT materials_status_check
    CHECK (status IN ('pending_review', 'published', 'changes_requested', 'unpublished'));
END $$;

-- 2) Latest review decision snapshot。
--
-- **這四個欄位不是 review history**：每一次新的審核決定都會覆寫它們。
-- 完整歷史的 canonical source 是 `activity_logs`（target_type = 'material'）：
--   material.created / material.published / material.changes_requested /
--   material.resubmitted / material.unpublished
-- Creator 看最近一次（本快照），Admin 稽核看完整歷史（activity_logs）。
ALTER TABLE materials ADD COLUMN IF NOT EXISTS review_reason_code TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

DO $$
BEGIN
  ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_review_reason_check;
  ALTER TABLE materials
    ADD CONSTRAINT materials_review_reason_check
    CHECK (review_reason_code IS NULL OR review_reason_code IN (
      'incomplete_info', 'media_quality', 'features_mismatch', 'file_problem', 'ip_concern', 'other'
    ));
END $$;

-- 3) published_at = **首次**成功公開的時間。
--
-- 語意刻意不是 last_published_at：第二次以後的公開時間由 activity_logs 的
-- `material.published` 保存。應用層只在 published_at IS NULL 時寫入。
ALTER TABLE materials ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

-- Backfill：只從**可靠**的來源推導，不足者保留 NULL。
--
-- 唯一可靠的來源是 activity_logs 裡最早的一筆 `material.published`（它記錄的就是
-- 當時實際發生的公開動作）。`updated_at` **不可用** —— 它會被任何一次編輯覆寫，
-- 拿它假裝成首次上架時間會產生看似精確、實際錯誤的資料。
-- 因此：查得到事件的填入；查不到的既有 published 教材維持 NULL，
-- UI 必須容忍 NULL（顯示「—」），不得假設它一定有值。
UPDATE materials m
SET published_at = first_publish.at
FROM (
  SELECT target_id, MIN(created_at) AS at
  FROM activity_logs
  WHERE target_type = 'material' AND action = 'material.published'
  GROUP BY target_id
) AS first_publish
WHERE m.id = first_publish.target_id
  AND m.published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
CREATE INDEX IF NOT EXISTS idx_materials_status_updated_at ON materials(status, updated_at DESC);

-- 4) Post-migration assertions。任何一條不成立就整批回滾。
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 4a) CHECK 必須存在且涵蓋四個值。
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'materials'::regclass
    AND conname = 'materials_status_check'
    AND pg_get_constraintdef(oid) LIKE '%changes_requested%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ABORT: materials_status_check missing or does not allow changes_requested';
  END IF;

  -- 4b) 既有資料一列都不能因為這次變更而變成非法。
  SELECT COUNT(*) INTO v_count
  FROM materials
  WHERE status NOT IN ('pending_review', 'published', 'changes_requested', 'unpublished');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ABORT: % material rows hold a status outside the allowlist', v_count;
  END IF;

  -- 4c) 五個欄位都要存在。
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'materials'
    AND column_name IN ('review_reason_code', 'review_note', 'reviewed_by', 'reviewed_at', 'published_at');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'ABORT: expected 5 review columns on materials, found %', v_count;
  END IF;

  -- 4d) 每一個非 NULL 的 published_at 都必須對應一筆真實的 `material.published` 事件。
  --
  -- 刻意**不**用「status 必須是 published」當條件：曾經上架後被下架、又重新送審的教材
  -- 會是 pending_review / unpublished，但它確實有首次公開時間 —— 那是正確的資料。
  SELECT COUNT(*) INTO v_count
  FROM materials m
  WHERE m.published_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM activity_logs a
      WHERE a.target_type = 'material' AND a.action = 'material.published' AND a.target_id = m.id
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ABORT: % materials carry published_at without a material.published event', v_count;
  END IF;
END $$;

COMMIT;
