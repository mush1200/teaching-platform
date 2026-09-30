-- HISTORICAL / DO NOT RUN (SEC-04, 2026-09-30).
-- Originally an optional manual migration that filled missing material cover_image_url with Lorem Picsum URLs.
-- The same statement also ran on every server boot from Backend/models/bootstrapModel.js; that boot-time write
-- has been REMOVED because it persisted third-party URLs into application data (including production).
-- Kept only so the migration history stays intact. Do not apply it to any environment.
-- Missing covers are rendered by the frontend fallback (coverGradient); the database is left NULL.

UPDATE materials
SET cover_image_url = 'https://picsum.photos/seed/tp-' || md5(id::text) || '/640/480'
WHERE cover_image_url IS NULL
   OR trim(cover_image_url) = ''
   OR lower(trim(cover_image_url)) IN ('https://example.com/cover.jpg', 'http://example.com/cover.jpg');
