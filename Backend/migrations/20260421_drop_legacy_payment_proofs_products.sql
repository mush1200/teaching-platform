-- Remove legacy tables (Day13–14). Spec v1.2: materials + manual_payment_proofs only.
BEGIN;

DROP TABLE IF EXISTS payment_proofs CASCADE;
DROP TABLE IF EXISTS products CASCADE;

COMMIT;
