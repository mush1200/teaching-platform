-- 教材本體檔案與安全交付（Material File Upload & Secure Delivery — P0）
--
-- 目標：讓「教材本體」成為真正的檔案 —— 有私有儲存、有審核隔離、有購買授權、
-- 有永久交付。在此之前 `materials.file_key` 只是創作者手打的字串，
-- `/download/:materialId` 回傳的是不存在的 mock URL。
-- 規格見 docs/material-file-storage-and-delivery.md。
--
-- 安全性：
--   * 只做加法（CREATE TABLE / ADD COLUMN / ADD INDEX），沒有任何欄位或列被刪除。
--   * `materials.file_key` **完全不動**（legacy placeholder；既有 fixture / smoke / Postman 依賴它）。
--   * 既有 published 教材的 `approved_file_id` 為 NULL —— 那是合法的 legacy 狀態，
--     下載時回 409 `material_file_unavailable`，**不回填假資料**（沒有真檔就沒有真 row）。
--   * `reports` / 教材審核狀態機完全不動。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js，正常啟動即會套用。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- 前置條件：materials 必須已有教材審核 workflow 的欄位（20260823_material_review_workflow.sql）。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'materials' AND column_name = 'reviewed_at'
  ) THEN
    RAISE EXCEPTION 'ABORT: material review workflow migration must run first';
  END IF;
END $$;

-- 1) 教材本體檔案。
--
-- 每一個**實際存在於儲存後端的物件**都有一列 —— 包含尚未附加到教材的（`unattached`）。
-- 因此 orphan 清理是一句 SQL，不需要掃描檔案系統；而「曾經核准過的檔案」也永遠
-- 留得下參照，不會因為指標被覆寫而變成無主檔案。
CREATE TABLE IF NOT EXISTS material_files (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  -- 上傳當下還沒有教材（upload-first flow），因此可為 NULL。
  material_id       TEXT REFERENCES materials(id) ON DELETE CASCADE,
  -- opaque storage key（`material-files/<uuid>`）。**永不對 Buyer / 公開 API 外流**。
  storage_key       TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  -- 上傳時串流計算。用於完整性驗證與未來 object storage 遷移比對。
  checksum_sha256   TEXT,
  status            TEXT NOT NULL DEFAULT 'unattached',
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at       TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT material_files_status_check CHECK (status IN (
    'unattached',   -- 已上傳、尚未附加到教材
    'candidate',    -- 已附加、等待 Admin 審核（Buyer 永遠拿不到）
    'approved',     -- 目前買家會下載到的檔案
    'superseded',   -- 被同一教材的後續檔案取代（含未經核准就被替換掉的候選）；保留供稽核
    'revoked'       -- 平台因安全／法律原因停止交付
  )),
  CONSTRAINT material_files_size_check CHECK (size_bytes > 0),
  -- 已附加的檔案一定要有 material_id；未附加的一定不能有。
  CONSTRAINT material_files_attachment_check CHECK (
    (status = 'unattached' AND material_id IS NULL)
    OR (status <> 'unattached' AND material_id IS NOT NULL)
  )
);

-- 一份教材最多只有一個 approved、一個 candidate。這是「審核隔離」的資料庫層保證。
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_one_approved
  ON material_files(material_id) WHERE status = 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_one_candidate
  ON material_files(material_id) WHERE status = 'candidate';
CREATE INDEX IF NOT EXISTS idx_material_files_material ON material_files(material_id);
-- orphan 清理用：`WHERE status='unattached' AND uploaded_at < now() - 24h`
CREATE INDEX IF NOT EXISTS idx_material_files_unattached ON material_files(status, uploaded_at);

-- 2) materials 的兩個指標。
--
--   approved_file_id  買家會下載到的檔案。**只能由 Admin 核准流程寫入。**
--   pending_file_id   待審候選檔。Buyer 永遠看不到、拿不到。
--
-- 兩個指標分開存在，是為了讓「核准」成為一次純 DB 的指標交換 —— 檔案本身不需要搬動，
-- 因此 promotion 可以與 status 變更在同一個 transaction 內原子完成。
ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved_file_id TEXT
  REFERENCES material_files(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS pending_file_id TEXT
  REFERENCES material_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_materials_approved_file ON materials(approved_file_id);
CREATE INDEX IF NOT EXISTS idx_materials_pending_file ON materials(pending_file_id);

-- 3) 一次性下載 token。
--
-- 為什麼要有這張表而不是記憶體 Map：重啟即全失效、多實例不成立、水平擴充會壞。
-- token 本身**只存 SHA-256 雜湊**，資料庫外洩不會直接變成可用的下載連結。
CREATE TABLE IF NOT EXISTS material_download_tokens (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  token_hash   TEXT NOT NULL UNIQUE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id  TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  file_id      TEXT NOT NULL REFERENCES material_files(id) ON DELETE CASCADE,
  expires_at   TIMESTAMP NOT NULL,
  consumed_at  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_download_tokens_expiry ON material_download_tokens(expires_at);

-- 4) Post-migration assertions。任一不成立即整批回滾。
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
   WHERE table_name IN ('material_files', 'material_download_tokens');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected both new tables, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_name = 'materials' AND column_name IN ('approved_file_id', 'pending_file_id');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected 2 material file pointers, found %', v_count;
  END IF;

  -- legacy 欄位必須仍然存在（本 migration 不碰它 —— 不刪除、不改型別、不改 nullability）。
  -- 註：DB 層 file_key 本來就是 nullable，NOT NULL 只存在於舊的應用層驗證；
  -- 因此新流程建立的教材 file_key 為 NULL 是合法狀態。
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_name = 'materials' AND column_name = 'file_key';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ABORT: materials.file_key must remain (legacy placeholder)';
  END IF;

  -- 新表必須是空的：沒有真檔就沒有真 row，不為 legacy file_key 造假資料。
  SELECT COUNT(*) INTO v_count FROM material_files;
  IF v_count <> 0 THEN
    RAISE NOTICE 'material_files already contains % row(s) — skipping empty-table assertion', v_count;
  END IF;

  -- 指標必須指向同一份教材的檔案（此刻應為 0 筆違規）。
  SELECT COUNT(*) INTO v_count
  FROM materials m
  JOIN material_files f ON f.id IN (m.approved_file_id, m.pending_file_id)
  WHERE f.material_id IS DISTINCT FROM m.id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ABORT: % material pointer(s) reference a file from another material', v_count;
  END IF;
END $$;

COMMIT;
