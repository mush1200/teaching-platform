-- 帳號凍結能力（P1-09 Wave 1 #4 foundation — Gate 1）
--
-- 目標：當平台知悉或合理懷疑帳號遭冒用時，能**立即**停止該帳號產生新的
-- 敏感交易與權利變更，直到完成解凍。
--
-- 法律依據：「零售業等網路交易定型化契約應記載及不得記載事項」應記載事項第十二點 ——
--   「企業經營者應於知悉消費者之帳號密碼被冒用時，**立即暫停該帳號所生交易之
--     處理及後續利用**。」
-- 這是**產品能力**要求，不是條款文字：沒有凍結功能就無法履行。
--
-- 為什麼狀態必須查 DB，不能放進 token：
--   `middlewares/auth.js` 的 `requireAuth` **完全不碰資料庫** —— `req.user` 全部
--   來自已驗簽的 JWT payload。而 JWT 有效期是 7 天。
--   若把凍結狀態塞進 token，凍結最多會延遲 **7 天**才生效，
--   直接違反「立即」的要求。因此檢查必須即時查詢 `users.account_status`。
--
-- 安全性：
--   * 只做加法（ADD COLUMN / CHECK / INDEX），沒有任何既有欄位或列被更動。
--   * 既有使用者一律取得 `account_status = 'active'`（欄位預設），
--     **不會有任何歷史帳號被誤凍結**。
--   * 稽核欄位（`frozen_at` / `frozen_by` / ...）對既有列一律 NULL ——
--     **不 backfill 假的凍結時間**。沒發生過的事就不要記錄。
--   * `orders.status` / `order_items.entitlement_status` / `paid_at` 完全不動。
--     帳號凍結是**與訂單狀態機正交**的維度，不得以訂單狀態代替。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- 兩個狀態就夠了。刻意**不**設計成複雜狀態機 ——
-- Phase 1 需要回答的只有「這個帳號現在能不能產生新的敏感交易」。
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

-- 稽核：誰凍結、何時、為什麼、誰解除、何時解除。
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unfrozen_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unfrozen_by TEXT;

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_account_status_check
    CHECK (account_status IN ('active', 'frozen'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_frozen_by_fkey
    FOREIGN KEY (frozen_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_unfrozen_by_fkey
    FOREIGN KEY (unfrozen_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 凍結的帳號應該很少；部分索引讓「目前有哪些帳號被凍結」可以快速盤點。
CREATE INDEX IF NOT EXISTS idx_users_account_status_not_active
  ON users (account_status)
  WHERE account_status <> 'active';

COMMIT;
