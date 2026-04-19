-- Canonical schema snapshot aligned with Backend/models/bootstrapModel.js
-- (ensureCoreTables + runIdempotentMigrations).
-- Deployed DBs may include extra indexes/constraints from Backend/migrations/*.sql.
-- Spec: docs/teaching-platform-mvp-spec-v1.3.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables (TEXT primary keys throughout)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'parent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  age_range TEXT,
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  file_key TEXT NOT NULL,
  ip_declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ip_declaration_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT uq_cart_items_user_material UNIQUE (user_id, material_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_mode TEXT NOT NULL DEFAULT 'manual_transfer',
  total_amount INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  proof_url TEXT,
  proof_uploaded_at TIMESTAMP,
  payment_method TEXT,
  rejected_reason TEXT,
  approved_by TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,
  price_snapshot NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  seller_id TEXT REFERENCES users(id),
  subtotal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id, material_id)
);

CREATE TABLE IF NOT EXISTS manual_payment_proofs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  proof_url TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  uploaded_at TIMESTAMP,
  updated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mpp_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS review (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, parent_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reports_status_check CHECK (status IN ('pending', 'reviewed')),
  UNIQUE (material_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Typical indexes created by migrations / bootstrap (idempotent elsewhere)
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_order ON manual_payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_status ON manual_payment_proofs(review_status);
CREATE INDEX IF NOT EXISTS idx_review_material_id ON review(material_id);
CREATE INDEX IF NOT EXISTS idx_review_parent_id ON review(parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_material_id ON reports(material_id);

-- Deployed databases may also apply incremental migrations touching `reports` / activity paths; reference copies under `Backend/migrations/`, for example:
-- `20260420_day20_reports_reporter_status.sql`
-- `20260420_day20b_report_reviewed_metadata.sql`
