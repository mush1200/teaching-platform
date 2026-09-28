-- COR-09 —— 上架價格的 DB 層保證（`DEC-34` 整數 TWD ＋ `DEC-39` 最低 NT$30）
--
-- 這支 migration 做三件事，且**全部 fail-closed**：
--
--   1. `materials.price` 型別收斂為 `INTEGER`（`NUMERIC` 會讓小數價格在 DB 層可表達）
--   2. 移除 `DEFAULT 0`（「忘記給價格」不該靜默變成違反 `DEC-39` 的 0 元教材）
--   3. 加上 `materials_price_min_check CHECK (price >= 30)`
--
-- ## **絕不正規化既有資料**
--
-- 若有任何列違反政策，本 migration **RAISE EXCEPTION 並整個 rollback**，
-- **不會** floor／round／clamp／coerce 任何一列。歷史價格是商業事實，
-- 要改必須是人看過、記錄過的明示決定，不能由一支 migration 順手決定。
--
-- ## 本 migration 不依賴「有人記得跑過 census」
--
-- 驗證條件寫在 migration 內部，**每次執行都會重新檢查**。
-- 先前的 census 結果只是證據，不是前提。
--
-- ## 冪等
--
-- 型別、DEFAULT、約束三者都先檢查現況再動作；重跑無副作用、不報錯。
--
-- ## 對應
--
--   canonical schema : db/db_schema.sql（materials.price ＋ materials_price_min_check）
--   runtime bootstrap: Backend/models/bootstrapModel.js（同一段邏輯）
--   application policy: Backend/utils/listingPricePolicy.js（唯一判斷來源）
--   census tool      : Backend/scripts/listing-price-census.js（read-only）

BEGIN;

DO $$
DECLARE
  expected_db text := current_database();
  current_type text;
  bad_rows bigint;
BEGIN
  RAISE NOTICE 'COR-09 migration target database: %', expected_db;

  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'price';

  IF current_type IS NULL THEN
    RAISE EXCEPTION 'COR-09: materials.price not found — wrong database or schema not provisioned';
  END IF;

  -- ── 驗證先於任何變更 ─────────────────────────────────────────────
  SELECT count(*) INTO bad_rows
  FROM materials
  WHERE price IS NULL
     OR price <> trunc(price)
     OR price < 30;

  IF bad_rows > 0 THEN
    RAISE EXCEPTION
      'COR-09: % materials row(s) violate the listing price policy (integer TWD and >= 30). Aborting without any conversion.',
      bad_rows
      USING HINT = 'Run: node scripts/listing-price-census.js --samples — then reconcile explicitly. This migration will never normalise rows for you.';
  END IF;

  RAISE NOTICE 'COR-09: 0 violating rows — safe to converge schema';

  -- ── 1. 型別 ─────────────────────────────────────────────────────
  IF current_type <> 'integer' THEN
    RAISE NOTICE 'COR-09: converting materials.price from % to integer', current_type;
    ALTER TABLE materials ALTER COLUMN price TYPE INTEGER USING price::integer;
  ELSE
    RAISE NOTICE 'COR-09: materials.price already integer';
  END IF;

  -- ── 2. DEFAULT ──────────────────────────────────────────────────
  ALTER TABLE materials ALTER COLUMN price DROP DEFAULT;
  ALTER TABLE materials ALTER COLUMN price SET NOT NULL;

  -- ── 3. CHECK ────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_price_min_check'
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT materials_price_min_check CHECK (price >= 30);
    RAISE NOTICE 'COR-09: materials_price_min_check added';
  ELSE
    RAISE NOTICE 'COR-09: materials_price_min_check already present';
  END IF;
END $$;

COMMIT;
