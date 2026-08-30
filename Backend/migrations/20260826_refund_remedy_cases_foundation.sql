-- 退款／補救案件（P1-09 Wave 2 #3 — Gate 14）
--
-- 目標：讓法定解除、重複付款、履約瑕疵、教材下架、平台未履約等情形
-- 都有一個**可稽核、狀態明確、與訂單狀態機分離**的案件可以承接。
--
-- ## 為什麼不重用 `reports`
--
-- `reports` 在語意上**只是內容檢舉**，不是消費者救濟案件：
--   * `material_id NOT NULL` —— 永遠針對一份教材，**沒有訂單關聯**
--   * `UNIQUE (material_id, reporter_id)` —— 一個人對一份教材只能檢舉一次；
--     但一張訂單本來就可能有多次退款／補救請求
--   * `resolution` 只有 `dismissed` / `warning` / `request_changes` / `unpublish_material`
--     —— 全部是 moderation 結果，**沒有任何金額或財務語意**
--   * owner 是「檢舉人」，不是「買家」
--
-- 把退款案件塞進去會讓兩種完全不同的流程（moderation vs consumer remedy）
-- 共用狀態機與 SLA，語意會立刻崩壞。
--
-- ## 三個刻意的分離
--
--   1. **與 `orders.status` 分離** —— 建立或核准案件**不改動訂單狀態**。
--      本輪完全不碰訂單狀態機。
--   2. **與 entitlement 分離** —— `entitlement_action` 只記錄「這個案件**應該**
--      對授權做什麼」，**不自動執行**。是否暫停或撤銷取決於案件類型與
--      尚未完成的法律／業務決定。
--   3. **與稅務憑證分離** —— 憑證沖銷是 `P14` 的另一條流程，
--      且其三維決策樹尚待會計師填寫。**本輪刻意不加 tax 欄位** ——
--      為一個形狀未知的流程預留欄位，只會猜錯。
--
-- ## `approved` ≠ 退款完成
--
-- 狀態機刻意讓 `approved` 必須再經 `remedy_pending` 才能到 `completed`：
-- 「**責任已核准**」與「**錢真的退了 / 補救真的做了**」是兩件事，
-- 不得用同一個狀態表示。
--
-- 安全性：
--   * 只做加法（CREATE TABLE / INDEX），沒有任何既有欄位或列被更動。
--   * `orders` / `order_items` / `reports` / `materials` 完全不動。
--   * **不做任何 backfill** —— 既有訂單沒有退款案件，那是事實。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS refund_remedy_cases (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  -- 可選：整張訂單的問題（例如重複付款）不指向特定品項。
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  -- 於建立時自訂單帶入。存成事實而非每次 join 推導，
  -- 讓「這個案件屬於誰」成為可直接稽核的欄位。
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- 案件類型即分類原因。**刻意不另設 `reason_code`** ——
  -- 兩個高度重疊的 enum 只會讓語意分裂，也讓查詢時不知道該信哪一個。
  -- 買家自己的描述放在 `buyer_statement`。
  case_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',

  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  review_started_at TIMESTAMP,
  decision_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- 買家未必說得出金額；核准金額只在核准時填。
  requested_amount INTEGER,
  approved_amount INTEGER,

  -- 退款執行的**位置**，本輪不執行任何實際匯款。
  -- Phase 1 的退款是人工銀行匯回（Gate 14 已鎖定不要求自動退款 API）。
  refund_method TEXT,
  refund_reference TEXT,
  refund_paid_at TIMESTAMP,

  buyer_statement TEXT,
  admin_note TEXT,
  evidence_reference TEXT,

  -- 這個案件**應該**對授權做什麼。**不會自動執行** ——
  -- 實際轉移一律經 `services/entitlement.service.js`，由人明示操作。
  entitlement_action TEXT,

  -- 未來與 `P10` Creator 報酬帳的關聯點。目前 `P10` ledger 尚不存在，
  -- 因此**沒有 FK**。一般 post-settlement 退款原則由平台吸收；
  -- Creator 違約的調整是 Creator Agreement 的另一條流程。
  related_creator_adjustment_id TEXT,

  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- 依 baseline `E8` 已鎖定的 Phase 1 救濟情形。不預先建立大量法律 enum。
  CONSTRAINT rrc_case_type_check CHECK (case_type IN (
    'statutory_rescission',        -- 法定解除（是否成立由律師／流程判定，不在此表）
    'duplicate_payment',           -- 重複付款
    'wrong_material',              -- 買 A 得到 B
    'corrupted_or_unusable_file',  -- 檔案損壞或無法使用
    'access_failure',              -- 已付款但無法取得
    'material_takedown',           -- 教材因侵權／違法下架
    'platform_nonperformance',     -- 平台未履約
    'other'
  )),

  CONSTRAINT rrc_status_check CHECK (status IN (
    'requested', 'under_review', 'approved', 'rejected', 'remedy_pending', 'completed', 'cancelled'
  )),

  CONSTRAINT rrc_entitlement_action_check CHECK (
    entitlement_action IS NULL OR entitlement_action IN (
      'no_action', 'suspend', 'restore', 'revoke_pending', 'revoke_final'
    )
  ),

  CONSTRAINT rrc_amounts_positive_check CHECK (
    (requested_amount IS NULL OR requested_amount > 0)
    AND (approved_amount IS NULL OR approved_amount > 0)
  ),

  -- 品項若有指定，必須屬於同一張訂單（app 層另有檢查；這裡擋掉繞過的寫入）。
  CONSTRAINT rrc_item_requires_order CHECK (order_item_id IS NULL OR order_id IS NOT NULL),

  -- **`approved` 不等於錢已退。** 只有 `completed` 才可能帶有實際退款時間。
  CONSTRAINT rrc_refund_paid_requires_completed CHECK (
    refund_paid_at IS NULL OR status = 'completed'
  )
);

-- 「這張訂單有哪些案件」「這個買家的案件」「目前還在處理中的案件」。
CREATE INDEX IF NOT EXISTS idx_rrc_order ON refund_remedy_cases (order_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrc_buyer ON refund_remedy_cases (buyer_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrc_open ON refund_remedy_cases (status)
  WHERE status IN ('requested', 'under_review', 'approved', 'remedy_pending');

COMMIT;
