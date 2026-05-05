-- Optional manual migration: fill missing material cover_image_url with deterministic Lorem Picsum URLs.
-- Idempotent. Same logic as Backend/models/bootstrapModel.js runIdempotentMigrations (runs on server boot).
-- Requires network access from browser when rendering <img src="..."> (picsum.photos).

UPDATE materials
SET cover_image_url = 'https://picsum.photos/seed/tp-' || md5(id::text) || '/640/480'
WHERE cover_image_url IS NULL
   OR trim(cover_image_url) = ''
   OR lower(trim(cover_image_url)) IN ('https://example.com/cover.jpg', 'http://example.com/cover.jpg');
