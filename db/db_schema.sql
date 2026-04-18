-- Day16 FINAL DB Schema
-- aligned with Spec v1.2 FINAL

CREATE TABLE users (

 id UUID PRIMARY KEY,

 email TEXT UNIQUE NOT NULL,

 password_hash TEXT NOT NULL,

 role TEXT NOT NULL,

 created_at TIMESTAMP DEFAULT now()

);

CREATE TABLE materials (

 id UUID PRIMARY KEY,

 teacher_id UUID REFERENCES users(id),

 title TEXT NOT NULL,

 description TEXT,

 price NUMERIC NOT NULL,

 status TEXT NOT NULL,

 created_at TIMESTAMP DEFAULT now(),

 updated_at TIMESTAMP DEFAULT now()

);

CREATE TABLE cart_items (

 id UUID PRIMARY KEY,

 user_id UUID REFERENCES users(id),

 material_id UUID REFERENCES materials(id),

 created_at TIMESTAMP DEFAULT now(),

 UNIQUE(user_id, material_id)

);

CREATE TABLE orders (

 id UUID PRIMARY KEY,

 user_id UUID REFERENCES users(id),

 status TEXT NOT NULL,

 total_price NUMERIC,

 rejected_reason TEXT,

 approved_by UUID REFERENCES users(id),

 approved_at TIMESTAMP,

 created_at TIMESTAMP DEFAULT now(),

 updated_at TIMESTAMP DEFAULT now()

);

CREATE TABLE order_items (

 id UUID PRIMARY KEY,

 order_id UUID REFERENCES orders(id),

 material_id UUID REFERENCES materials(id),

 material_title_snapshot TEXT,

 price_snapshot NUMERIC,

 created_at TIMESTAMP DEFAULT now()

);

CREATE TABLE manual_payment_proofs (

 id UUID PRIMARY KEY,

 order_id UUID REFERENCES orders(id),

 uploader_id UUID REFERENCES users(id),

 file_url TEXT NOT NULL,

 original_filename TEXT,

 mime_type TEXT,

 file_size INT,

 checksum TEXT,

 uploaded_at TIMESTAMP DEFAULT now(),

 reviewed_by UUID REFERENCES users(id),

 reviewed_at TIMESTAMP,

 review_note TEXT

);

-- Day18: 評論綁定 order_item（每筆 order_item 至多一則）；核准後之訂單狀態欄位見 orders.status = approved（與後端一致）
CREATE TABLE review (

 id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

 material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

 order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,

 reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

 rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),

 comment TEXT,

 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

 UNIQUE(order_item_id)

);

CREATE TABLE reports (

 id UUID PRIMARY KEY,

 user_id UUID REFERENCES users(id),

 material_id UUID REFERENCES materials(id),

 reason TEXT,

 status TEXT,

 created_at TIMESTAMP DEFAULT now(),

 reviewed_by UUID REFERENCES users(id),

 reviewed_at TIMESTAMP

);

CREATE TABLE activity_logs (

 id UUID PRIMARY KEY,

 actor_id UUID,

 actor_role TEXT,

 action TEXT,

 target_type TEXT,

 target_id UUID,

 result TEXT,

 ip_address TEXT,

 user_agent TEXT,

 meta JSONB,

 created_at TIMESTAMP DEFAULT now()

);