-- `SCHEMA-03` —— legal_documents.requires_reconsent（re-consent enforcement metadata）
--
-- Owner decision `DEC-LEGAL-06`（2026-08-27，Owner Decision Lock Round 1）。
--
-- ## 這個欄位是什麼、不是什麼
--
-- **是：** production enforcement metadata —— 「發布這一版時，系統是否要求
-- 既有使用者重新同意」。它回答的是**系統要不要擋**。
--
-- **不是：** 法律上「重大變更」之認定。誰有權設定、依什麼判準設定，
-- 仍屬 `DEC-LEGAL-01` 的律師側，**尚未確定**，本 migration 不回答。
--
-- 因此本欄位**刻意是 BOOLEAN，不是 enum**。不得引入
-- `material` / `non_material` / `major` / `minor` 這類法律分類值 ——
-- 用法律語彙標記一個由平台自行設定的旗標，等於把尚未取得的法律判斷
-- 寫進系統。
--
-- 版本號與本欄位**互不推導**：`version` 是 integer sequence（`DEC-LEGAL-05`），
-- 純粹是文件識別；`2` 不代表要重新同意，`3` 也不代表不用。
--
-- ## 為什麼沒有 DEFAULT
--
-- 這是本次最重要的 guardrail。`DEFAULT false` 會讓發布流程**靜默通過** ——
-- 沒有人回答過「這一版要不要重新同意」，但資料庫裡會有一個看起來像答案的
-- `false`。事後稽核無從分辨「決定不要求」與「沒人想過這件事」。
--
-- 因此：`NOT NULL` 且**無 DEFAULT**。呼叫端必須顯式提供 true 或 false，
-- service 層亦不得有 `?? false` 之類的 fallback。
--
-- ## 為什麼可以直接 NOT NULL
--
-- `legal_documents` 在兩個資料庫實測**皆為 0 列**（2026-08-27）：
--   teaching_platform              -> 0
--   teaching_platform_security_test -> 0
-- 0 列時 `ADD COLUMN ... NOT NULL`（無 DEFAULT）可直接成立，**無需 backfill**。
-- 下方的 assertion 會在「已經不是 0 列」時直接中止 —— 因為替既有列挑一個值
-- 就是一個隱藏的 default，正是本決定要禁止的事。
--
-- ## 同時修正 immutability trigger
--
-- `trg_legal_documents_immutable` 是**顯式欄位白名單**，不是全列比對。
-- 新增欄位**不會**被自動保護 —— 若不同步更新，published 文件的
-- `requires_reconsent` 可以被事後改寫，而那正是 consent 證據的標的之一。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

DO $$
DECLARE
  col_exists BOOLEAN;
  existing_rows BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'legal_documents' AND column_name = 'requires_reconsent'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE 'legal_documents.requires_reconsent already present — ADD COLUMN skipped (idempotent re-run)';
  ELSE
    SELECT COUNT(*) INTO existing_rows FROM legal_documents;

    IF existing_rows <> 0 THEN
      RAISE EXCEPTION
        'ABORT: legal_documents has % row(s); SCHEMA-03 assumed 0 rows (no backfill). '
        'Choosing a value for existing rows would be an implicit default, which DEC-LEGAL-06 forbids. '
        'Re-evaluate before re-running.', existing_rows;
    END IF;

    ALTER TABLE legal_documents ADD COLUMN requires_reconsent BOOLEAN NOT NULL;
    RAISE NOTICE 'legal_documents.requires_reconsent added: BOOLEAN NOT NULL, no DEFAULT, 0 rows backfilled';
  END IF;
END $$;

COMMENT ON COLUMN legal_documents.requires_reconsent IS
  'Production enforcement metadata (DEC-LEGAL-06): does publishing this version require existing users to consent again? NOT a legal determination of materiality. Must be supplied explicitly at publish; no DEFAULT by design.';

-- ---------------------------------------------------------------------------
-- Immutability trigger —— 把 requires_reconsent 納入白名單
-- ---------------------------------------------------------------------------
-- 與 20260827_legal_document_registry.sql 的版本相同，只多守一個欄位。
-- 一旦 published，這一版的 re-consent 決定就是既成事實：改它等於事後改寫
-- 「當時是否要求重新同意」，而使用者的同意證據正是對著那個事實產生的。

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
       OR NEW.requires_reconsent IS DISTINCT FROM OLD.requires_reconsent
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

-- 驗證（執行後）：
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'legal_documents' AND column_name = 'requires_reconsent';
--   -->  requires_reconsent | boolean | NO | (null)
--
--   SELECT COUNT(*) FROM legal_documents;   -->  0
--
-- 本 migration **不發布任何法律文件、不寫入任何 legal_documents 列、
-- 不接線 production consent**。Gate 5 consent wiring 維持 NOT ACTIVATED。
