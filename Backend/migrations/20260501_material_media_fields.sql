ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS demo_video_url TEXT;

CREATE TABLE IF NOT EXISTS material_images (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_images_material_id
  ON material_images(material_id);
