-- `activity_logs` schema drift 收斂（`SCHEMA-01`）。
--
-- ## 問題
--
-- canonical（`db/db_schema.sql` 與 `bootstrapModel.js`）宣告的是：
--
--     id BIGSERIAL PRIMARY KEY, target_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
--
-- 但**兩個實際資料庫**（`teaching_platform` 944 列、`teaching_platform_security_test` 4655 列）
-- 都是：
--
--     id TEXT NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY
--     target_id TEXT NOT NULL
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
--     actor_id TEXT REFERENCES users(id) ON DELETE SET NULL
--
-- `CREATE TABLE IF NOT EXISTS` 永遠不會修正既存表，因此 drift 從未被發現：
-- **全新環境會拿到 BIGSERIAL、既有環境是 UUID，而兩邊都「看起來正常」。**
--
-- ## Canonical 決定：以**既有實況**為準（TEXT UUID）
--
-- 1. **兩個實際資料庫完全一致** —— 不一致的只有文件，不是資料。
-- 2. **轉成 BIGSERIAL 會破壞歷史 identity。** 既有 UUID 沒有可對應的自然序，
--    重新編號等於改寫 5599 列稽核事件的 identity，違反 `CLAUDE.md` §4.4
--    （`activity_logs` 是稽核軌跡，不得為了整理 schema 改寫歷史）。
-- 3. **UUID 是本 repo 的 PK 慣例** —— `reports`、`report_events`、`material_files`、
--    `refund_remedy_cases`、`consumer_complaints` 全部是 `gen_random_uuid()::text`。
--    BIGSERIAL 是唯一的例外。
-- 4. **API 契約早就是字串形狀** —— `adminActivityLogs.service.getLogById()` 用
--    `WHERE l.id::text = $1`，前端把 `log.id` 當 React key 與 URL segment。
-- 5. **沒有任何 FK 參照 `activity_logs`** —— 但這是「轉型無連鎖風險」，不是「應該轉型」的理由。
-- 6. **跨環境可攜性** —— UUID 在環境間備援／合併時不會撞號；sequence 會。
-- 7. **Migration 風險** —— 對齊文件只需改文件與 bootstrap；轉 BIGSERIAL 是全表重寫 ＋ identity 變更。
--
-- ## 這支 migration 對既有環境是 no-op
--
-- 兩個實際資料庫已經是目標形狀，因此下面每一段都會偵測後跳過。
-- 它真正要處理的是**已經用新版 bootstrap 建起來的 BIGSERIAL 環境**
-- （2026-08-26 之前建立的全新環境）。
--
-- BIGINT → TEXT 是**無損**的（`id::text`），列的 identity 不變（"123" 仍指同一列），
-- 因此不違反 §4.4。排序語意的變化不成問題 —— `id` 本來就不得被當成時間
-- （見 `db/db_schema.sql` 與 `utils/activityLog.js` 的說明）。

DO $$ BEGIN
  IF current_database() <> 'teaching_platform_security_test'
     AND current_database() <> 'teaching_platform' THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- 1) id → TEXT ＋ UUID default（既有環境已是此形狀，會跳過）
DO $$
DECLARE
  current_type TEXT;
  seq_name TEXT;
BEGIN
  SELECT data_type INTO current_type
    FROM information_schema.columns
   WHERE table_name = 'activity_logs' AND column_name = 'id';

  IF current_type IS NULL THEN
    RAISE EXCEPTION 'ABORT: activity_logs.id not found';
  END IF;

  IF current_type <> 'text' THEN
    RAISE NOTICE 'activity_logs.id is % — converting to text (lossless: id::text)', current_type;
    -- 先記下 sequence，轉型後它會變成孤兒。
    SELECT pg_get_serial_sequence('activity_logs', 'id') INTO seq_name;

    ALTER TABLE activity_logs ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE activity_logs ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE activity_logs ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;

    IF seq_name IS NOT NULL THEN
      EXECUTE format('DROP SEQUENCE IF EXISTS %s', seq_name);
    END IF;
  ELSE
    RAISE NOTICE 'activity_logs.id already text — no conversion needed';
  END IF;
END $$;

-- 既有環境的 default 可能不同（例如手動建立時漏了）—— 統一補上。
ALTER TABLE activity_logs ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE activity_logs ALTER COLUMN id SET NOT NULL;

-- 2) NOT NULL 對齊。
--    兩個實際資料庫的 `target_id` / `created_at` 都已是 NOT NULL，
--    且既有 5599 列**沒有任何一列**違反（migration 前已實測）。
--    canonical 文件先前誤記為 nullable，`utils/activityLog.js` 也因此留了一條
--    「targetId 缺漏就寫 NULL」的路徑 —— 那條路徑在真實資料庫會直接違反約束。
--    本輪一併把 canonical、DB 與程式碼三者對齊（程式改在 utils/activityLog.js）。
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM activity_logs WHERE target_id IS NULL) THEN
    RAISE EXCEPTION 'ABORT: activity_logs has rows with NULL target_id — resolve before enforcing NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM activity_logs WHERE created_at IS NULL) THEN
    RAISE EXCEPTION 'ABORT: activity_logs has rows with NULL created_at — resolve before enforcing NOT NULL';
  END IF;
END $$;

ALTER TABLE activity_logs ALTER COLUMN target_id SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE activity_logs ALTER COLUMN meta SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN meta SET DEFAULT '{}'::jsonb;

-- 3) actor_id 的 FK（既有環境已有；canonical 文件先前完全沒記載）。
DO $$ BEGIN
  ALTER TABLE activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) 索引（`20260423_day22_activity_logs_indexes.sql` 已建；此處僅確保一致）。
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

COMMIT;

-- **本 migration 不改動任何一列的內容。**
-- 沒有 DELETE、沒有 UPDATE、沒有重新產生 `created_at`、沒有重排事件、
-- 沒有改 actor / action / target / meta。唯一可能變動的是
-- BIGSERIAL 環境的 `id` 表述形式（`123` → `'123'`，identity 不變）。
