-- 法律文件登記表（P1-09 Legal Foundation — Gate 12 foundation）
--
-- 目標：讓「平台目前對外生效的法律文件是哪一份、哪一版、內容是什麼」
-- 成為**單一、可稽核、published-only** 的事實來源。
--
-- ## 為什麼需要這張表
--
-- `consent_records`（Gate 5，2026-08-26）記錄的是「**使用者同意了 vN**」，
-- 但 repo 中**沒有任何地方定義 vN 是什麼**：沒有文件本體、沒有現行版本解析、
-- 沒有生效日。因此同意證據目前無法被驗證或比對 —— 這是 Gate 5 / Gate 12 /
-- Gate 13 共同的上游缺口。本表補的就是文件端。
--
-- ## 本次**不**做的事（重要）
--
--   * **不 seed 任何法律條文。** migration 執行後 `legal_documents` 為 **0 列**，
--     這是**預期且正確**的狀態 —— repo 沒有任何經核可的法律文件，
--     由 AI 產生條文等同偽造法律文件。
--   * **不接線任何 production consent flow**（註冊／結帳／創作者聲明全部不動）。
--     文件尚未 published 之前接線，只會保存指向不存在版本的假證據。
--   * **不動 `consent_records`**，也不動 `materials.ip_declaration_*`。
--
-- ## 安全邊界
--
-- 法律文件正文是 public-readable 的，但**寫入路徑仍是 security boundary**。
-- 三道 DB 層防線（不依賴 service 層自律）：
--
--   1. `legal_documents_publishable_check` —— published/superseded 必須具備
--      body / content_hash / effective_date / published_at，缺一不得進入該狀態。
--      **`NULL content → published` 在 DB 層就不可能發生。**
--   2. `legal_documents_one_published_per_type` —— partial UNIQUE index，
--      同一 document_type **同時最多一筆 published**。「兩份現行 Terms」不可能存在。
--   3. `trg_legal_documents_immutable` —— 一旦 published，正文／版本／雜湊／
--      生效日不得再被改寫（僅允許 published → superseded 的狀態流轉）。
--      要更正就發新版本，與 `consent_records` 的 append-only 哲學一致。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS legal_documents (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- 四種 canonical 文件（`DEC-04`，2026-08-27 Owner 拍板）。
  -- **Refund Policy 是獨立文件**，不是 Terms 的章節 —— 它必須有自己的
  -- document identity 與 version，Terms 可以引用它。
  -- 新增類型需要一次 migration：文件集合是產品／法務決策，不是自由文字。
  document_type TEXT NOT NULL,

  -- 版本識別碼。**刻意是 opaque non-empty string** ——
  -- semantic / integer / date versioning 尚未由 canonical docs 決定，
  -- 現在挑一種等於替尚未拍板的事情做決定。
  version TEXT NOT NULL,

  -- 正文。draft 階段可為 NULL；publish 時必填（見 publishable_check）。
  -- 格式為 **plain text**：repo 沒有任何 HTML sanitizer 或 markdown renderer
  -- 相依，為法律頁面引入 raw HTML 會直接開一個 XSS 面。
  body TEXT,

  -- 正文的 SHA-256（**server 計算**，不接受 client 指定）。
  -- 這是 `H4` 要求的「內容快照」最小形式：即使版本標籤日後被誤用，
  -- 雜湊仍能證明當時生效的實際文字。與 `consent_records.document_content_hash`
  -- 同型別，未來可直接比對。
  content_hash TEXT,

  -- 生效日。publish 時必填。型別與 `consent_records.document_effective_date`
  -- 一致（DATE），確保未來 consent 接線時不需要型別轉換。
  effective_date DATE,

  publication_status TEXT NOT NULL DEFAULT 'draft',

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMP,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- 被哪一版取代。superseded 的文件**仍須可讀** ——
  -- 歷史 consent 證據會指向它，稽核時必須查得到當時的正文。
  superseded_at TIMESTAMP,
  superseded_by_id TEXT REFERENCES legal_documents(id) ON DELETE RESTRICT,

  CONSTRAINT legal_documents_type_check CHECK (document_type IN (
    'terms',              -- 服務條款
    'privacy',            -- 隱私權政策
    'creator_agreement',  -- 創作者內容授權與合作條款
    'refund_policy'       -- 退款／取消政策（DEC-04：獨立文件）
  )),

  CONSTRAINT legal_documents_status_check CHECK (publication_status IN (
    'draft', 'approved', 'published', 'superseded'
  )),

  CONSTRAINT legal_documents_version_not_blank_check CHECK (TRIM(version) <> ''),

  -- 雜湊與正文同進同出：不得有「有雜湊沒正文」或「有正文沒雜湊」。
  CONSTRAINT legal_documents_hash_tracks_body_check CHECK (
    (content_hash IS NULL) = (body IS NULL)
  ),

  -- **Fail-closed publication。** published / superseded 必須具備完整 metadata。
  -- 空白正文（只有空格）同樣不算數。
  CONSTRAINT legal_documents_publishable_check CHECK (
    publication_status NOT IN ('published', 'superseded')
    OR (
      body IS NOT NULL AND TRIM(body) <> ''
      AND content_hash IS NOT NULL
      AND effective_date IS NOT NULL
      AND published_at IS NOT NULL
    )
  ),

  -- superseded 必須留下時間與繼任者，否則「何時被誰取代」無從稽核。
  CONSTRAINT legal_documents_superseded_evidence_check CHECK (
    publication_status <> 'superseded'
    OR (superseded_at IS NOT NULL AND superseded_by_id IS NOT NULL)
  ),

  -- 反過來：沒進 superseded 就不該有取代紀錄。
  CONSTRAINT legal_documents_supersede_only_when_superseded_check CHECK (
    publication_status = 'superseded'
    OR (superseded_at IS NULL AND superseded_by_id IS NULL)
  ),

  CONSTRAINT legal_documents_approved_evidence_check CHECK (
    publication_status = 'draft' OR approved_at IS NOT NULL
  )
);

