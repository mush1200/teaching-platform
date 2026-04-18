BEGIN;

ALTER TABLE orders
  ALTER COLUMN status SET DEFAULT 'pending_payment';

UPDATE orders
SET status = 'pending_payment'
WHERE status = 'pending';

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS payment_proofs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  proof_url TEXT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_order_id ON payment_proofs(order_id);

COMMIT;
