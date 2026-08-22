-- Report moderation case workflow (Admin Operations UX Closure Epic §2)
--
-- 目標：讓「收到檢舉 → 調查 → 要求創作者說明 → 判定 → 處置 → 留下紀錄」
-- 完整落在資料庫裡，而不是只存在於 Admin 的腦袋。
--
-- 安全性：
--   * 只做加法（ADD COLUMN / CREATE TABLE / 放寬 CHECK），沒有任何欄位或列被刪除。
--   * `reports.status` 的既有值（含 legacy `reviewed`）全部仍然合法，**不回填**。
--   * `activity_logs` 完全不動。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js，正常啟動即會套用；
-- 本檔為 reference copy（與 Backend/migrations/ 其餘檔案相同慣例）。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 放寬 status allowlist。DROP + ADD 放在同一個 statement/transaction 內，
-- 避免中間出現「沒有任何 CHECK」的視窗。
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('pending', 'investigating', 'awaiting_creator', 'resolved', 'dismissed', 'reviewed'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_resolution_check;
ALTER TABLE reports ADD CONSTRAINT reports_resolution_check
  CHECK (resolution IS NULL OR resolution IN ('dismissed', 'warning', 'request_changes', 'unpublish_material'));

-- 案件歷程 / 溝通串。Admin 與 Creator 共用同一張表，時間軸只有一份。
CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_events_type_check CHECK (event_type IN (
    'status_changed', 'admin_note', 'creator_response_requested', 'creator_response', 'resolution'
  ))
);

CREATE INDEX IF NOT EXISTS idx_report_events_report_id ON report_events(report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

COMMIT;
