-- =============================================================================
-- PRE-18 — reconciliation dispositions（`DEC-27` §K3 的逐筆處置記錄）
--
-- 這支 migration **屬於 settlement chain**（檔名符合 `*_pre18_settlement_*.sql`），
-- 因此 bootstrap 會在 `20260928_pre18_settlement_core.sql` **之後**自動執行它。
-- 這正是 chain 設計要證明的事：擴充 `PRE-18` 不需要改動既有 migration，
-- 也不會讓全新佈建少掉一塊。
--
-- ## 為什麼需要一張表，而不是查 activity_logs
--
-- write-enable 閘門必須能回答「**這一列有沒有被明示處置過**」。
-- `activity_logs` 是 append-only 的軌跡，**沒有**「每個 target 至多一筆有效決定」
-- 這種唯一性，也無法表達更正鏈。把閘門建立在它上面，等於讓一個財務啟用判斷
-- 依賴一個沒有唯一性保證的集合。
--
-- 另外 `DEC-35` §Q13 已經定調「**log 不是決定狀態**」——
-- 處置是**決定**，不是軌跡，所以它需要自己的 state。
--
-- ## 這張表不移動任何金錢
--
-- 它記錄的是「操作者對這一列的決定與依據」。真正的金額效果仍然只能來自
-- `creator_ledger_entries`／`unattributed_suspense_entries`。
-- 因此**記錄處置不受 `SETTLEMENT_WRITE_ENABLED` 約束** —— 若受其約束就會形成
-- 死結：沒開旗標不能記處置，沒記處置不能開旗標。
-- =============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_dispositions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- 被處置的對象。`order` 用於 `DEC-27` §K2 的 `approved` ＋ `paid_at IS NULL`；
  -- `order_item` 用於 `DEC-36` 的 `seller_id IS NULL`。
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  category TEXT NOT NULL,

  -- `DEC-27` §K2 只允許兩種結果，且兩種都必須留下依據：
  --   include_with_evidence —— 有可靠證據 → 顯式可稽核的更正路徑
  --   exclude_no_evidence   —— 無可靠證據 → 不納入撥款並記錄理由
  -- `DEC-36`／`DEC-37` 的未歸屬品項另有 suspense_recorded（已進懸記，等待歸屬）。
  decision TEXT NOT NULL,

  written_basis TEXT NOT NULL,
  evidence_reference TEXT,
  decided_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW(),
  run_id TEXT REFERENCES reconciliation_runs(id) ON DELETE RESTRICT,
  supersedes_id TEXT REFERENCES reconciliation_dispositions(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT rd_target_type_check CHECK (target_type IN ('order', 'order_item')),
  CONSTRAINT rd_category_check CHECK (category IN (
    'approved_without_paid_at', 'unattributed_order_item'
  )),
  CONSTRAINT rd_decision_check CHECK (decision IN (
    'include_with_evidence', 'exclude_no_evidence', 'suspense_recorded'
  )),
  -- 無依據的處置就是 `DEC-35` §Q8 所禁止的「無記載的勾選」。
  CONSTRAINT rd_written_basis_not_blank CHECK (btrim(written_basis) <> ''),
  CONSTRAINT rd_target_id_not_blank CHECK (btrim(target_id) <> ''),
  -- `include_with_evidence` 的前提就是「有證據」，因此證據參照為必填。
  CONSTRAINT rd_include_requires_evidence CHECK (
    decision <> 'include_with_evidence'
    OR (evidence_reference IS NOT NULL AND btrim(evidence_reference) <> '')
  ),
  CONSTRAINT rd_supersedes_not_self CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

-- 每個對象**至多一筆有效處置**；更正走 supersedes 鏈，原紀錄保留。
CREATE UNIQUE INDEX IF NOT EXISTS rd_one_effective_per_target
  ON reconciliation_dispositions (target_type, target_id)
  WHERE supersedes_id IS NULL;
-- 一筆處置最多只能被一筆更正取代（更正軌跡是鏈，不是樹）。
CREATE UNIQUE INDEX IF NOT EXISTS rd_supersedes_unique
  ON reconciliation_dispositions (supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rd_category_idx ON reconciliation_dispositions (category);

-- 處置是**決定**，不是可以隨手改的欄位：更正一律新增一筆帶 `supersedes_id` 的列。
CREATE OR REPLACE FUNCTION pre18_disposition_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION
    'reconciliation_dispositions is append-only: % is not permitted (disposition %)',
    TG_OP, COALESCE(OLD.id, NEW.id)
    USING HINT = '更正請新增一筆帶 supersedes_id 的處置，原決定與其依據必須保留';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre18_disposition_append_only_trg ON reconciliation_dispositions;
CREATE TRIGGER pre18_disposition_append_only_trg
  BEFORE UPDATE OR DELETE ON reconciliation_dispositions
  FOR EACH ROW EXECUTE FUNCTION pre18_disposition_append_only();
