-- MVP v1.2 / mvp_rules: orders (int4 amounts) + manual_payment_proofs
-- Idempotent companion to models/bootstrapModel.js — run manually if needed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- See bootstrapModel.runIdempotentMigrations() for full ALTER sequence.
