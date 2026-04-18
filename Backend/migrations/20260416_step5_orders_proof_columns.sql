-- POST /orders/:id/proof：缺欄時執行（PostgreSQL，TEXT id）

ALTER TABLE orders ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
