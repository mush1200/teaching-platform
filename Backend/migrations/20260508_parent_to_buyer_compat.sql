-- Compatibility migration: canonicalize buyer role in DB.
-- App layer still maps buyer -> parent for legacy frontend compatibility.

UPDATE users
SET role = 'buyer'
WHERE role = 'parent';

ALTER TABLE users
ALTER COLUMN role SET DEFAULT 'buyer';
