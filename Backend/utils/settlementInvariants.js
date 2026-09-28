/**
 * 結算 invariants —— **唯讀**檢查。
 *
 * ## 這個模組不是強制層
 *
 * 真正的強制在資料庫：row CHECK、partial UNIQUE、以及
 * `20260928_pre18_settlement_core.sql` 裡的 trigger。本模組是**第二道確認**，
 * 供對帳報表與夜間檢查使用（設計 §21：任一 invariant 違反即 rollback trigger）。
 *
 * ## 誠實的強制層盤點
 *
 * **16 條中 13 條完全由 DB 強制；3 條（7、10、14）主體由 DB 強制但各有一個具名的
 * 殘餘缺口，由 service 補上並由本模組的查詢照出來。** 不要把它講成 15 或 16 條。
 *
 * | # | Invariant | 強制層 | 實際機制 |
 * | --- | --- | --- | --- |
 * | 1 | 整數 TWD | **DB** | 所有金額欄位為 `INTEGER` ＋ `materials_price_min_check`（`COR-09`） |
 * | 2 | `earnings + commission = net_sales` | **DB** | row CHECK `cle_attributed_split_check`（涵蓋 `earning` **與** `opening`） |
 * | 3 | 每訂單每創作者唯一 earning | **DB** | partial UNIQUE `cle_one_earning_per_order_creator` |
 * | 4 | opening 分錄不得重複 | **DB** | partial UNIQUE `cle_one_opening_per_order_item` |
 * | 5 | 撥款消耗不得超過切片 | **DB** | BEFORE INSERT trigger `pre18_payout_allocation_guard` |
 * | 6 | 無歸屬即無創作者責任 | **DB（結構性）** | `creator_id NOT NULL` ＋ 懸記為獨立表 |
 * | 7 | 無 creator_fault 即不得有負餘額 | **DB ＋ service** | CHECK `cle_negative_requires_fault_check` 只保證**有連結**；連結的分類必須是 `creator_fault`（而非 `non_creator_fault`）由 `creatorLedger.recordAdjustment` 保證，並由 `adjustment_from_non_creator_fault` 查核 |
 * | 8 | 已關閉期間不可變 | **DB** | trigger `pre18_cycle_no_reopen` ＋ `pre18_statement_immutable` |
 * | 9 | 懸記永不呈現為創作者應付 | **DB（結構性）** | 不同表；`creator_id NOT NULL` 使其無法混入 |
 * | 10 | 撥款總額精確對帳 | **DB ＋ 缺口** | deferred constraint trigger `pre18_payout_total_check`。⚠️ 只在 allocation 插入時觸發，因此**尚無任何 allocation 的 pending item 不受檢查** —— 那是合法的待撥款狀態，但也表示「已付卻零配置」只能靠 `payout_total_mismatch` 查核 |
 * | 11 | 未解除 hold ≤ 切片金額 | **DB** | BEFORE INSERT trigger `pre18_hold_allocation_guard` ＋ `pre18_hold_release_write_once`（解除不可逆，否則父子會各算一次） |
 * | 12 | `settlement_cycle_id` write-once | **DB** | trigger `pre18_slice_write_once` |
 * | 13 | 非銷售列不得帶分潤欄位 | **DB** | row CHECK `cle_non_attributed_no_split_check` |
 * | 14 | leaf 切片精確加總回分錄 | **DB ＋ 缺口** | deferred constraint trigger `pre18_slice_sum_check`。⚠️ 見下方 |
 * | 15 | 子切片精確加總回父切片 | **DB** | 同一個 deferred constraint trigger |
 * | 16 | 只有 leaf 可**接受新的** allocation | **DB** | 兩個 allocation guard trigger |
 *
 * ⚠️ **invariant 14 有一個 trigger 碰不到的角落**：trigger 只在**插入切片時**觸發，
 * 因此「正值分錄**完全沒有**切片」不會被它擋下。那個狀態只可能來自繞過 service 的
 * 直接 INSERT。下方的 `positive_entry_without_slices` 就是為了把它照出來。
 */