-- 同一文件不得有兩個同名版本。
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_type_version_key
  ON legal_documents (document_type, version);

-- **同一 document_type 同時只能有一筆 published。**
-- 這是 partial UNIQUE index，不是 service 層的自律 ——
-- 「兩份現行 Terms」在 DB 層即為不可能。
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_one_published_per_type
  ON legal_documents (document_type) WHERE publication_status = 'published';

-- public renderer 的解析路徑：type + status。
CREATE INDEX IF NOT EXISTS idx_legal_documents_type_status
  ON legal_documents (document_type, publication_status);

-- ---------------------------------------------------------------------------
-- 已發布內容不得被靜默改寫
-- ---------------------------------------------------------------------------
-- 一旦 published，這份文件就可能已經有人對它表示同意（未來 `consent_records`
-- 會指向它的 version 與 content_hash）。此時改正文＝**竄改已成立的同意標的**。
-- 要更正只有一條路：發一個新版本並讓舊版 superseded。
--
-- 唯一允許的狀態流轉是 published → superseded（由 publish 新版時原子完成）。

CREATE OR REPLACE FUNCTION legal_documents_reject_rewrite()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.publication_status IN ('published', 'superseded') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.document_type IS DISTINCT FROM OLD.document_type
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION
        'legal_documents is immutable once published: publish a new version instead of rewriting %', OLD.id;
    END IF;
  END IF;

  -- superseded 是終態。
  IF OLD.publication_status = 'superseded'
     AND NEW.publication_status IS DISTINCT FROM 'superseded' THEN
    RAISE EXCEPTION 'legal_documents: superseded is terminal (% -> %)',
      OLD.publication_status, NEW.publication_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_documents_immutable ON legal_documents;
CREATE TRIGGER trg_legal_documents_immutable
  BEFORE UPDATE ON legal_documents
  FOR EACH ROW EXECUTE FUNCTION legal_documents_reject_rewrite();

COMMIT;

-- 驗證：本 migration 後應為 0 列。
--   SELECT COUNT(*) FROM legal_documents;  -->  0
-- 有 published 法律文件之前，`/terms` 等 public route 一律 404。
