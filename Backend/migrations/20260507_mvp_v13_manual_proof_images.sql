-- MVP v1.3: manual payment proof uploads support image metadata.
ALTER TABLE manual_payment_proofs
  ADD COLUMN IF NOT EXISTS proof_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS proof_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS original_filename TEXT;
