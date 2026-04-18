-- MVP v1.2 naming: remove product / purchase artifacts and non-spec order columns.
-- Run manually against existing DB when safe (backup first).

DROP TABLE IF EXISTS payment_proofs CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS products CASCADE;

ALTER TABLE orders DROP COLUMN IF EXISTS payment_proof_key;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_uploaded_at;
