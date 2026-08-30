-- 人工銀行退款的執行紀錄（P1-09 Wave 2 #5 / Gate 14）。
--
-- Wave 2 #3 建立了案件容器與狀態機，但「完成」這一步的**證據強度不足**：
-- `transition({ toStatus: 'completed' })` 可以在**完全沒有任何付款證據**的情況下
-- 把案件標成完成，`refund_reference` 是可選的，而且沒有任何欄位記錄
-- 「實際退了多少錢」（`approved_amount` 是核准金額，不是執行金額）。
--
-- **為什麼不另建 execution table：**
-- Phase 1 的人工銀行退款與案件是 **1:1** 的 —— 一個案件執行一次退款，
-- 沒有分期、沒有多筆沖銷、沒有 payment provider 的重試與 webhook。
-- 另建表只會讓「這筆退款屬於哪個案件」多一層 join，卻換不到任何表達力。
-- 等到出現「一個案件多筆退款」或「真的接了金流服務」時再拆，
-- 那時的形狀才知道。現在拆是為未知的形狀猜結構。
--
-- 因此本 migration 只補**案件表缺的最小欄位**，並把
-- 「已核准」「已執行」「憑證已沖銷」三件事在 DB 層釘死成不同事件。

DO $$ BEGIN
  IF current_database() <> 'teaching_platform_security_test'
     AND current_database() <> 'teaching_platform' THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

-- 實際退出去的金額。**與 `approved_amount` 分離** ——
-- 核准 1000 元、實際只退了 800 元（例如部分補救）是真實會發生的事，
-- 用同一個欄位表示會讓對帳無法回答「差額去哪了」。
ALTER TABLE refund_remedy_cases
  ADD COLUMN IF NOT EXISTS refund_amount INTEGER;

DO $$ BEGIN
  ALTER TABLE refund_remedy_cases
    ADD CONSTRAINT rrc_refund_amount_positive CHECK (refund_amount IS NULL OR refund_amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 實退不得超過核准；且 `approved_amount IS NULL`（＝非金錢補救）時
-- **根本不得有銀行退款金額**。
DO $$ BEGIN
  ALTER TABLE refund_remedy_cases
    ADD CONSTRAINT rrc_refund_within_approved CHECK (
      refund_amount IS NULL
      OR (approved_amount IS NOT NULL AND refund_amount <= approved_amount)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Phase 1 只有一種退款方式：人工銀行匯回。
-- 沒有金流服務，也沒有第二條管道 —— 讓它成為 free text 只會在稽核時
-- 出現 'manual_bank' / 'bank' / '匯款' 三種寫法指同一件事。
DO $$ BEGIN
  ALTER TABLE refund_remedy_cases
    ADD CONSTRAINT rrc_refund_method_check CHECK (
      refund_method IS NULL OR refund_method = 'manual_bank_transfer'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- **執行證據是原子的。** 四個欄位要嘛全部為 NULL（尚未執行），
-- 要嘛全部具備且案件已 `completed`。
-- 這條擋掉的是「先標 completed，之後再補 payment reference」——
-- 那會讓帳上出現一段「宣稱已退款但拿不出憑據」的期間。
DO $$ BEGIN
  ALTER TABLE refund_remedy_cases
    ADD CONSTRAINT rrc_refund_execution_atomic CHECK (
      (refund_paid_at IS NULL AND refund_reference IS NULL
         AND refund_amount IS NULL AND refund_method IS NULL)
      OR (refund_paid_at IS NOT NULL AND refund_reference IS NOT NULL
         AND refund_amount IS NOT NULL AND refund_method IS NOT NULL
         AND status = 'completed')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 反向：已核准**金錢**退款的案件，不得在沒有付款證據的情況下被標成完成。
-- 非金錢補救（`approved_amount IS NULL`，例如重新交付）不受此限 ——
-- 它本來就沒有銀行退款可執行。
DO $$ BEGIN
  ALTER TABLE refund_remedy_cases
    ADD CONSTRAINT rrc_cash_completion_requires_evidence CHECK (
      status <> 'completed' OR approved_amount IS NULL OR refund_paid_at IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 對帳用：找出「已執行的退款」是一句 SQL。
CREATE INDEX IF NOT EXISTS idx_rrc_executed
  ON refund_remedy_cases (refund_paid_at DESC) WHERE refund_paid_at IS NOT NULL;

COMMIT;

-- **刻意沒有加的東西：**
--
--   * `tax_reversal_status` —— schema 尚無任何稅務欄位，`P14` 的憑證沖銷流程
--     其決策樹待會計師確認（External Tax Gate `PENDING`）。
--     為未知形狀的流程預留欄位只會猜錯。
--   * Buyer 退款收款帳戶（銀行／帳號／戶名）—— repo 目前**完全沒有**這類資料
--     （`manual_payment_proofs.reported_bank_name` / `reported_account_last4`
--     是買家申報的**付款來源**末四碼，不是退款目的地，且刻意只存末四碼）。
--     為了退款而開始蒐集完整銀行帳號會直接擴大個資範圍並產生新的保存義務，
--     而保存年限尚未定案（`RM-03`／`L-21` 皆 `PENDING`）。
--     Phase 1 的人工退款由 Admin 在行外完成，系統只保存足以稽核的
--     金額／方式／時間／交易參考／執行者。
--   * Creator clawback / payout adjustment —— `P10` ledger 不存在。
