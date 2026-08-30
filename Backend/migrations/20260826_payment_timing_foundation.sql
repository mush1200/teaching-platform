-- 付款／核帳時間模型分離（P1-09 Wave 1 #2 foundation — Gate 6 / Gate 11）
--
-- 目標：把目前混在一起的「付款相關時間」拆成四個彼此獨立、語意明確的欄位。
--
-- 為什麼需要拆：
--   `orders.paid_at` 目前記錄的是 **Admin 核准的時間**（`routes/admin.js` 是唯一寫入點：
--   核准憑證時 `paid_at = NOW()`），而且它被 adminDashboard / adminTrends /
--   teacherSales 當作**營收認列日期**。
--   它**不是**銀行實際入帳時間，因此不能拿來當稅務上的收款時點；
--   它也不是「平台何時知道買家已付款」，因此不能拿來起算人工審核 SLA。
--
--   四個時間的正式語意：
--     orders.payment_due_at              Buyer 該訂單最晚付款期限
--     orders.payment_info_submitted_at   Buyer 向平台提交付款辨識資訊的時間
--     orders.review_due_at               平台人工付款審核期限
--     orders.payment_received_at         平台銀行帳戶**實際**收到款項的時間
--     orders.paid_at                     **維持既有語意不變**（Admin 核准相關時間戳）
--
-- 安全性：
--   * 只做加法（ADD COLUMN），沒有任何欄位或列被刪除、改名或改義。
--   * **`orders.paid_at` 完全不動** —— 不 rename、不 backfill、不改寫入點、
--     不改任何既有的 revenue / reporting query。
--   * **`orders.status` 狀態機完全不動。**
--   * 歷史列的 `payment_received_at` **一律保持 NULL**。
--     絕不做 `payment_received_at = paid_at` 這種回填 ——
--     那會製造「系統宣稱知道銀行何時入帳」的**假歷史證據**，
--     而事實是這件事從來沒有被記錄過。
--   * `payment_due_at` / `review_due_at` 同樣保持 NULL：
--     期限的**數值**（幾小時／幾天）尚未由產品拍板
--     （baseline `§3.1` / `§7`：VALUE PENDING PRODUCT DECISION），
--     本次只建立欄位與寫入能力，**不自行發明數字**。
--
-- 為什麼期限要「存下來」而不是每次即時計算：
--   期限是**對買家揭露過的承諾**（消保法 §18 I(2) 要求揭露付款期日與交付期日）。
--   若日後政策調整，既有訂單必須維持當初承諾的期限，不得追溯變動。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js，正常啟動即會套用。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. orders — 四個獨立時間欄位
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_info_submitted_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMP;

-- `payment_received_at` 是「已經發生的事」，不可能在未來。
-- 這道 CHECK 的用意是擋掉「拿系統當下時間硬填」之類的錯誤寫入。
-- 允許 NULL（歷史列與尚未核帳的訂單都是 NULL）。
DO $$
BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_payment_received_not_future_check
    CHECK (payment_received_at IS NULL OR payment_received_at <= NOW() + INTERVAL '1 day');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 稽核用：找出「已收款但尚未核准」與「審核逾時」的訂單。
CREATE INDEX IF NOT EXISTS idx_orders_review_due_at
  ON orders (review_due_at)
  WHERE review_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_due_at
  ON orders (payment_due_at)
  WHERE payment_due_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. manual_payment_proofs — 結構化的付款辨識資訊
-- ---------------------------------------------------------------------------
-- baseline `§2.1` 要求 Buyer 回填匯款銀行／帳號後四碼／金額／必要時匯款時間，
-- 但目前系統**只有憑證影像**，沒有任何結構化欄位 —— 人工核帳完全依賴影像判讀。
--
-- 欄位放在 `manual_payment_proofs` 而不是 `orders`：
--   一筆訂單可能有多次提交（退件後重新上傳），每次申報的內容可能不同，
--   而那個歷程本身就是爭議處理的證據。
--
-- **`reported_` 前綴是刻意的**：這些是**買家自行申報**的值，不是平台查證後的事實。
-- 兩者不得混用 —— 尤其在付款爭議中，平台不得把自己的紀錄當成唯一認定依據
-- （網路交易定型化契約不得記載事項第七點）。
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_bank_name TEXT;
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_account_last4 TEXT;
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_amount INTEGER;
ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_transfer_at TIMESTAMP;

DO $$
BEGIN
  ALTER TABLE manual_payment_proofs ADD CONSTRAINT mpp_reported_last4_check
    CHECK (reported_account_last4 IS NULL OR reported_account_last4 ~ '^[0-9]{4}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE manual_payment_proofs ADD CONSTRAINT mpp_reported_amount_check
    CHECK (reported_amount IS NULL OR reported_amount > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
