-- Payment Proof Private Storage（P1 security hardening）
--
-- 付款憑證從公開的 `Backend/uploads/payment-proofs/`（由 express.static 服務）
-- 移到 `private-storage/payment-proofs/`，只能經授權端點讀取。
--
-- 這支 migration 只動 **schema**：新增 metadata 欄位、放寬 `proof_url` 的 NOT NULL、
-- 加上完整性約束。**實體檔案的搬移與 `storage_key` 回填由**
-- `Backend/scripts/migrate-payment-proofs-to-private.js` **負責**（它要讀寫檔案系統、
-- 驗 checksum，不是 SQL 能做的事）。兩者的順序是：先跑這支，再跑那支。
--
-- 執行前請先 backup（見 docs/db-backup-and-migration.md）。
--
--   psql -v ON_ERROR_STOP=1 -d <target-db> -f Backend/migrations/20260823_payment_proof_private_storage.sql

BEGIN;

-- 目標資料庫 assertion（CLAUDE.md §4）。要套到 security test DB 時改成
-- 'teaching_platform_security_test'，或用 psql -v 傳入後改寫這一段。
DO $$
BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

/*
 * 私有儲存的指標與完整性 metadata。
 *
 * 一筆 `manual_payment_proofs` 本來就等於一張圖（`POST /orders/:id/payment-proof`
 * 每個檔案插一列），所以**不需要新表**，欄位直接加在既有列上。
 *
 *   storage_key      opaque key（`payment-proofs/<uuid>`）。不進 API 回應、不進 log。
 *   checksum_sha256  上傳時計算；legacy 搬移時用來驗證位元組一致。
 *   uploaded_by      上傳者。舊資料沒有這個事實，維持 NULL 而不是猜訂單擁有者
 *                    —— 稽核欄位寧可留空，不可回填成看起來像真的的值。
 */
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS uploaded_by TEXT REFERENCES users(id);

/*
 * storage_status —— 這一列的位元組在哪裡。
 *
 *   private         已在私有儲存（唯一可交付的狀態）
 *   legacy_public   milestone 之前寫進公開 uploads/ 的舊資料，尚未搬移
 *   legacy_external proof_url 指向外部網址（seed / fixture），平台沒有這個檔案
 *   legacy_missing  DB 有指標但磁碟找不到檔案 —— 明確標記，不靜默丟棄
 *
 * 既有列的 DEFAULT 是 `legacy_public`：搬移腳本跑之前，它們確實還在公開目錄。
 * 腳本會把其中指向外部網址的重新分類成 `legacy_external`。
 */
ALTER TABLE manual_payment_proofs
  ADD COLUMN IF NOT EXISTS storage_status TEXT NOT NULL DEFAULT 'legacy_public';

DO $$
BEGIN
  ALTER TABLE manual_payment_proofs
    ADD CONSTRAINT mpp_storage_status_check
    CHECK (storage_status IN ('private', 'legacy_public', 'legacy_external', 'legacy_missing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- `private` 必須真的有 key。少了這條，一個寫錯的 UPDATE 就能產生「宣稱已搬移、
-- 實際讀不到」的列，而那正是最難察覺的失敗。
DO $$
BEGIN
  ALTER TABLE manual_payment_proofs
    ADD CONSTRAINT mpp_private_requires_storage_key
    CHECK (storage_status <> 'private' OR storage_key IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

/*
 * 新的憑證不再有 URL —— `proof_url` 從此只是 legacy 指標。
 * 保留欄位（不 DROP）是因為搬移後它仍是「這一列原本來自哪個公開檔案」的稽核痕跡。
 */
ALTER TABLE manual_payment_proofs ALTER COLUMN proof_url DROP NOT NULL;

-- 同一個私有物件不該被兩列指向：搬移腳本重跑時若不小心重複建立，這裡會直接擋下。
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_payment_proofs_storage_key
  ON manual_payment_proofs(storage_key)
  WHERE storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_storage_status
  ON manual_payment_proofs(storage_status);

COMMIT;
