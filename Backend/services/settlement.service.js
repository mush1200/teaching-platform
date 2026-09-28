/**
 * 結算 —— 資格判定、ageing 推導、期間關閉與 statement。
 *
 * ## 三個概念嚴格分開（設計 §3.2）
 *
 * | 概念 | 何時確定 | 存放位置 |
 * | --- | --- | --- |
 * | 金額事實 | 付款核准當下 | `creator_ledger_entries`，**永久不可變** |
 * | 結算資格 | 每次期間關閉時評估 | **不持久化** —— 由本模組的 predicate 推導 |
 * | 期間歸屬 | 該切片首次成為 eligible 的那個期間關閉時 | `creator_payable_slices.settlement_cycle_id`，write-once |
 *
 * ## ageing 由不可變歷程推導（設計 §10）
 *
 * **不存可變計數器。** hold 的 `opened_at`／`released_at`、payout allocation 的
 * `created_at`、切片的 lineage 全都不可變，因此任何期間的 ageing 都可以隨時重算。
 * statement 是 **checked cache**，不是權威。
 *
 * 判準是 **CUTOFF-STATE**：只看期末狀態，不看期間內的 hold 歷程
 * （`DEC-32` §P1 的原文就是「期末」）。反面的解釋會讓一連串短暫的 hold
 * 無限期阻止 ageing —— 正好製造 `DEC-29` 要防的結果。
 *
 * ## 六期 off-by-one
 *
 * override 以 **`ageing_before`（帶入本期的計數）** 判斷。第 1～6 期皆合格 →
 * **第 7 期**釋出，與 `DEC-32` §P2 的示例一致。
 */

const { writeActivityLog } = require("../utils/activityLog");
const {
  assertCycleId,
  cycleBounds,
  payoutTriggerReason,
  AGEING_OVERRIDE_CYCLES,
} = require("../utils/settlementPolicy");
const {
  isLeaf,
  lineageOf,
  lineageMemberAt,
  isEligibleAtCutoff,
  isExtinguishedAtCutoff,
  ageingBefore,
} = require("../utils/settlementAgeing");
const { ensureCycle } = require("./settlementHold.service");

/**
 * 載入推導所需的**全部不可變歷程**。
 *
 * 一次撈完，之後全在記憶體裡逐期間推導 —— 這讓 ageing 的規則以純函式形式
 * 存在（可單元測試），而不是散落在 SQL 裡。
 */
async function loadCreatorHistory(executor, creatorId) {
  const { rows: slices } = await executor.query(
    `SELECT s.id,
            s.parent_slice_id,
            s.ledger_entry_id,
            s.order_item_id,
            s.amount,
            s.settlement_cycle_id,
            s.split_in_cycle_id,
            s.created_at,
            e.entry_type,
            e.order_id,
            o.status      AS order_status,
            o.paid_at     AS order_paid_at,
            o.refund_window_end
       FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
       LEFT JOIN orders o ON o.id = e.order_id
      WHERE e.creator_id = $1
      ORDER BY s.id`,
    [creatorId]
  );

  const { rows: holds } = await executor.query(
    `SELECT a.payable_slice_id, a.held_amount, h.opened_at, h.released_at
       FROM settlement_hold_allocations a
       JOIN settlement_holds h ON h.id = a.hold_id
       JOIN creator_payable_slices s ON s.id = a.payable_slice_id
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1`,
    [creatorId]
  );

  const { rows: payouts } = await executor.query(
    `SELECT p.payable_slice_id, p.amount, p.created_at
       FROM payout_allocations p
       JOIN creator_payable_slices s ON s.id = p.payable_slice_id
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1`,
    [creatorId]
  );

  const { rows: entries } = await executor.query(
    `SELECT id, entry_type, amount, occurred_at
       FROM creator_ledger_entries
      WHERE creator_id = $1`,
    [creatorId]
  );

  return { slices, holds, payouts, entries };
}

/**
 * 計算一位創作者在某期間的 statement —— **純讀取，不寫入**。
 *
 * shadow 模式直接用這個函式產出比對報表，因此 shadow 與正式路徑算的是**同一段
 * 程式碼**，不是兩份會漂移的實作。
 */
