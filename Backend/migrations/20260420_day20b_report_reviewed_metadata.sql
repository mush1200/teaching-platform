-- Day20b：檢舉已讀—reviewed_at、reviewed_by（管理員標記 reviewed 時寫入）
-- status 仍僅能為 pending / reviewed

ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

DO $$
BEGIN
  ALTER TABLE reports
    ADD CONSTRAINT reports_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
