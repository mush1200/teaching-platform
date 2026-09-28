/**
 * 撥款 —— `DEC-29`／`DEC-30`。
 *
 * ## 系統不匯錢
 *
 * 與付款收款一樣，本平台**沒有串接金流**。`payout_items` 由期間關閉產生，
 * Admin 於平台外完成匯款後回來**標記已付並留下銀行參考**。
 * `bank_reference` 是 `status = 'paid'` 的 DB 層必要條件 —— 沒有憑據就標不了已付。
 *
 * ## 標記已付時才產生 `payout_allocations`
 *
 * 撥款必須能證明五件事：**哪一個切片被消耗**、**消耗多少**、**該切片是否完全消滅**
 * （＝`DEC-32` §P3 的 ageing reset 條件）、**沖抵順序**、以及**事後稽核**。
 * 只寫一筆 `payout_consumption` 分錄做不到 —— 那只說得出「這位創作者這一期被消耗
 * 了多少」。因此分錄記金額、allocation 記歸屬，兩者同一個 transaction。
 *
 * ## 消耗順序 ＝ FIFO
 *
 * 依切片 `created_at, id` 由舊到新消耗。這**不是** `DEC-31` §6 順序中立所規範的
 * 對象（那講的是金額計算不得因列序而變），而是「先老先付」的會計慣例；
 * 它只影響哪一個 tranche 的 ageing 被重置，且以穩定的 id 做 tie-break，
 * 因此結果仍然是決定性的。
 */

const { writeActivityLog } = require("../utils/activityLog");
const { insertEntry } = require("./creatorLedger.service");
const { splitSlice, ensureCycle } = require("./settlementHold.service");
const { cycleIdForInstant } = require("../utils/settlementPolicy");

/** 可供撥款消耗的 leaf 切片（未被未解除的 hold 覆蓋、未被消耗完）。 */
async function consumableSlices(client, { creatorId }) {
  const { rows } = await client.query(
    `SELECT s.id,
            s.ledger_entry_id,
            s.order_item_id,
            s.amount,
            s.settlement_cycle_id,
            s.created_at,
            COALESCE(held.total, 0)::int AS held_amount,
            COALESCE(paid.total, 0)::int AS paid_amount
       FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
       LEFT JOIN LATERAL (
         SELECT SUM(a.held_amount) AS total
           FROM settlement_hold_allocations a
           JOIN settlement_holds h ON h.id = a.hold_id
          WHERE a.payable_slice_id = s.id AND h.released_at IS NULL
       ) held ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(p.amount) AS total
           FROM payout_allocations p
          WHERE p.payable_slice_id = s.id
       ) paid ON TRUE
      WHERE e.creator_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = s.id
        )
      ORDER BY s.created_at, s.id`,
    [creatorId]
  );
  return rows
    .map((row) => ({ ...row, available: row.amount - row.held_amount - row.paid_amount }))
    .filter((row) => row.available > 0);
}

/**
 * 標記一筆撥款已完成。
 *
 * 一個 transaction 內完成：allocation ＋ `payout_consumption` 分錄 ＋ 狀態 ＋ 稽核。
 * **通知不在 tx 內**（`DEC-20` C4：通知失敗不得回滾）—— 由呼叫端於 commit 後送出。
 */
async function markPaid(
  client,
  { payoutItemId, bankReference, actorId, now = new Date() }
) {
  if (!bankReference || !String(bankReference).trim()) {
    throw new Error("markPaid: a bank reference is required (the platform does not move money)");
  }

  const { rows: itemRows } = await client.query(
    `SELECT * FROM payout_items WHERE id = $1 FOR UPDATE`,
    [payoutItemId]
  );
  if (itemRows.length === 0) throw new Error(`markPaid: unknown payout item ${payoutItemId}`);
  const item = itemRows[0];
  if (item.status !== "pending") {
    throw new Error(`markPaid: payout item ${payoutItemId} is already ${item.status}`);
  }

  const cycleId = await ensureCycle(client, cycleIdForInstant(now));
  const slices = await consumableSlices(client, { creatorId: item.creator_id });

  let remaining = Number(item.amount);
  const allocations = [];

  for (const slice of slices) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, slice.available);

    let targetSliceId = slice.id;
    if (take < slice.available) {
      // 部分消耗 → 先分割，讓「被消耗的切片」整筆消滅、剩餘切片繼續自己的 ageing。
      // 這與部分 hold 用的是同一個機制（`DEC-33` §P7a 的 lineage）。
      const children = await splitSlice(client, { slice, portionAmount: take, cycleId });
      targetSliceId = children.portion.id;
    }

    const { rows } = await client.query(
      `INSERT INTO payout_allocations (payout_item_id, payable_slice_id, amount)
       VALUES ($1, $2, $3) RETURNING *`,
      [payoutItemId, targetSliceId, take]
    );
    allocations.push(rows[0]);
    remaining -= take;
  }

  if (remaining > 0) {
    // fail closed：撥款金額大於可消耗的應付代表資格計算與 ledger 已經不一致。
    // 寧可整筆回滾，也不要付出一筆無法對帳的錢。
    throw new Error(
      `markPaid: payout item ${payoutItemId} is ${item.amount} but only ${
        Number(item.amount) - remaining
      } of consumable payable exists; refusing to pay an unreconcilable amount`
    );
  }

  const entry = await insertEntry(client, {
    creatorId: item.creator_id,
    entryType: "payout_consumption",
    amount: -Number(item.amount),
    sourceType: "payout_item",
    sourceId: payoutItemId,
    createdBy: actorId ?? null,
  });

  const { rows: updated } = await client.query(
    `UPDATE payout_items
        SET status = 'paid', paid_at = NOW(), paid_by = $2, bank_reference = $3
      WHERE id = $1 RETURNING *`,
    [payoutItemId, actorId ?? null, bankReference]
  );

  await writeActivityLog({
    client,
    actorId: actorId ?? null,
    actorRole: actorId ? "admin" : null,
    targetType: "payout_item",
    targetId: payoutItemId,
    action: "payout.marked_paid",
    meta: {
      cycle_id: item.cycle_id,
      creator_id: item.creator_id,
      amount: Number(item.amount),
      trigger_reason: item.trigger_reason,
      allocation_count: allocations.length,
      ledger_entry_id: entry.id,
      // `bank_reference` 是稽核憑據，不是機敏資料；但仍只記存在與否，
      // 值本身留在 `payout_items`，避免在 log 裡散佈第二份副本。
      bank_reference_recorded: true,
    },
  });

  return { payoutItem: updated[0], allocations, ledgerEntry: entry };
}

/** 把撥款標記為失敗（例如匯款退回）。金額回到應付，不產生任何 ledger 分錄。 */
async function markFailed(client, { payoutItemId, reason, actorId }) {
  if (!reason || !String(reason).trim()) {
    throw new Error("markFailed: a failure reason is required");
  }
  const { rows } = await client.query(
    `UPDATE payout_items SET status = 'failed', failure_reason = $2
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [payoutItemId, reason]
  );
  if (rows.length === 0) {
    throw new Error(`markFailed: payout item ${payoutItemId} is not pending`);
  }
  await writeActivityLog({
    client,
    actorId: actorId ?? null,
    actorRole: actorId ? "admin" : null,
    targetType: "payout_item",
    targetId: payoutItemId,
    action: "payout.marked_failed",
    meta: { reason },
  });
  return rows[0];
}

module.exports = {
  consumableSlices,
  markPaid,
  markFailed,
};