async function computeStatement(
  executor,
  { creatorId, cycleId, closedCycleIds, terminating = false, openingBalance = 0 }
) {
  assertCycleId(cycleId);
  const bounds = cycleBounds(cycleId);
  const previousClosed = closedCycleIds.filter((id) => id < cycleId).pop() ?? null;
  const windowStart = previousClosed ? cycleBounds(previousClosed).cutoffAt : new Date(0);
  const history = await loadCreatorHistory(executor, creatorId);
  const leaves = history.slices.filter((slice) => isLeaf(slice, history.slices));

  let eligibleSliceTotal = 0;
  let heldTotal = 0;
  let maxAgeingBefore = 0;
  const eligibleSlices = [];

  for (const slice of leaves) {
    const consumed = history.payouts
      .filter((payout) => payout.payable_slice_id === slice.id)
      .reduce((sum, payout) => sum + Number(payout.amount), 0);
    const outstanding = Number(slice.amount) - consumed;
    if (outstanding <= 0) continue;

    if (isEligibleAtCutoff(slice, bounds.cutoffAt, history)) {
      eligibleSliceTotal += outstanding;
      const before = ageingBefore(slice, cycleId, history, closedCycleIds);
      maxAgeingBefore = Math.max(maxAgeingBefore, before);
      eligibleSlices.push({ slice, outstanding, ageingBefore: before });
    } else {
      // 不 eligible 的未消滅餘額 —— 幾乎都是被 hold。**仍為創作者所有。**
      heldTotal += outstanding;
    }
  }

  // 累計的負向分錄（創作者過失調整與沖正）。
  //
  // **刻意是累計而非本期** —— 切片的 outstanding 只被撥款消耗，負向調整不消耗切片，
  // 因此它必須一直扣著，直到有足夠的正向切片把它吸收掉為止（`DEC-21`
  // 「得沖抵未來收益」）。`payout_consumption` 必須排除：切片的 outstanding 已經
  // 扣過撥款，再扣一次會重複。
  const cumulativeNegative = history.entries
    .filter((entry) => Number(entry.amount) < 0 && entry.entry_type !== "payout_consumption")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  const inWindow = (entry) => {
    const at = new Date(entry.occurred_at).getTime();
    return at > windowStart.getTime() && at <= bounds.cutoffAt.getTime();
  };
  // 本期活動（報表用）。`eligible_balance` 不由這兩個數推導 ——
  // 資格取決於退款窗口與 hold 狀態，不是期間活動。
  const earnings = history.entries
    .filter((entry) => entry.entry_type === "earning" && inWindow(entry))
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const periodAdjustments = history.entries
    .filter(
      (entry) => ["adjustment", "reversal"].includes(entry.entry_type) && inWindow(entry)
    )
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  const eligibleBalance = eligibleSliceTotal + cumulativeNegative;
  const triggerReason = payoutTriggerReason({
    eligibleBalance,
    ageingBefore: maxAgeingBefore,
    terminating,
  });

  const qualified = eligibleSliceTotal > 0;

  return {
    cycleId,
    creatorId,
    cutoffAt: bounds.cutoffAt,
    openingBalance,
    earnings,
    adjustments: periodAdjustments,
    cumulativeNegative,
    heldAmount: heldTotal,
    eligibleBalance,
    eligibleSliceTotal,
    eligibleSlices,
    ageingQualified: qualified,
    ageingCyclesBefore: maxAgeingBefore,
    ageingCyclesAfter: qualified ? maxAgeingBefore + 1 : maxAgeingBefore,
    payoutTriggeredReason: triggerReason,
  };
}

/** 已關閉（含 settled）的期間 id，由舊到新。 */
async function closedCycleIds(executor) {
  const { rows } = await executor.query(
    `SELECT id FROM payout_cycles WHERE status <> 'open' ORDER BY id`
  );
  return rows.map((row) => row.id);
}

/** 有 ledger 分錄的全部創作者。 */
async function creatorsWithLedger(executor) {
  const { rows } = await executor.query(
    `SELECT DISTINCT creator_id FROM creator_ledger_entries ORDER BY creator_id`
  );
  return rows.map((row) => row.creator_id);
}

/**
 * 期間關閉 —— 一個 transaction。
 *
 * 1. 逐創作者計算 statement；
 * 2. 為**首次成為 eligible** 的切片指派 `settlement_cycle_id`（write-once）；
 * 3. 寫入 statements；
 * 4. 為觸發撥款者建立 `payout_items`（**尚未付款**，Admin 於平台外匯款後才標記）；
 * 5. 期間狀態改為 `closed`。
 *
 * **不重開已關閉的期間**，**不回溯移動已歸屬的金額**（`DEC-30` §N5／§N6）。
 */
