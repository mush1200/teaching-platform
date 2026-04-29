ALTER TABLE materials
ADD COLUMN IF NOT EXISTS teaching_objective TEXT,
ADD COLUMN IF NOT EXISTS teaching_methods JSONB,
ADD COLUMN IF NOT EXISTS usage_duration TEXT,
ADD COLUMN IF NOT EXISTS activity_steps TEXT,
ADD COLUMN IF NOT EXISTS extension_value TEXT,
ADD COLUMN IF NOT EXISTS short_description TEXT;

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

CREATE INDEX IF NOT EXISTS idx_material_contents_material_id ON material_contents(material_id);
