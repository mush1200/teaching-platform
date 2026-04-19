-- Day20：reports 改為 reporter_id + status（pending / reviewed），並 UNIQUE(material_id, reporter_id)。
-- 舊版欄位 user_id 將遷移至 reporter_id。執行前請備份。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT;
    UPDATE reports SET reporter_id = user_id WHERE reporter_id IS NULL;
    UPDATE reports SET status = COALESCE(NULLIF(TRIM(status), ''), 'pending');
    DELETE FROM reports
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY material_id, reporter_id
                 ORDER BY created_at ASC NULLS LAST, id ASC
               ) AS rn
        FROM reports
        WHERE reporter_id IS NOT NULL
      ) t
      WHERE rn > 1
    );
    ALTER TABLE reports DROP COLUMN user_id;
  END IF;
END $$;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id TEXT;

UPDATE reports SET status = COALESCE(NULLIF(TRIM(status), ''), 'pending')
WHERE status IS NULL OR TRIM(status) = '';

ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'pending';

DO $$
BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending', 'reviewed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE reports
    ADD CONSTRAINT reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE reports
    ADD CONSTRAINT reports_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE reports ADD CONSTRAINT uq_reports_material_reporter UNIQUE (material_id, reporter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE reports ALTER COLUMN status SET NOT NULL;
ALTER TABLE reports ALTER COLUMN reporter_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_material_id ON reports(material_id);