async function closeCycle(client, { cycleId, actorId = null, terminatingCreatorIds = [] }) {
  assertCycleId(cycleId);
  await ensureCycle(client, cycleId);

  const { rows: cycleRows } = await client.query(
    `SELECT * FROM payout_cycles WHERE id = $1 FOR UPDATE`,
    [cycleId]
  );
  if (cycleRows[0].status !== "open") {
    throw new Error(`closeCycle: settlement cycle ${cycleId} is already ${cycleRows[0].status}`);
  }

  const closed = await closedCycleIds(client);
  const creators = await creatorsWithLedger(client);
  const terminating = new Set(terminatingCreatorIds);

  const statements = [];
  const payoutItems = [];

  for (const creatorId of creators) {
    // `opening_balance` ＝ 上一個已關閉期間的 statement 所記的 `eligible_balance`。
    // 這是**報表欄位**，權威永遠是 ledger ＋ hold 歷程。
    const { rows: prior } = await client.query(
      `SELECT eligible_balance FROM creator_cycle_statements
        WHERE creator_id = $1 AND cycle_id < $2
        ORDER BY cycle_id DESC LIMIT 1`,
      [creatorId, cycleId]
    );
    const statement = await computeStatement(client, {
      creatorId,
      cycleId,
      closedCycleIds: closed,
      terminating: terminating.has(creatorId),
      openingBalance: prior.length > 0 ? Number(prior[0].eligible_balance) : 0,
    });

    // 期間歸屬：**首次**成為 eligible 的切片在此刻被永久標記。
    // `settlement_cycle_id IS NULL` 的條件同時是冪等保護與 write-once 的體現。
    for (const { slice } of statement.eligibleSlices) {
      if (slice.settlement_cycle_id === null) {
        await client.query(
          `UPDATE creator_payable_slices SET settlement_cycle_id = $2
            WHERE id = $1 AND settlement_cycle_id IS NULL`,
          [slice.id, cycleId]
        );
      }
    }

    const { rows } = await client.query(
      `INSERT INTO creator_cycle_statements
         (cycle_id, creator_id, opening_balance, earnings, adjustments, held_amount,
          eligible_balance, ageing_qualified, ageing_cycles_before, ageing_cycles_after,
          payout_triggered_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        cycleId,
        creatorId,
        statement.openingBalance,
        statement.earnings,
        statement.adjustments,
        statement.heldAmount,
        statement.eligibleBalance,
        statement.ageingQualified,
        statement.ageingCyclesBefore,
        statement.ageingCyclesAfter,
        statement.payoutTriggeredReason,
      ]
    );
    statements.push(rows[0]);

    if (statement.payoutTriggeredReason !== "none") {
      const { rows: itemRows } = await client.query(
        `INSERT INTO payout_items (cycle_id, creator_id, amount, trigger_reason)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [cycleId, creatorId, statement.eligibleBalance, statement.payoutTriggeredReason]
      );
      payoutItems.push(itemRows[0]);
    }
  }

  await client.query(
    `UPDATE payout_cycles SET status = 'closed', closed_at = NOW(), closed_by = $2 WHERE id = $1`,
    [cycleId, actorId]
  );

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "payout_cycle",
    targetId: cycleId,
    action: "settlement.cycle_closed",
    meta: {
      statement_count: statements.length,
      payout_item_count: payoutItems.length,
      payout_total: payoutItems.reduce((sum, item) => sum + Number(item.amount), 0),
      ageing_override_cycles: AGEING_OVERRIDE_CYCLES,
    },
  });

  return { statements, payoutItems };
}

module.exports = {
  loadCreatorHistory,
  // 推導規則本身住在 `utils/settlementAgeing.js`（純函式、無 db 相依）；
  // 這裡一併 re-export，讓呼叫端只需要認得 settlement service 一個入口。
  isLeaf,
  lineageOf,
  lineageMemberAt,
  isEligibleAtCutoff,
  isExtinguishedAtCutoff,
  ageingBefore,
  computeStatement,
  closedCycleIds,
  creatorsWithLedger,
  closeCycle,
};
