-- Order Item — 獨立授權狀態與履約版本快照（P1-09 Wave 1 foundation）
--
-- 目標：把「買家對某教材的存取權」從『訂單狀態的推導結果』變成
-- **order_items 上可獨立記錄與撤銷的狀態**，並讓每一筆品項能記住
-- **當初實際交付的是哪一個檔案版本**。
--
-- 為什麼是 foundation（而不是等 PRE-03 外部驗證）：
--   這兩件事與「平台到底是出賣人還是居間」的法律答案**無關** ——
--   無論最終定性為何，都必須能停止單一買家的存取，也都必須知道
--   某筆訂單當初交付了什麼。Marketplace 模式下反而更需要。
--   規格見 docs/PRE-03_PRE-04_P1-09_A-P_v1.8_Full_Baseline.md 的
--   Deployment Gate 7 / Gate 14 與 K7 ENTITLEMENT-RETENTION-INVARIANT。
--
-- 安全性：
--   * 只做加法（ADD COLUMN / ADD CONSTRAINT），沒有任何欄位或列被刪除。
--   * **完全不動 `orders`** —— 特別是 `orders.paid_at`。它目前的語意是
--     「Admin 核准時間」，且被 adminDashboard/adminTrends 當作營收認列日期。
--     本次不新增、不改名、不改義。
--   * **完全不動訂單狀態機**（`orders.status`）。
--     Gate 14 明文禁止以 `orders.status` 表達授權撤銷。
--   * 既有列的 `entitlement_status` 一律為 `'active'`（欄位預設），
--     因此**所有既有買家的下載權完全不變**。
--   * `fulfilled_material_version_id` 對既有列為 NULL —— 那是合法的 legacy 狀態
--     （這些訂單成立時系統尚未記錄履約版本），**不回填猜測值**。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js，正常啟動即會套用。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- 前置條件：material_files 必須存在（20260823_material_file_storage.sql）。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'material_files'
  ) THEN
    RAISE EXCEPTION 'ABORT: material_files not found; run 20260823_material_file_storage.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. 獨立的授權狀態（Gate 14）
-- ---------------------------------------------------------------------------
--   active          正常，可交付
--   suspended       暫停交付，可恢復（爭議處理中、付款異常等）
--   revoked_pending  因退款／解除／法律流程暫停，仍可能恢復或需稽核
--   revoked_final   流程已完結，平台確定不再恢復此買家的存取
--
-- **revoke 的語意是「暫停未來交付」，不是刪除授權紀錄。**
-- 即使 revoked_final，該列仍必須保留（稽核與爭議舉證），
-- 且不代表其指向的教材檔案即可回收。

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS entitlement_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_suspended_at TIMESTAMP;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_suspended_by TEXT REFERENCES users(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_suspension_reason TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_restored_at TIMESTAMP;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_restored_by TEXT REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_entitlement_status_check'
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_entitlement_status_check
      CHECK (entitlement_status IN ('active', 'suspended', 'revoked_pending', 'revoked_final'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. 履約版本快照（Gate 7 / PRE-04.1）
-- ---------------------------------------------------------------------------
-- 這張表已經有 title_snapshot / price_snapshot —— 「下單當時狀態」的快照慣例
-- 本來就在這裡，只是缺了「交付了哪個檔案版本」。
--
-- ON DELETE RESTRICT 是刻意的：它是 K7 ENTITLEMENT-RETENTION-INVARIANT 在
-- DB 層的表達 —— 只要還有訂單品項指向某個檔案版本，該版本就不得被實體刪除。
-- 需要停止提供某個版本時，正確做法是把 material_files.status 設為 'revoked'
-- （該狀態已存在），而不是刪除列。

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfilled_material_version_id TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;

-- 明確命名：bootstrapModel 的 idempotent 版本用同一個名字，
-- 否則兩條套用路徑會產生不同的約束名稱（PG 自動命名 vs 手動命名）。
DO $$
BEGIN
  ALTER TABLE order_items
    ADD CONSTRAINT order_items_fulfilled_version_fkey
    FOREIGN KEY (fulfilled_material_version_id) REFERENCES material_files(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. quantity 下限
-- ---------------------------------------------------------------------------
-- 只加「不得為 0 或負數」這個無爭議的下限。
--
-- **這不是 E2-A。** E2-A（同一買家不得就同一教材重複購買取得第二份授權）
-- 是**跨訂單**的規則，無法以單列 CHECK 表達，屬於建立訂單路徑的檢查，
-- 且其查詢條件正是本次新增的 entitlement_status。留待 Wave 2。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_positive_check'
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive_check
      CHECK (quantity >= 1);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. 索引
-- ---------------------------------------------------------------------------
-- 下載授權查詢會加上 entitlement_status 條件；既有索引以 order_id / material_id
-- 為主，這裡補一個部分索引，讓「非 active 的品項」可被快速盤點（稽核用）。

CREATE INDEX IF NOT EXISTS idx_order_items_entitlement_not_active
  ON order_items (entitlement_status)
  WHERE entitlement_status <> 'active';

COMMIT;
