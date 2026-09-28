/**
 * 付款核准 → 結算的接點。
 *
 * ## 旗標的界線（設計 §21）
 *
 * `SETTLEMENT_WRITE_ENABLED` **預設關閉**。關閉時本模組**不寫入任何 ledger／切片／
 * 懸記**，只把算好的數字回傳給呼叫端（shadow）。開啟後才持久化。
 *
 * ⚠️ **`refund_window_end` 不受旗標約束，一律寫入。**
 *
 * 理由不是疏忽：它是 `DEC-26` 要求的**持久化期限**，本身**不產生任何應付**，
 * 而且一旦漏寫就永遠補不回來 —— `DEC-27` §K1 明文禁止 backfill 歷史訂單的期限。
 * 若跟著旗標一起關掉，shadow 期間核准的每一張訂單都會變成需要人工對帳的 legacy。
 * 寫入一個只有自己使用的時間戳，比製造對帳債安全得多。
 *
 * ## 為什麼在同一個 transaction
 *
 * 設計 §7：earning 分錄必須與付款核准、`paid_at`、`refund_window_end` 同一個 tx，
 * 否則會出現「訂單已核准但金額事實不存在」的中間狀態，而那個狀態沒有任何
 * 可靠的方式事後分辨「還沒寫」與「寫失敗了」。
 */

const { refundWindowEndAt, isSettlementWriteEnabled } = require("../utils/settlementPolicy");
const { computeOrderSettlement } = require("../utils/settlementMoney");
const { recordOrderEarnings } = require("./creatorLedger.service");
const { recordSuspense } = require("./settlementReconciliation.service");

/** 只讀地算出一張訂單的結算數字（shadow 與正式路徑共用）。 */
async function previewOrderSettlement(executor, orderId) {
  const { rows: orderRows } = await executor.query(
    `SELECT id, discount_amount, total_amount FROM orders WHERE id = $1`,
    [orderId]
  );
  if (orderRows.length === 0) throw new Error(`previewOrderSettlement: unknown order ${orderId}`);

  const { rows: itemRows } = await executor.query(
    `SELECT id, seller_id, subtotal FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId]
  );

  return computeOrderSettlement({
    items: itemRows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      subtotal: Number(row.subtotal),
    })),
    orderDiscount: Number(orderRows[0].discount_amount ?? 0),
  });
}

/**
 * 於付款核准的 transaction 內呼叫。
 *
 * @param {object} client 已 BEGIN 的 pg client
 * @param {{orderId: string, actorId: string|null, paidAt: Date|string}} input
 */
async function onOrderPaymentApproved(client, { orderId, actorId = null, paidAt }) {
  // `DEC-26`：以 `paid_at` 為錨點、依**當時生效的政策**算一次後持久化。
  // `refund_window_end IS NULL` 的條件讓它 write-once —— 重跑不會改寫歷史承諾。
  await client.query(
    `UPDATE orders SET refund_window_end = $2
      WHERE id = $1 AND refund_window_end IS NULL`,
    [orderId, refundWindowEndAt(paidAt)]
  );

  if (!isSettlementWriteEnabled()) {
    const shadow = await previewOrderSettlement(client, orderId);
    return { written: false, mode: "shadow", settlement: shadow };
  }

  const { entries, settlement } = await recordOrderEarnings(client, { orderId, actorId });

  // `DEC-36`／`DEC-37`：`seller_id IS NULL` 的品項**不得**被自動歸屬給任何創作者，
  // 也**不得**靜默消失。金額進懸記，維持可識別、可稽核、且永不呈現為創作者應付。
  //
  // ⚠️ 進懸記的是**品項淨額**，不是已經切好的 80％ —— `DEC-37` 禁止把未歸屬金額
  // 自動視為平台抽成或平台所有之收入，而先算出一筆 commission 正是那件事。
  // 80／20 留到對帳歸屬成立時才套用。
  const suspense = [];
  for (const item of settlement.unattributed) {
    if (item.itemNetAmount <= 0) continue;
    const recorded = await recordSuspense(client, {
      orderId,
      orderItemId: item.orderItemId,
      netAmount: item.itemNetAmount,
      sourceType: "order",
      sourceId: orderId,
      note: "order item has no seller_id at payment approval (DEC-36)",
      actorId,
    });
    suspense.push(recorded.suspense);
  }

  return { written: true, mode: "live", entries, suspense, settlement };
}

module.exports = {
  previewOrderSettlement,
  onOrderPaymentApproved,
};
