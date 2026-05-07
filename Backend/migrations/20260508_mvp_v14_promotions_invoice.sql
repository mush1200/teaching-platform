ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_carrier TEXT;

UPDATE orders SET discount_amount = 0 WHERE discount_amount IS NULL;
UPDATE orders SET invoice_type = 'none' WHERE invoice_type IS NULL OR TRIM(invoice_type) = '';

DO $$
BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_invoice_type_check CHECK (invoice_type IN ('none', 'carrier'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
  value INTEGER NOT NULL CHECK (value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO promotions(code, type, value, is_active)
VALUES ('WELCOME100', 'fixed', 100, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO promotions(code, type, value, is_active)
VALUES ('MAY10', 'percent', 10, TRUE)
ON CONFLICT (code) DO NOTHING;
