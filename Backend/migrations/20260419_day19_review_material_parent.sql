-- Day19：review 改為綁定 material_id + parent_id（對應 orders.user_id／家長使用者）
-- 移除 order_item_id；授權改由後端以「approved order + order_item」檢核。
-- 執行前請備份資料庫。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'review' AND column_name = 'order_item_id'
  ) THEN
    ALTER TABLE review ADD COLUMN IF NOT EXISTS parent_id TEXT;

    UPDATE review SET parent_id = reviewer_id WHERE parent_id IS NULL;

    DELETE FROM review
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY material_id, parent_id
                 ORDER BY created_at ASC, id ASC
               ) AS rn
        FROM review
        WHERE parent_id IS NOT NULL
      ) t
      WHERE rn > 1
    );

    ALTER TABLE review DROP CONSTRAINT IF EXISTS review_order_item_id_key;
    ALTER TABLE review DROP CONSTRAINT IF EXISTS review_order_item_id_fkey;

    ALTER TABLE review DROP COLUMN IF EXISTS order_item_id;
    ALTER TABLE review DROP COLUMN IF EXISTS reviewer_id;

    ALTER TABLE review ALTER COLUMN parent_id SET NOT NULL;

    BEGIN
      ALTER TABLE review
        ADD CONSTRAINT review_parent_id_fkey
        FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER TABLE review
        ADD CONSTRAINT uq_review_material_parent UNIQUE (material_id, parent_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_review_reviewer_id;
CREATE INDEX IF NOT EXISTS idx_review_parent_id ON review(parent_id);
