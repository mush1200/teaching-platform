-- Day17: order_item snapshot — seller_id + subtotal (unit_price × quantity)
BEGIN;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal INTEGER;

UPDATE order_items oi
SET subtotal = ROUND((COALESCE(oi.price_snapshot::numeric, 0) * COALESCE(oi.quantity, 1))::numeric)::integer
WHERE oi.subtotal IS NULL;

UPDATE order_items oi
SET seller_id = m.teacher_id
FROM materials m
WHERE oi.material_id = m.id AND oi.seller_id IS NULL;

DO $$
BEGIN
  ALTER TABLE order_items
    ADD CONSTRAINT order_items_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE order_items ALTER COLUMN subtotal SET NOT NULL;

COMMIT;
