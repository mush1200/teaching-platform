-- =============================================================================
-- PRE-18 — Creator settlement core (money engine) — additive schema
--
-- Canonical policy sources: DEC-21…DEC-39（`docs/pending-work-tracker.md` §1.6.0-I (A)）
-- Design: `docs/pre-18-implementation-design-2026-09-27.md`
--
-- ## 這個檔案是 settlement schema 的**唯一可執行來源**
--
-- `Backend/models/settlementSchema.js` 直接讀取本檔並在 bootstrap 執行，
-- 因此 bootstrap 與 migration **不可能漂移**（design §23 風險 4 的結構性消除）。
-- `db/db_schema.sql` 另有一份**文件用**副本，由
-- `Backend/tests/settlementSchemaParity.test.js` 逐 statement 比對。
--
-- ## 完全 additive
--
-- 不改任何既有表的既有欄位，只新增 11 張表 ＋ `orders.refund_window_end`。
-- 全檔冪等：重跑結果相同（`IF NOT EXISTS` ／ `CREATE OR REPLACE` ／
-- `DROP TRIGGER IF EXISTS` 後重建）。
--
-- ## 為什麼 hold 不是 ledger 分錄
--
-- 「先負後正」會讓 hold 期間的 carried balance 顯示為 0，而 `DEC-32` §P3 規定
-- 餘額歸零即重置 ageing —— 那正是 `DEC-33` 明文禁止的。獨立實體 ＋ 自身區間
-- 是唯一同時滿足 `DEC-32` 與 `DEC-33` 的模型。
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- orders.refund_window_end —— `DEC-26` 持久化期限
--
-- **不得**於讀取時以「當時的政策」重算，**不得** backfill 歷史列（`DEC-27` §K1）。
-- 歷史列一律 NULL，legacy 走 reconciliation，不回寫此欄。
-- -----------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_window_end TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 1. payout_cycles —— `DEC-30` 結算期間
--
-- `id` 是 Asia/Taipei 曆月 `YYYY-MM`。cutoff ＝ 該月最後一個日曆日的**末日終了**
-- （`endOfTaiwanDay`）；`payout_due_at` ＝ 次月 15 日的末日終了。
-- 兩者都**持久化**，因為它們是對創作者揭露過的承諾，政策日後調整不得追溯。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_cycles (
  id TEXT PRIMARY KEY,
  starts_at TIMESTAMP NOT NULL,
  cutoff_at TIMESTAMP NOT NULL,
  payout_due_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  closed_at TIMESTAMP,
  closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_cycles_id_format_check CHECK (id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT payout_cycles_status_check CHECK (status IN ('open', 'closed', 'settled')),
  CONSTRAINT payout_cycles_bounds_check CHECK (starts_at < cutoff_at AND cutoff_at < payout_due_at),
  CONSTRAINT payout_cycles_closed_pairing_check CHECK ((status = 'open') = (closed_at IS NULL))
);

-- -----------------------------------------------------------------------------
-- 2. creator_fault_classifications —— `DEC-35`
--
-- 過失**必須**來自正式的、連結案件的決定。`creator_fault = true` 這種單純布林值
-- 不符要求（`DEC-35` §Q8），故 `written_basis` 為 NOT NULL 且不得空白、
-- `reason_code` 為結構化受限值、`decided_by` 為 NOT NULL。
--
-- `result = 'creator_fault'` 時 `creator_id` 必須存在 ——
-- `DEC-36` §R4：過失分類**不能治癒缺失的歸屬**。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_fault_classifications (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  creator_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  result TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  written_basis TEXT NOT NULL,
  evidence_reference TEXT,
  decided_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW(),
  supersedes_id TEXT REFERENCES creator_fault_classifications(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cfc_source_type_check CHECK (source_type IN (
    'refund_remedy_case', 'consumer_complaint', 'report_case', 'manual_case_record'
  )),
  CONSTRAINT cfc_result_check CHECK (result IN ('creator_fault', 'non_creator_fault')),
  CONSTRAINT cfc_reason_code_check CHECK (reason_code IN (
    'statutory_rescission', 'duplicate_payment', 'wrong_material',
    'corrupted_or_unusable_file', 'access_failure', 'material_takedown',
    'platform_nonperformance', 'other'
  )),
  CONSTRAINT cfc_written_basis_not_blank CHECK (btrim(written_basis) <> ''),
  CONSTRAINT cfc_source_id_not_blank CHECK (btrim(source_id) <> ''),
  CONSTRAINT cfc_item_requires_order CHECK (order_item_id IS NULL OR order_id IS NOT NULL),
  CONSTRAINT cfc_fault_requires_creator CHECK (result <> 'creator_fault' OR creator_id IS NOT NULL),
  CONSTRAINT cfc_supersedes_not_self CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);
CREATE INDEX IF NOT EXISTS cfc_source_idx ON creator_fault_classifications (source_type, source_id);
CREATE INDEX IF NOT EXISTS cfc_creator_idx ON creator_fault_classifications (creator_id);
-- 一筆分類最多只能被一筆更正取代（更正軌跡是鏈，不是樹）。
CREATE UNIQUE INDEX IF NOT EXISTS cfc_supersedes_unique
  ON creator_fault_classifications (supersedes_id) WHERE supersedes_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. creator_ledger_entries —— `DEC-38` canonical 名稱
--
-- **append-only 的金額事實**。金額欄位永不 UPDATE／DELETE（trigger 強制）；
-- 更正一律走 reversal 分錄（`DEC-26` §J5）。
--
-- `amount` 是**唯一**的金額欄位：`earning` 列上它就是 creator earnings
-- （`DEC-24`／`DEC-31`），不另設 `creator_earnings` 欄，避免同義欄位漂移。
--
-- `creator_id NOT NULL` 是 invariant 6 成為**結構性**保證的關鍵 ——
-- 未歸屬的金額進 `unattributed_suspense_entries`，永遠進不了這張表（`DEC-36`／`DEC-37`）。
--
-- ⚠️ 期間歸屬（`settlement_cycle_id`）**不在這一層** —— 同一筆 earning 的不同切片
-- 可能於不同期間首次 eligible，單一欄位結構上不足。見 `creator_payable_slices`。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_ledger_entries (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  creator_net_sales INTEGER,
  platform_commission INTEGER,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  fault_classification_id TEXT REFERENCES creator_fault_classifications(id) ON DELETE RESTRICT,
  reverses_entry_id TEXT REFERENCES creator_ledger_entries(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT cle_entry_type_check CHECK (entry_type IN (
    'earning', 'adjustment', 'opening', 'payout_consumption', 'reversal'
  )),
  CONSTRAINT cle_source_type_check CHECK (source_type IN (
    'order', 'refund_remedy_case', 'consumer_complaint',
    'reconciliation_run', 'payout_item', 'manual_case_record'
  )),
  CONSTRAINT cle_source_id_not_blank CHECK (btrim(source_id) <> ''),
  -- invariant 2 —— `amount` 即 creator earnings，故恆等式寫為 amount + commission = net sales
  --
  -- ⚠️ **`opening` 與 `earning` 同受此約束。** `opening` 是對帳產生的**創作者經濟歸屬**
  -- （legacy 期初、或 `DEC-36` 的事後歸屬），不是「一筆沒有來歷的應付餘額」。
  -- 若它只帶 `amount`，`DEC-31` 的 `creator_net_sales` 與 `platform_commission`
  -- 就永久遺失，而 `DEC-37` 明文要求報表須能區分**創作者已歸屬／平台抽成／未歸屬懸記**
  -- 三者 —— 少了 commission，被對帳歸屬的交易會讓平台抽成那一行短報。
  CONSTRAINT cle_attributed_split_check CHECK (
    entry_type NOT IN ('earning', 'opening') OR (
      creator_net_sales IS NOT NULL
      AND platform_commission IS NOT NULL
      AND amount + platform_commission = creator_net_sales
    )
  ),
  -- invariant 13 —— 只有帶歸屬的收益列得有分潤欄位（避免金額語意重載）。
  -- `adjustment`／`reversal`／`payout_consumption` 不是銷售，不得帶。
  CONSTRAINT cle_non_attributed_no_split_check CHECK (
    entry_type IN ('earning', 'opening')
    OR (creator_net_sales IS NULL AND platform_commission IS NULL)
  ),
  -- invariant 7 —— 無 creator_fault 來源即不得有負餘額
  CONSTRAINT cle_negative_requires_fault_check CHECK (
    amount >= 0
    OR entry_type IN ('payout_consumption', 'reversal')
    OR (entry_type = 'adjustment' AND fault_classification_id IS NOT NULL)
  ),
  CONSTRAINT cle_earning_shape_check CHECK (
    entry_type <> 'earning' OR (amount > 0 AND order_id IS NOT NULL AND source_type = 'order')
  ),
  CONSTRAINT cle_opening_shape_check CHECK (
    entry_type <> 'opening'
    OR (amount > 0 AND order_item_id IS NOT NULL AND source_type = 'reconciliation_run')
  ),
  CONSTRAINT cle_payout_consumption_shape_check CHECK (
    entry_type <> 'payout_consumption' OR (amount < 0 AND source_type = 'payout_item')
  ),
  CONSTRAINT cle_reversal_requires_target_check CHECK (
    entry_type <> 'reversal' OR reverses_entry_id IS NOT NULL
  ),
  CONSTRAINT cle_reverses_not_self_check CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id),
  CONSTRAINT cle_item_requires_order_check CHECK (order_item_id IS NULL OR order_id IS NOT NULL)
);
-- invariant 3 —— 每訂單每創作者不得重複 earning
CREATE UNIQUE INDEX IF NOT EXISTS cle_one_earning_per_order_creator
  ON creator_ledger_entries (order_id, creator_id) WHERE entry_type = 'earning';
-- invariant 4 —— legacy opening 分錄不得重複（`DEC-27` §K8：bootstrap 每次啟動都跑）
CREATE UNIQUE INDEX IF NOT EXISTS cle_one_opening_per_order_item
  ON creator_ledger_entries (order_item_id) WHERE entry_type = 'opening';
-- 一筆分錄最多只能被沖正一次
CREATE UNIQUE INDEX IF NOT EXISTS cle_one_reversal_per_entry
  ON creator_ledger_entries (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cle_creator_idx ON creator_ledger_entries (creator_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS cle_order_idx ON creator_ledger_entries (order_id);

-- -----------------------------------------------------------------------------
-- 4. creator_payable_slices —— 結算／資格／ageing 的單位
--
-- 分錄記「賺了多少」，切片記「這筆錢在結算上如何被對待」。
--
-- `DEC-31` 把 earning 分錄固定在**每創作者 × 每訂單**；`DEC-28` 允許 hold 落在
-- **每品項**、甚至品項內的**部分金額**。因此一筆分錄的不同部分可以有不同的 hold
-- 狀態，進而有不同的 ageing（`DEC-33` §P7a 明文要求各自保留、§P7b 禁止塌縮成
-- 單一計數器）。**分錄層級無法表達，必須有切片。**
--
-- `order_item_id IS NULL` 的 residue 切片承接 `DEC-31` 分錄層級取整後的 ≤ NT$1 差額。
-- **residue 切片永遠不可被 hold** —— 它不歸屬任何品項，故任何品項層級的爭議都碰不到它。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_payable_slices (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  ledger_entry_id TEXT NOT NULL REFERENCES creator_ledger_entries(id) ON DELETE RESTRICT,
  parent_slice_id TEXT REFERENCES creator_payable_slices(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  settlement_cycle_id TEXT REFERENCES payout_cycles(id) ON DELETE RESTRICT,
  split_in_cycle_id TEXT REFERENCES payout_cycles(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cps_amount_positive_check CHECK (amount > 0),
  CONSTRAINT cps_child_requires_split_cycle_check CHECK (
    parent_slice_id IS NULL OR split_in_cycle_id IS NOT NULL
  ),
  CONSTRAINT cps_not_own_parent_check CHECK (parent_slice_id IS NULL OR parent_slice_id <> id)
);
-- root 切片以品項為身分；再分割後同一品項會有多個子切片，故 UNIQUE 僅適用 root。
CREATE UNIQUE INDEX IF NOT EXISTS cps_root_unique_per_item
  ON creator_payable_slices (ledger_entry_id, order_item_id)
  WHERE parent_slice_id IS NULL AND order_item_id IS NOT NULL;
-- 每筆分錄至多一個 residue root 切片。
CREATE UNIQUE INDEX IF NOT EXISTS cps_root_residue_unique
  ON creator_payable_slices (ledger_entry_id)
  WHERE parent_slice_id IS NULL AND order_item_id IS NULL;
CREATE INDEX IF NOT EXISTS cps_entry_idx ON creator_payable_slices (ledger_entry_id);
CREATE INDEX IF NOT EXISTS cps_parent_idx ON creator_payable_slices (parent_slice_id);
CREATE INDEX IF NOT EXISTS cps_item_idx ON creator_payable_slices (order_item_id);
CREATE INDEX IF NOT EXISTS cps_cycle_idx ON creator_payable_slices (settlement_cycle_id);

-- -----------------------------------------------------------------------------
-- 5. settlement_holds —— `DEC-28` attribution-first 三層階梯
--
-- `creator_id` **刻意不在這張表** —— 一個 order-scope hold 可涵蓋多位創作者，
-- 由 allocation 逐筆指向切片決定受影響者。把 creator 放在 hold 主表會種下
-- 「一個 hold 只能有一個創作者」的錯誤假設。
--
-- `order_id NOT NULL`：`DEC-28` (3) 的帳號層級案件**不得**自動 hold，必須由 Admin
-- 明示指認受影響訂單後才建立 —— 因此每一筆 hold 都一定指得出訂單。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlement_holds (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  scope TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  opened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  released_at TIMESTAMP,
  released_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  release_reason TEXT,
  CONSTRAINT sh_scope_check CHECK (scope IN ('item', 'order', 'manual')),
  CONSTRAINT sh_source_type_check CHECK (source_type IN (
    'refund_remedy_case', 'consumer_complaint', 'report_case', 'manual_case_record'
  )),
  CONSTRAINT sh_item_scope_check CHECK (scope <> 'item' OR order_item_id IS NOT NULL),
  CONSTRAINT sh_order_scope_check CHECK (scope <> 'order' OR order_item_id IS NULL),
  CONSTRAINT sh_reason_not_blank_check CHECK (btrim(reason) <> ''),
  CONSTRAINT sh_source_id_not_blank_check CHECK (btrim(source_id) <> ''),
  CONSTRAINT sh_release_pairing_check CHECK (
    (released_at IS NULL AND release_reason IS NULL)
    OR (released_at IS NOT NULL AND release_reason IS NOT NULL AND btrim(release_reason) <> '')
  )
);
CREATE INDEX IF NOT EXISTS sh_order_idx ON settlement_holds (order_id);
CREATE INDEX IF NOT EXISTS sh_open_idx ON settlement_holds (released_at) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS sh_source_idx ON settlement_holds (source_type, source_id);

-- -----------------------------------------------------------------------------
-- 6. settlement_hold_allocations —— hold 究竟凍結了「哪一個切片、多少錢」
--
-- scope 推導**不足**：`DEC-31` 的分錄是訂單層級，`DEC-28` 的 hold 是品項層級，
-- 因此無法從 scope 推出「這筆分錄的 240 之中有多少被凍結」。必須明確記錄。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlement_hold_allocations (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  hold_id TEXT NOT NULL REFERENCES settlement_holds(id) ON DELETE RESTRICT,
  payable_slice_id TEXT NOT NULL REFERENCES creator_payable_slices(id) ON DELETE RESTRICT,
  held_amount INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT sha_amount_positive_check CHECK (held_amount > 0),
  CONSTRAINT sha_unique_hold_slice UNIQUE (hold_id, payable_slice_id)
);
CREATE INDEX IF NOT EXISTS sha_slice_idx ON settlement_hold_allocations (payable_slice_id);

-- -----------------------------------------------------------------------------
-- 7. unattributed_suspense_entries —— `DEC-37` 未歸屬懸記
--
-- **刻意不放進 ledger** —— `creator_id NOT NULL` 正是讓 invariant 6 成為結構性
-- 保證的機制；改成可空會重新打開 `DEC-36` 所要防的失效模式。
--
-- 懸記反映**歸屬未決**，不是所有權已定。最終會計／法律處置為外部事項（`O19`），
-- 本表只保證金額可明確識別、可稽核、且永不呈現為創作者應付。
--
-- ## 為什麼存 `net_amount` 而不是已經切好的 80％
--
-- `DEC-37` 明文禁止把未歸屬金額「**自動視為平台抽成或平台所有之收入**」。
-- 在創作者未知之前就先算出一筆 platform commission，等於對這筆錢的歸屬先下了結論。
-- 因此本表保存的是**無爭議的經濟事實** —— 該品項分攤折扣後的 `item_net_amount`
-- （也就是「若日後歸屬成立，該創作者的 `creator_net_sales`」）。
-- 80／20 的切分於**對帳歸屬成立時**才發生，那時 `DEC-24` 的基數才真正存在。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unattributed_suspense_entries (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  -- 折扣分攤後的品項淨額（`DEC-23`）。**不是**創作者應付，**不是**平台抽成。
  net_amount INTEGER NOT NULL,
  cycle_id TEXT REFERENCES payout_cycles(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'open',
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  note TEXT,
  resolved_entry_id TEXT REFERENCES creator_ledger_entries(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMP,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  evidence_reference TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT use_net_amount_positive_check CHECK (net_amount > 0),
  CONSTRAINT use_state_check CHECK (state IN ('open', 'resolved')),
  CONSTRAINT use_source_type_check CHECK (source_type IN ('order', 'reconciliation_run')),
  CONSTRAINT use_resolved_pairing_check CHECK (
    (state = 'resolved') = (resolved_entry_id IS NOT NULL)
  ),
  CONSTRAINT use_resolved_timestamp_check CHECK (
    (state = 'resolved') = (resolved_at IS NOT NULL)
  ),
  CONSTRAINT use_unique_order_item UNIQUE (order_item_id)
);
CREATE INDEX IF NOT EXISTS use_state_idx ON unattributed_suspense_entries (state);

-- -----------------------------------------------------------------------------
-- 8. creator_cycle_statements —— 物化的結算快照（**非權威**）
--
-- 權威永遠是 ledger ＋ hold 歷程；本表是 checked cache，任何時候都可重算驗證。
-- 絕不得成為金額歷史的權威來源。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_cycle_statements (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  cycle_id TEXT NOT NULL REFERENCES payout_cycles(id) ON DELETE RESTRICT,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opening_balance INTEGER NOT NULL,
  earnings INTEGER NOT NULL,
  adjustments INTEGER NOT NULL,
  held_amount INTEGER NOT NULL,
  eligible_balance INTEGER NOT NULL,
  ageing_qualified BOOLEAN NOT NULL,
  ageing_cycles_before INTEGER NOT NULL,
  ageing_cycles_after INTEGER NOT NULL,
  payout_triggered_reason TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT ccs_unique_cycle_creator UNIQUE (cycle_id, creator_id),
  CONSTRAINT ccs_trigger_reason_check CHECK (payout_triggered_reason IN (
    'threshold', 'six_cycle_override', 'termination', 'none'
  )),
  CONSTRAINT ccs_held_non_negative_check CHECK (held_amount >= 0),
  CONSTRAINT ccs_ageing_non_negative_check CHECK (
    ageing_cycles_before >= 0 AND ageing_cycles_after >= 0
  )
);

-- -----------------------------------------------------------------------------
-- 9. payout_items —— `DEC-29`／`DEC-30`
--
-- 刻意**不設** `payout_batches`：一位創作者於一個期間只收一筆款；重試是 item 的
-- 狀態而非新批次；且依 `DEC-30` §N6，事後才解除 hold 的金額歸入下一期間，
-- 因此已關閉的期間內不可能出現第二個批次。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_items (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  cycle_id TEXT NOT NULL REFERENCES payout_cycles(id) ON DELETE RESTRICT,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  trigger_reason TEXT NOT NULL,
  bank_reference TEXT,
  paid_at TIMESTAMP,
  paid_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  notified_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pi_unique_cycle_creator UNIQUE (cycle_id, creator_id),
  CONSTRAINT pi_amount_positive_check CHECK (amount > 0),
  CONSTRAINT pi_status_check CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  CONSTRAINT pi_trigger_reason_check CHECK (trigger_reason IN (
    'threshold', 'six_cycle_override', 'termination'
  )),
  -- 「已付」必須留下可稽核的行外憑據 —— 系統不匯錢，這是唯一的證據。
  CONSTRAINT pi_paid_requires_evidence_check CHECK (
    status <> 'paid'
    OR (paid_at IS NOT NULL AND bank_reference IS NOT NULL AND btrim(bank_reference) <> '')
  ),
  CONSTRAINT pi_unpaid_has_no_paid_at_check CHECK (status = 'paid' OR paid_at IS NULL)
);
CREATE INDEX IF NOT EXISTS pi_cycle_idx ON payout_items (cycle_id);
CREATE INDEX IF NOT EXISTS pi_creator_idx ON payout_items (creator_id);

-- -----------------------------------------------------------------------------
-- 10. payout_allocations —— 撥款究竟消耗了「哪一個切片、多少錢」
--
-- 使五件事成為可證明的**資料**而非報表推論：哪個切片被消耗、消耗多少、
-- 切片是否完全消滅（＝`DEC-32` §P3 的 ageing reset 條件）、沖抵順序、事後稽核。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_allocations (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  payout_item_id TEXT NOT NULL REFERENCES payout_items(id) ON DELETE RESTRICT,
  payable_slice_id TEXT NOT NULL REFERENCES creator_payable_slices(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pa_amount_positive_check CHECK (amount > 0),
  CONSTRAINT pa_unique_item_slice UNIQUE (payout_item_id, payable_slice_id)
);
CREATE INDEX IF NOT EXISTS pa_slice_idx ON payout_allocations (payable_slice_id);

-- -----------------------------------------------------------------------------
-- 11. reconciliation_runs —— `DEC-27` 三階段對帳
--
-- A. read-only census（無寫入）／B. decision（逐例外記錄處置）／C. write。
-- 冪等由 ledger 的 partial UNIQUE（opening 每品項一筆）與 suspense 的
-- `UNIQUE (order_item_id)` 保證，**不靠 run 本身的去重**。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  run_scope TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  started_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT rr_run_scope_not_blank_check CHECK (btrim(run_scope) <> ''),
  CONSTRAINT rr_phase_check CHECK (phase IN ('census', 'decision', 'write')),
  CONSTRAINT rr_status_check CHECK (status IN ('running', 'completed', 'failed')),
  CONSTRAINT rr_completed_pairing_check CHECK (
    (status = 'running') = (completed_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS rr_scope_idx ON reconciliation_runs (run_scope, started_at DESC, id DESC);

-- =============================================================================
-- Trigger-enforced invariants
--
-- 能落為 row CHECK 的已落在上面。以下是**跨列**的不變條件，CHECK 表達不了。
-- 分工：
--   * 立即（BEFORE INSERT）—— 「不得超過」類，fail fast，錯誤訊息指得出違反哪一條；
--   * 延後（CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED）—— 「精確加總相等」類，
--     必須等 transaction 內所有子列都寫完才成立。
--
-- invariant 16 的精確敘述是「只有 leaf 切片可**接受新的** allocation」。
-- 已存在的 allocation 若因日後分割而指向非 leaf，那是**歷史事實**，不是違規 ——
-- ageing 推導本來就會沿 lineage 讀父的歷程。
-- =============================================================================

-- ledger 完全 append-only（期間歸屬已下移至切片，故這張表沒有任何可變欄位）
CREATE OR REPLACE FUNCTION pre18_ledger_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION
    'creator_ledger_entries is append-only: % is not permitted (entry %)',
    TG_OP, COALESCE(OLD.id, NEW.id)
    USING HINT = '更正請新增 reversal 分錄（DEC-26 J5），不得竄改歷史金額事實';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_ledger_append_only_trg ON creator_ledger_entries;
CREATE TRIGGER pre18_ledger_append_only_trg
  BEFORE UPDATE OR DELETE ON creator_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION pre18_ledger_append_only();

-- invariant 12 —— 切片只允許 `settlement_cycle_id` 的 NULL → 值一次性轉移
CREATE OR REPLACE FUNCTION pre18_slice_write_once() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'creator_payable_slices is append-only: DELETE is not permitted (slice %)', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.ledger_entry_id IS DISTINCT FROM OLD.ledger_entry_id
     OR NEW.parent_slice_id IS DISTINCT FROM OLD.parent_slice_id
     OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.split_in_cycle_id IS DISTINCT FROM OLD.split_in_cycle_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'creator_payable_slices: only settlement_cycle_id may be assigned (slice %)', OLD.id
      USING HINT = '切片是金額事實的分解，再分割請新增子切片，不得就地修改';
  END IF;
  IF OLD.settlement_cycle_id IS NOT NULL
     AND NEW.settlement_cycle_id IS DISTINCT FROM OLD.settlement_cycle_id THEN
    RAISE EXCEPTION
      'invariant 12 violated: settlement_cycle_id is write-once (slice %, % -> %)',
      OLD.id, OLD.settlement_cycle_id, NEW.settlement_cycle_id
      USING HINT = 'DEC-30 N6/N7：已關閉期間的歸屬不可回溯變動';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_slice_write_once_trg ON creator_payable_slices;
CREATE TRIGGER pre18_slice_write_once_trg
  BEFORE UPDATE OR DELETE ON creator_payable_slices
  FOR EACH ROW EXECUTE FUNCTION pre18_slice_write_once();

-- 再分割的結構前提：同一分錄、繼承品項與已指派的期間、且父切片尚未被配置
CREATE OR REPLACE FUNCTION pre18_slice_split_guard() RETURNS trigger AS $fn$
DECLARE
  parent creator_payable_slices%ROWTYPE;
  allocated INTEGER;
BEGIN
  IF NEW.parent_slice_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO parent FROM creator_payable_slices WHERE id = NEW.parent_slice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown parent payable slice %', NEW.parent_slice_id;
  END IF;
  IF parent.ledger_entry_id <> NEW.ledger_entry_id THEN
    RAISE EXCEPTION
      'child slice must belong to the same ledger entry as its parent (% vs %)',
      NEW.ledger_entry_id, parent.ledger_entry_id;
  END IF;
  IF parent.order_item_id IS DISTINCT FROM NEW.order_item_id THEN
    RAISE EXCEPTION 'child slice must inherit the parent order_item_id (slice %)', NEW.parent_slice_id;
  END IF;
  IF parent.settlement_cycle_id IS NOT NULL
     AND NEW.settlement_cycle_id IS DISTINCT FROM parent.settlement_cycle_id THEN
    RAISE EXCEPTION
      'child slice must inherit an already-assigned parent settlement_cycle_id (slice %)',
      NEW.parent_slice_id;
  END IF;
  -- **未解除**的 hold 才擋分割：已解除的 allocation 是歷史事實，
  -- 它記錄「這筆錢當時被凍結過」，並不佔用現在的金額。把它當成分割障礙，
  -- 會讓「曾被整筆 hold 過的切片」永遠無法再部分 hold —— 那不是任何政策要求的。
  SELECT count(*) INTO allocated
    FROM settlement_hold_allocations a
    JOIN settlement_holds h ON h.id = a.hold_id
   WHERE a.payable_slice_id = parent.id AND h.released_at IS NULL;
  IF allocated > 0 THEN
    RAISE EXCEPTION
      'cannot split payable slice % because it carries unreleased hold allocations', parent.id
      USING HINT = '請改為分割尚未被配置的姊妹切片（invariant 16）';
  END IF;
  SELECT count(*) INTO allocated
    FROM payout_allocations WHERE payable_slice_id = parent.id;
  IF allocated > 0 THEN
    RAISE EXCEPTION
      'cannot split payable slice % because it already carries payout allocations', parent.id;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_slice_split_guard_trg ON creator_payable_slices;
CREATE TRIGGER pre18_slice_split_guard_trg
  BEFORE INSERT ON creator_payable_slices
  FOR EACH ROW EXECUTE FUNCTION pre18_slice_split_guard();

-- invariant 14／15 —— 精確加總（延後至 commit，因為子列在同一 tx 內陸續寫入）
CREATE OR REPLACE FUNCTION pre18_slice_sum_check() RETURNS trigger AS $fn$
DECLARE
  entry_amount INTEGER;
  leaf_sum INTEGER;
  parent_amount INTEGER;
  child_sum INTEGER;
BEGIN
  SELECT amount INTO entry_amount FROM creator_ledger_entries WHERE id = NEW.ledger_entry_id;
  SELECT COALESCE(SUM(s.amount), 0) INTO leaf_sum
    FROM creator_payable_slices s
    WHERE s.ledger_entry_id = NEW.ledger_entry_id
      AND NOT EXISTS (
        SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = s.id
      );
  IF leaf_sum <> entry_amount THEN
    RAISE EXCEPTION
      'invariant 14 violated: leaf payable slices of entry % sum to % but the entry amount is %',
      NEW.ledger_entry_id, leaf_sum, entry_amount
      USING HINT = '切片是分錄金額的分解，不得製造也不得遺失金額';
  END IF;
  IF NEW.parent_slice_id IS NOT NULL THEN
    SELECT amount INTO parent_amount FROM creator_payable_slices WHERE id = NEW.parent_slice_id;
    SELECT COALESCE(SUM(amount), 0) INTO child_sum
      FROM creator_payable_slices WHERE parent_slice_id = NEW.parent_slice_id;
    IF child_sum <> parent_amount THEN
      RAISE EXCEPTION
        'invariant 15 violated: children of slice % sum to % but the parent amount is %',
        NEW.parent_slice_id, child_sum, parent_amount;
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_slice_sum_check_trg ON creator_payable_slices;
CREATE CONSTRAINT TRIGGER pre18_slice_sum_check_trg
  AFTER INSERT ON creator_payable_slices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pre18_slice_sum_check();

-- hold 的解除是**單向**的 —— `released_at` 一經寫入不得回到 NULL。
--
-- 這一條是 invariant 16 放寬後的必要配套。放寬後，一個切片可以在其 hold **已解除**
-- 之後被再分割，此時那筆歷史 allocation 會指向非 leaf 的父切片。若有人把該 hold
-- 「取消解除」，invariant 11 的每切片加總會同時算到父與子，等於同一筆錢被凍結兩次。
-- 把解除設成不可逆，這個狀態就構造不出來。
CREATE OR REPLACE FUNCTION pre18_hold_release_write_once() RETURNS trigger AS $fn$
BEGIN
  IF OLD.released_at IS NOT NULL AND NEW.released_at IS NULL THEN
    RAISE EXCEPTION
      'settlement hold % cannot be un-released', OLD.id
      USING HINT = '需要重新凍結請開立新的 hold，歷史區間不得改寫';
  END IF;
  IF OLD.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at THEN
    RAISE EXCEPTION 'settlement hold % release timestamp is immutable', OLD.id;
  END IF;
  IF NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION 'settlement hold % scope and opening are immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_hold_release_write_once_trg ON settlement_holds;
CREATE TRIGGER pre18_hold_release_write_once_trg
  BEFORE UPDATE ON settlement_holds
  FOR EACH ROW EXECUTE FUNCTION pre18_hold_release_write_once();

-- invariant 11／16 —— hold 配置只指向 leaf，未解除總額不得超過切片金額
CREATE OR REPLACE FUNCTION pre18_hold_allocation_guard() RETURNS trigger AS $fn$
DECLARE
  slice creator_payable_slices%ROWTYPE;
  held INTEGER;
BEGIN
  SELECT * INTO slice FROM creator_payable_slices WHERE id = NEW.payable_slice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown payable slice %', NEW.payable_slice_id;
  END IF;
  IF slice.order_item_id IS NULL THEN
    RAISE EXCEPTION
      'residue payable slice % can never be held', slice.id
      USING HINT = 'residue 不歸屬任何品項，故任何品項層級的爭議都碰不到它';
  END IF;
  IF EXISTS (SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = slice.id) THEN
    RAISE EXCEPTION
      'invariant 16 violated: only leaf payable slices may be allocated (slice %)', slice.id;
  END IF;
  SELECT COALESCE(SUM(a.held_amount), 0) INTO held
    FROM settlement_hold_allocations a
    JOIN settlement_holds h ON h.id = a.hold_id
    WHERE a.payable_slice_id = NEW.payable_slice_id
      AND h.released_at IS NULL
      AND a.id <> NEW.id;
  IF held + NEW.held_amount > slice.amount THEN
    RAISE EXCEPTION
      'invariant 11 violated: unreleased holds on slice % would total % but the slice is only %',
      slice.id, held + NEW.held_amount, slice.amount
      USING HINT = 'DEC-28 L6：超出可歸屬金額即 fail closed';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_hold_allocation_guard_trg ON settlement_hold_allocations;
CREATE TRIGGER pre18_hold_allocation_guard_trg
  BEFORE INSERT ON settlement_hold_allocations
  FOR EACH ROW EXECUTE FUNCTION pre18_hold_allocation_guard();

-- hold／payout allocation 一經寫入即為歷史事實（釋出改的是 hold 本身，不是 allocation）
CREATE OR REPLACE FUNCTION pre18_allocation_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_hold_allocation_append_only_trg ON settlement_hold_allocations;
CREATE TRIGGER pre18_hold_allocation_append_only_trg
  BEFORE UPDATE OR DELETE ON settlement_hold_allocations
  FOR EACH ROW EXECUTE FUNCTION pre18_allocation_append_only();

DROP TRIGGER IF EXISTS pre18_payout_allocation_append_only_trg ON payout_allocations;
CREATE TRIGGER pre18_payout_allocation_append_only_trg
  BEFORE UPDATE OR DELETE ON payout_allocations
  FOR EACH ROW EXECUTE FUNCTION pre18_allocation_append_only();

-- invariant 5／16 —— 撥款消耗只指向 leaf，且不得超過切片金額
CREATE OR REPLACE FUNCTION pre18_payout_allocation_guard() RETURNS trigger AS $fn$
DECLARE
  slice creator_payable_slices%ROWTYPE;
  consumed INTEGER;
  item_creator TEXT;
  slice_creator TEXT;
BEGIN
  SELECT * INTO slice FROM creator_payable_slices WHERE id = NEW.payable_slice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown payable slice %', NEW.payable_slice_id;
  END IF;
  IF EXISTS (SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = slice.id) THEN
    RAISE EXCEPTION
      'invariant 16 violated: only leaf payable slices may be allocated (slice %)', slice.id;
  END IF;
  SELECT e.creator_id INTO slice_creator
    FROM creator_ledger_entries e WHERE e.id = slice.ledger_entry_id;
  SELECT p.creator_id INTO item_creator FROM payout_items p WHERE p.id = NEW.payout_item_id;
  IF slice_creator IS DISTINCT FROM item_creator THEN
    RAISE EXCEPTION
      'payout allocation would pay creator % from a payable slice belonging to creator %',
      item_creator, slice_creator;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO consumed
    FROM payout_allocations
    WHERE payable_slice_id = NEW.payable_slice_id AND id <> NEW.id;
  IF consumed + NEW.amount > slice.amount THEN
    RAISE EXCEPTION
      'invariant 5 violated: payout consumption of slice % would total % but the slice is only %',
      slice.id, consumed + NEW.amount, slice.amount;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_payout_allocation_guard_trg ON payout_allocations;
CREATE TRIGGER pre18_payout_allocation_guard_trg
  BEFORE INSERT ON payout_allocations
  FOR EACH ROW EXECUTE FUNCTION pre18_payout_allocation_guard();

-- invariant 10 —— 撥款總額精確對帳（延後：allocation 於同一 tx 內陸續寫入）
CREATE OR REPLACE FUNCTION pre18_payout_total_check() RETURNS trigger AS $fn$
DECLARE
  item_amount INTEGER;
  allocated INTEGER;
BEGIN
  SELECT amount INTO item_amount FROM payout_items WHERE id = NEW.payout_item_id;
  SELECT COALESCE(SUM(amount), 0) INTO allocated
    FROM payout_allocations WHERE payout_item_id = NEW.payout_item_id;
  IF allocated <> item_amount THEN
    RAISE EXCEPTION
      'invariant 10 violated: payout item % is % but its allocations sum to %',
      NEW.payout_item_id, item_amount, allocated;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_payout_total_check_trg ON payout_allocations;
CREATE CONSTRAINT TRIGGER pre18_payout_total_check_trg
  AFTER INSERT ON payout_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pre18_payout_total_check();

-- invariant 8 —— 已寫入的 statement 不可變動（重算驗證用讀取，不用改寫）
CREATE OR REPLACE FUNCTION pre18_statement_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION
    'creator_cycle_statements is immutable once written (statement %)', COALESCE(OLD.id, NEW.id)
    USING HINT = 'DEC-30 N5：不得靜默重算歷史期間；差異請以下一期間或顯式例外路徑處理';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_statement_immutable_trg ON creator_cycle_statements;
CREATE TRIGGER pre18_statement_immutable_trg
  BEFORE UPDATE OR DELETE ON creator_cycle_statements
  FOR EACH ROW EXECUTE FUNCTION pre18_statement_immutable();

-- 已關閉的期間不得重新開啟（`DEC-30` §N5），期間邊界一經建立不可變動
CREATE OR REPLACE FUNCTION pre18_cycle_no_reopen() RETURNS trigger AS $fn$
BEGIN
  IF OLD.status IN ('closed', 'settled') AND NEW.status = 'open' THEN
    RAISE EXCEPTION
      'settlement cycle % cannot be reopened (% -> open)', OLD.id, OLD.status
      USING HINT = 'DEC-30 N5：事後才 eligible 的金額歸入下一期間';
  END IF;
  IF OLD.status = 'settled' AND NEW.status = 'closed' THEN
    RAISE EXCEPTION 'settlement cycle % cannot go back from settled to closed', OLD.id;
  END IF;
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.cutoff_at IS DISTINCT FROM OLD.cutoff_at
     OR NEW.payout_due_at IS DISTINCT FROM OLD.payout_due_at THEN
    RAISE EXCEPTION 'settlement cycle % boundaries are immutable once created', OLD.id;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_cycle_no_reopen_trg ON payout_cycles;
CREATE TRIGGER pre18_cycle_no_reopen_trg
  BEFORE UPDATE ON payout_cycles
  FOR EACH ROW EXECUTE FUNCTION pre18_cycle_no_reopen();
