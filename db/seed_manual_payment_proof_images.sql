-- Seed image-style manual payment proofs (JPG/PNG/WEBP).
-- Usage:
--   psql "$DATABASE_URL" -f db/seed_manual_payment_proof_images.sql
--
-- This script inserts up to 3 proof rows for the 3 latest pending_payment orders.
-- If no pending_payment order exists, nothing will be inserted.

WITH target_orders AS (
  SELECT id
  FROM orders
  WHERE status = 'pending_payment'
  ORDER BY created_at DESC
  LIMIT 3
),
proof_templates AS (
  SELECT *
  FROM (
    VALUES
      ('image/jpeg', 412345, 'transfer-proof-1.jpg', 'proofs/seed-proof-1.jpg'),
      ('image/png',  298120, 'transfer-proof-2.png', 'proofs/seed-proof-2.png'),
      ('image/webp', 265432, 'transfer-proof-3.webp', 'proofs/seed-proof-3.webp')
  ) AS t(proof_mime_type, proof_size_bytes, original_filename, path_suffix)
),
expanded AS (
  SELECT
    o.id AS order_id,
    p.proof_mime_type,
    p.proof_size_bytes,
    p.original_filename,
    p.path_suffix,
    ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY p.original_filename) AS rn
  FROM target_orders o
  CROSS JOIN proof_templates p
)
INSERT INTO manual_payment_proofs (
  order_id,
  proof_url,
  proof_mime_type,
  proof_size_bytes,
  original_filename,
  review_status,
  uploaded_at
)
SELECT
  e.order_id,
  'https://cdn.example.com/' || e.path_suffix,
  e.proof_mime_type,
  e.proof_size_bytes,
  e.original_filename,
  'pending',
  NOW() - (e.rn || ' minutes')::interval
FROM expanded e
WHERE e.rn <= 3;