/** 每一項都回傳違反的列；空陣列 ＝ 通過。 */
const INVARIANT_CHECKS = Object.freeze([
  {
    key: "earning_split_identity",
    invariant: 2,
    why: "creator_earnings + platform_commission 必須精確等於 creator_net_sales（DEC-31 §3）",
    sql: `SELECT id, amount, platform_commission, creator_net_sales
            FROM creator_ledger_entries
           WHERE entry_type = 'earning'
             AND amount + platform_commission <> creator_net_sales`,
  },
  {
    key: "positive_entry_without_slices",
    invariant: 14,
    why: "正值分錄必須被切片完整分解，否則它永遠進不了結算（trigger 碰不到這個角落）",
    sql: `SELECT e.id, e.entry_type, e.amount
            FROM creator_ledger_entries e
           WHERE e.amount > 0
             AND NOT EXISTS (
               SELECT 1 FROM creator_payable_slices s WHERE s.ledger_entry_id = e.id
             )`,
  },
  {
    key: "leaf_slice_sum_mismatch",
    invariant: 14,
    why: "leaf 切片必須精確加總回分錄金額，不多不少",
    sql: `SELECT e.id, e.amount, COALESCE(SUM(s.amount), 0)::int AS leaf_total
            FROM creator_ledger_entries e
            JOIN creator_payable_slices s ON s.ledger_entry_id = e.id
           WHERE NOT EXISTS (
                   SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = s.id
                 )
           GROUP BY e.id, e.amount
          HAVING COALESCE(SUM(s.amount), 0) <> e.amount`,
  },
  {
    key: "child_slice_sum_mismatch",
    invariant: 15,
    why: "再分割不得製造也不得遺失金額",
    sql: `SELECT p.id, p.amount, SUM(c.amount)::int AS child_total
            FROM creator_payable_slices p
            JOIN creator_payable_slices c ON c.parent_slice_id = p.id
           GROUP BY p.id, p.amount
          HAVING SUM(c.amount) <> p.amount`,
  },
  {
    key: "hold_exceeds_slice",
    invariant: 11,
    why: "單一切片的未解除 hold 總額不得超過該切片金額（DEC-28 §L6）",
    sql: `SELECT s.id, s.amount, SUM(a.held_amount)::int AS held_total
            FROM creator_payable_slices s
            JOIN settlement_hold_allocations a ON a.payable_slice_id = s.id
            JOIN settlement_holds h ON h.id = a.hold_id AND h.released_at IS NULL
           GROUP BY s.id, s.amount
          HAVING SUM(a.held_amount) > s.amount`,
  },
  {
    key: "payout_exceeds_slice",
    invariant: 5,
    why: "撥款消耗不得超過應付",
    sql: `SELECT s.id, s.amount, SUM(p.amount)::int AS paid_total
            FROM creator_payable_slices s
            JOIN payout_allocations p ON p.payable_slice_id = s.id
           GROUP BY s.id, s.amount
          HAVING SUM(p.amount) > s.amount`,
  },
  {
    key: "payout_total_mismatch",
    invariant: 10,
    why: "payout_item 金額必須精確等於其 allocation 總額",
    sql: `SELECT i.id, i.amount, COALESCE(SUM(a.amount), 0)::int AS allocated
            FROM payout_items i
            LEFT JOIN payout_allocations a ON a.payout_item_id = i.id
           WHERE i.status = 'paid'
           GROUP BY i.id, i.amount
          HAVING COALESCE(SUM(a.amount), 0) <> i.amount`,
  },
  {
    key: "negative_entry_without_fault",
    invariant: 7,
    why: "負向調整必須連結 creator_fault 分類（DEC-21 / DEC-35）",
    sql: `SELECT e.id, e.amount, e.entry_type
            FROM creator_ledger_entries e
           WHERE e.amount < 0
             AND e.entry_type = 'adjustment'
             AND e.fault_classification_id IS NULL`,
  },
  {
    key: "adjustment_from_non_creator_fault",
    invariant: 7,
    why: "non_creator_fault 一律 Platform absorb，不得產生任何分錄（DEC-35 §Q5）",
    sql: `SELECT e.id, e.amount, c.result
            FROM creator_ledger_entries e
            JOIN creator_fault_classifications c ON c.id = e.fault_classification_id
           WHERE e.amount < 0 AND c.result <> 'creator_fault'`,
  },
  {
    key: "suspense_leaked_into_ledger",
    invariant: 9,
    why: "已進懸記的品項不得同時存在創作者應付分錄",
    sql: `SELECT u.id, u.order_item_id
            FROM unattributed_suspense_entries u
           WHERE u.state = 'open'
             AND EXISTS (
               SELECT 1 FROM creator_ledger_entries e
                WHERE e.order_item_id = u.order_item_id
             )`,
  },
  {
    key: "resolved_suspense_split_mismatch",
    invariant: 9,
    why: "懸記解決後的分錄必須完整保存原本的經濟事實：creator_net_sales 必須等於懸記的品項淨額（DEC-37 報表要求）",
    sql: `SELECT u.id, u.net_amount, e.creator_net_sales, e.amount, e.platform_commission
            FROM unattributed_suspense_entries u
            JOIN creator_ledger_entries e ON e.id = u.resolved_entry_id
           WHERE u.state = 'resolved'
             AND (e.creator_net_sales IS DISTINCT FROM u.net_amount
                  OR e.amount + e.platform_commission IS DISTINCT FROM u.net_amount)`,
  },
  {
    key: "attributed_entry_missing_split",
    invariant: 2,
    why: "earning 與 opening 都必須帶 creator_net_sales／platform_commission，否則 DEC-31 資訊遺失",
    sql: `SELECT id, entry_type
            FROM creator_ledger_entries
           WHERE entry_type IN ('earning', 'opening')
             AND (creator_net_sales IS NULL OR platform_commission IS NULL)`,
  },
  {
    key: "allocation_on_non_leaf_slice",
    invariant: 16,
    why: "未解除的 hold 或撥款不得指向已被分割的切片",
    sql: `SELECT a.id, a.payable_slice_id, 'hold' AS kind
            FROM settlement_hold_allocations a
            JOIN settlement_holds h ON h.id = a.hold_id AND h.released_at IS NULL
           WHERE EXISTS (
             SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = a.payable_slice_id
           )
           UNION ALL
          SELECT p.id, p.payable_slice_id, 'payout'
            FROM payout_allocations p
           WHERE EXISTS (
             SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = p.payable_slice_id
           )`,
  },
  {
    key: "residue_slice_held",
    invariant: 11,
    why: "residue 切片不歸屬任何品項，永遠不可被 hold",
    sql: `SELECT a.id, a.payable_slice_id
            FROM settlement_hold_allocations a
            JOIN creator_payable_slices s ON s.id = a.payable_slice_id
           WHERE s.order_item_id IS NULL`,
  },
]);

/** 跑完全部檢查。回傳 `{ ok, violations: [{ key, invariant, why, rows }] }`。 */
async function runInvariantChecks(executor) {
  const violations = [];
  for (const check of INVARIANT_CHECKS) {
    const { rows } = await executor.query(check.sql);
    if (rows.length > 0) {
      violations.push({ key: check.key, invariant: check.invariant, why: check.why, rows });
    }
  }
  return { ok: violations.length === 0, violations, checked: INVARIANT_CHECKS.length };
}

module.exports = { INVARIANT_CHECKS, runInvariantChecks };
