-- Day18: review 綁定 order_item；訂單核准狀態與規格對齊為 approved
-- 執行前請備份。若曾使用舊表 reviews，將一併移除。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 舊版 CHECK 可能不含 approved，先卸除再對齊規格用語
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 核准完成：paid → approved（與 teaching-platform-mvp-spec-v1.2 訂單 lifecycle 一致）
UPDATE orders SET status = 'approved' WHERE status = 'paid';

DROP TABLE IF EXISTS reviews CASCADE;

CREATE TABLE IF NOT EXISTS review (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_review_material_id ON review(material_id);
CREATE INDEX IF NOT EXISTS idx_review_reviewer_id ON review(reviewer_id);
