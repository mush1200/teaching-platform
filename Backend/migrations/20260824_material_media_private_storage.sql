-- Material Media Private Storage（SEC-02，P1 security hardening）
--
-- 教材行銷素材（封面／詳情圖／試看影片）從公開的 `Backend/uploads/material-media/`
-- （由 express.static 無條件服務）移到 `private-storage/material-media/`，
-- 交付一律經 `GET /materials/media/:mediaId`，可見性由**所屬教材的 status** 決定。
--
-- 這支 migration **只新增一張表**，不修改也不刪除任何既有欄位或資料列。
--
-- ## 為什麼沒有搭配的資料搬移腳本（對照 SEC-01）
--
-- 付款憑證那一輪有 95 個實體檔案與 108 筆 legacy 列要搬，因此需要
-- `scripts/migrate-payment-proofs-to-private.js`。行銷素材沒有：
--
--     Backend/uploads/material-media/                        0 個檔案
--     cover_image_url / demo_video_url / material_images     兩個資料庫皆 100% 外部 URL
--     指向 /uploads/material-media/ 的資料列                  0 筆
--
-- （2026-08-24 於 teaching_platform 與 teaching_platform_security_test 唯讀實測。）
-- 沒有位元組要搬，也沒有欄位要回填，所以這裡只建立新表；舊路徑由
-- `Backend/index.js` 的 404 handler 封鎖，屬深度防禦而非資料遷移。
--
-- 執行前請先 backup（見 docs/db-backup-and-migration.md）。
--
--   psql -v ON_ERROR_STOP=1 -d <target-db> -f Backend/migrations/20260824_material_media_private_storage.sql

BEGIN;

-- 目標資料庫 assertion（CLAUDE.md §4）。
DO $$
BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

/*
 * 行銷素材的 metadata。
 *
 * ## 為什麼需要一張表（這才是 SEC-02 的 root cause）
 *
 * 三種檔案資產裡，行銷素材是唯一沒有 metadata 記錄的一種：`cover_image_url`
 * 只是一個自由文字 URL 欄位，檔案與教材之間沒有任何可查詢的關聯。沒有這張表就
 * **無法**在交付時判斷「這張圖屬於哪份教材、那份教材上架了沒」，也就無法做授權 ——
 * 只能整個目錄公開或整個目錄關掉。
 *
 *   material_id  upload-first：上傳當下可能還沒有教材，因此可為 NULL（= 未認領）。
 *                未認領的素材只有上傳者或 Admin 看得到。
 *   kind         cover / detail / demo。決定允許的型別與大小上限
 *                （canonical 定義在 utils/materialMediaPolicy.js）。
 *   storage_key  opaque key（`material-media/<uuid>`）。不進 API 回應、不進 log。
 *   uploaded_by  稽核欄位，同時也是「未認領素材誰能看」的判斷依據。
 */
CREATE TABLE IF NOT EXISTS material_media_files (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id       TEXT REFERENCES materials(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  storage_key       TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  -- 上傳時串流計算（不把整個檔案讀進記憶體）。
  checksum_sha256   TEXT,
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  claimed_at        TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT material_media_files_kind_check CHECK (kind IN ('cover', 'detail', 'demo')),
  CONSTRAINT material_media_files_size_check CHECK (size_bytes > 0),
  -- 「已認領」必須兩個欄位一起成立。少了這條，一個寫錯的 UPDATE 就能產生
  -- 「有教材但沒有認領時間」或反過來的列，而稽核時分不出哪一個才是真的。
  CONSTRAINT material_media_files_claim_check CHECK (
    (material_id IS NULL AND claimed_at IS NULL)
    OR (material_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

-- 交付時的主要查詢是「這份素材屬於哪份教材」，走 PK；這個索引給的是反向的
-- 「這份教材有哪些素材」（Admin 審核面板、日後的清理）。
CREATE INDEX IF NOT EXISTS idx_material_media_files_material
  ON material_media_files(material_id);

-- 未認領素材的清理需要「久未認領」這個條件。
CREATE INDEX IF NOT EXISTS idx_material_media_files_unclaimed
  ON material_media_files(uploaded_at)
  WHERE material_id IS NULL;

COMMIT;
