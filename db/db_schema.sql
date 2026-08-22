-- Canonical schema snapshot aligned with Backend/models/bootstrapModel.js
-- (ensureCoreTables + runIdempotentMigrations).
-- Deployed DBs may include extra indexes/constraints from Backend/migrations/*.sql.
-- Spec: docs/teaching-platform-mvp-spec-v1.4.md
-- Product rules & HTTP semantics (e.g. material lifecycle, audit action names, POST /materials body):
--   docs/teaching-platform-mvp-spec-v1.4.md, docs/mvp_rules.md
-- This file describes DDL only; no schema migration is required for those rules.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Core domain tables (TEXT primary keys)
-- Exception: activity_logs.id is BIGSERIAL (§10 audit table).
-- ---------------------------------------------------------------------------

-- Canonical role is `buyer`; `parent` is kept as a transitional legacy value only.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_role_check CHECK (role IN ('teacher', 'parent', 'buyer', 'admin'))
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  age_range TEXT,
  teaching_objective TEXT,
  teaching_methods JSONB,
  usage_duration TEXT,
  activity_steps TEXT,
  extension_value TEXT,
  short_description TEXT,
  material_features TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  demo_video_url TEXT,
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  file_key TEXT NOT NULL,
  ip_declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ip_declaration_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_images (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_contents (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER CHECK (count > 0),
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
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
  promo_code TEXT,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  invoice_type TEXT NOT NULL DEFAULT 'none',
  invoice_carrier TEXT,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT orders_invoice_type_check CHECK (invoice_type IN ('none', 'carrier'))
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
  value INTEGER NOT NULL CHECK (value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
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
  proof_mime_type TEXT,
  proof_size_bytes INTEGER,
  original_filename TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  -- `note` 為自由文字（核准備註／退件補充說明／系統註記）。
  -- `rejection_reason` 為結構化的退件原因 code；退件時必填（app 層驗證，見 docs/mvp_rules.md §12.2）。
  note TEXT,
  rejection_reason TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  uploaded_at TIMESTAMP,
  updated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mpp_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT mpp_rejection_reason_check CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'amount_mismatch', 'unreadable', 'payment_not_found', 'invalid_proof', 'other'
  ))
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

-- Moderation case。狀態機的 canonical 定義在 Backend/utils/reportWorkflow.js
-- （docs/mvp_rules.md §6）。`reviewed` 為 legacy 終態，保留於 allowlist 且不回填。
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolution TEXT,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reports_status_check CHECK (status IN (
    'pending', 'investigating', 'awaiting_creator', 'resolved', 'dismissed', 'reviewed'
  )),
  CONSTRAINT reports_resolution_check CHECK (resolution IS NULL OR resolution IN (
    'dismissed', 'warning', 'request_changes', 'unpublish_material'
  )),
  UNIQUE (material_id, reporter_id)
);

-- 案件歷程 / 溝通串。Admin 的處理歷程與 Creator 的補充說明寫在同一張表，時間軸只有一份。
-- 與 activity_logs 分工：activity_logs 是全平台稽核軌跡，report_events 是案件內容
-- （會顯示給創作者看；`admin_note` 除外，Creator 端 API 會過濾）。
CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_events_type_check CHECK (event_type IN (
    'status_changed', 'admin_note', 'creator_response_requested', 'creator_response', 'resolution'
  ))
);

CREATE TABLE IF NOT EXISTS user_favorites (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, material_id)
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
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_events_report_id ON report_events(report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_contents_material_id ON material_contents(material_id);
CREATE INDEX IF NOT EXISTS idx_material_images_material_id ON material_images(material_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_material_id ON user_favorites(material_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Deployed databases may also apply incremental migrations touching `reports` / activity paths; reference copies under `Backend/migrations/`, for example:
-- `20260420_day20_reports_reporter_status.sql`
-- `20260420_day20b_report_reviewed_metadata.sql`
-- `20260423_day22_activity_logs_indexes.sql`
-- `20260822_report_case_workflow.sql`
-- `20260822_payment_proof_rejection_reason.sql`
