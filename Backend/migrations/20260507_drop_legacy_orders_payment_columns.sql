-- MVP v1.3 cleanup: manual payment proof data is stored in manual_payment_proofs.
-- Drop legacy per-order payment proof columns that are no longer used.
ALTER TABLE orders DROP COLUMN IF EXISTS proof_url;
ALTER TABLE orders DROP COLUMN IF EXISTS proof_uploaded_at;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;
ALTER TABLE orders DROP COLUMN IF EXISTS rejected_reason;
ALTER TABLE orders DROP COLUMN IF EXISTS approved_by;
ALTER TABLE orders DROP COLUMN IF EXISTS approved_at;
