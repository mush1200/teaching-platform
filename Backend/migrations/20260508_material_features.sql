ALTER TABLE materials
ADD COLUMN IF NOT EXISTS material_features TEXT[] DEFAULT '{}';

ALTER TABLE materials
ALTER COLUMN material_features SET DEFAULT '{}';
