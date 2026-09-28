/**
 * Creator ledger —— 金額事實的**唯一寫入點**（`DEC-38`）。
 *
 * ## 這一層的界線
 *
 * 這裡只做「寫入不可變的金額事實 ＋ 讀出餘額」。
 * **不**判斷結算資格、**不**決定期間歸屬、**不**碰 hold —— 那些分別在
 * `settlement.service.js` 與 `settlementHold.service.js`。
 *
 * ## append-only
 *
 * 分錄永不 UPDATE／DELETE（DB trigger 強制）。更正一律走 `reversal` 分錄
 * （`DEC-26` §J5）。這一層不提供任何 update／delete 函式 —— 提供了就會有人用。
 *
 * ## 每個寫入函式都要 `client`
 *
 * 金額寫入一律在呼叫端的 transaction 內完成。這不是風格偏好：earning 分錄必須
 * 與付款核准、`paid_at`、`refund_window_end` **同一個 tx**（設計 §7），否則
 * 訂單狀態與金額事實會分歧。
 */

const { writeActivityLog } = require("../utils/activityLog");
const { computeOrderSettlement } = require("../utils/settlementMoney");

const ENTRY_TYPES = Object.freeze([
  "earning",
  "adjustment",
  "opening",
  "payout_consumption",
  "reversal",
]);

function assertClient(client, fnName) {
  if (!client || typeof client.query !== "function") {
    throw new Error(`${fnName}: a transaction client is required (money writes are never poolless)`);
  }
}

/** 寫入一筆分錄。所有金額事實都經過這裡。 */
async function insertEntry(client, entry) {
  assertClient(client, "insertEntry");
  if (!ENTRY_TYPES.includes(entry.entryType)) {
    throw new Error(`insertEntry: unknown entry_type ${entry.entryType}`);
  }
  const { rows } = await client.query(
    `INSERT INTO creator_ledger_entries
       (creator_id, entry_type, amount, creator_net_sales, platform_commission,
        order_id, order_item_id, source_type, source_id,
        fault_classification_id, reverses_entry_id, occurred_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()), $13)
     RETURNING *`,
    [
      entry.creatorId,
      entry.entryType,
      entry.amount,
      entry.creatorNetSales ?? null,
      entry.platformCommission ?? null,
      entry.orderId ?? null,
      entry.orderItemId ?? null,
      entry.sourceType,
      entry.sourceId,
      entry.faultClassificationId ?? null,
      entry.reversesEntryId ?? null,
      entry.occurredAt ?? null,
      entry.createdBy ?? null,
    ]
  );
  return rows[0];
}

/** 建立一個 root 切片（`parent_slice_id IS NULL`）。 */
async function insertRootSlice(client, { ledgerEntryId, orderItemId, amount }) {
  const { rows } = await client.query(
    `INSERT INTO creator_payable_slices (ledger_entry_id, order_item_id, amount)
     VALUES ($1, $2, $3) RETURNING *`,
    [ledgerEntryId, orderItemId ?? null, amount]
  );
  return rows[0];
}

/**
 * 依 `DEC-23` ＋ `DEC-24` ＋ `DEC-31` 為一張訂單寫入 earning 分錄與切片。
 *
 * **與付款核准同一個 transaction 呼叫。**
 *
 * 回傳的 `unattributed` 是 `seller_id IS NULL` 的品項（`DEC-36`）——
 * 本函式**不**替它們臆造歸屬，也**不**自動寫懸記；由呼叫端（對帳服務）
 * 依 `DEC-37` 明示處理。
 */
async function recordOrderEarnings(client, { orderId, actorId = null }) {
  assertClient(client, "recordOrderEarnings");

  const { rows: orderRows } = await client.query(
    `SELECT id, discount_amount, total_amount FROM orders WHERE id = $1`,
    [orderId]
  );
  if (orderRows.length === 0) throw new Error(`recordOrderEarnings: unknown order ${orderId}`);
  const order = orderRows[0];

  const { rows: itemRows } = await client.query(
    `SELECT id, seller_id, subtotal FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId]
  );

  const settlement = computeOrderSettlement({
    items: itemRows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      subtotal: Number(row.subtotal),
    })),
    orderDiscount: Number(order.discount_amount ?? 0),
  });

  const entries = [];
  for (const creator of settlement.creators) {
    const entry = await insertEntry(client, {
      creatorId: creator.creatorId,
      entryType: "earning",
      amount: creator.creatorEarnings,
      creatorNetSales: creator.creatorNetSales,
      platformCommission: creator.platformCommission,
      orderId,
      sourceType: "order",
      sourceId: orderId,
      createdBy: actorId,
    });

    for (const slice of creator.slices) {
      await insertRootSlice(client, {
        ledgerEntryId: entry.id,
        orderItemId: slice.orderItemId,
        amount: slice.amount,
      });
    }
    if (creator.residueAmount > 0) {
      // `order_item_id IS NULL` 的 residue 切片：承接分錄層級取整的差額，
      // 使 leaf 切片精確加總回分錄金額（invariant 14）。**永遠不可被 hold。**
      await insertRootSlice(client, {
        ledgerEntryId: entry.id,
        orderItemId: null,
        amount: creator.residueAmount,
      });
    }

    entries.push(entry);
  }

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "order",
    targetId: orderId,
    action: "creator_ledger.earnings_recorded",
    meta: {
      creators: settlement.creators.map((creator) => ({
        creator_id: creator.creatorId,
        creator_net_sales: creator.creatorNetSales,
        creator_earnings: creator.creatorEarnings,
        platform_commission: creator.platformCommission,
      })),
      platform_rounding_residue: settlement.platformRoundingResidue,
      unattributed_item_count: settlement.unattributed.length,
    },
  });

  return { entries, settlement };
}

/**
 * `DEC-21` 窄例外：**只有**已存在且為 `creator_fault` 的分類才得產生負向調整。
 *
 * 一般／非創作者過失退款維持 Platform absorb，**不產生任何分錄**
 * （`mvp_rules.md` §12.5 未變）。
 */
async function recordAdjustment(
  client,
  { creatorId, amount, faultClassificationId, sourceType, sourceId, orderId, orderItemId, actorId }
) {
  assertClient(client, "recordAdjustment");
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error(`recordAdjustment: amount must be a non-zero integer (got ${amount})`);
  }

  if (amount < 0) {
    if (!faultClassificationId) {
      throw new Error(
        "recordAdjustment: a negative adjustment requires a creator_fault classification (DEC-21/DEC-35)"
      );
    }
    const { rows } = await client.query(
      `SELECT result, creator_id FROM creator_fault_classifications WHERE id = $1`,
      [faultClassificationId]
    );
    if (rows.length === 0) {
      throw new Error(`recordAdjustment: unknown fault classification ${faultClassificationId}`);
    }
    if (rows[0].result !== "creator_fault") {
      throw new Error(
        "recordAdjustment: non_creator_fault must be absorbed by the platform; no ledger entry is written (DEC-35 Q5)"
      );
    }
    if (rows[0].creator_id !== creatorId) {
      throw new Error(
        "recordAdjustment: classification belongs to a different creator; refusing to create liability"
      );
    }
  }

  const entry = await insertEntry(client, {
    creatorId,
    entryType: "adjustment",
    amount,
    orderId,
    orderItemId,
    sourceType,
    sourceId,
    faultClassificationId: faultClassificationId ?? null,
    createdBy: actorId ?? null,
  });

  // 正向調整同樣需要切片才能參與結算；負向調整不建立切片（它沖抵的是既有餘額）。
  if (amount > 0) {
    await insertRootSlice(client, {
      ledgerEntryId: entry.id,
      orderItemId: orderItemId ?? null,
      amount,
    });
  }

  await writeActivityLog({
    client,
    actorId: actorId ?? null,
    actorRole: actorId ? "admin" : null,
    targetType: "creator_ledger_entry",
    targetId: entry.id,
    action: "creator_ledger.adjusted",
    meta: {
      creator_id: creatorId,
      amount,
      fault_classification_id: faultClassificationId ?? null,
      source_type: sourceType,
      source_id: sourceId,
    },
  });

  return entry;
}

/**
 * 沖正一筆既有分錄（`DEC-26` §J5：更正不得靜默覆寫）。
 *
 * 產生一筆金額相反的 `reversal`，**原分錄原封不動**。
 */
async function recordReversal(client, { entryId, reason, actorId }) {
  assertClient(client, "recordReversal");
  const { rows } = await client.query(`SELECT * FROM creator_ledger_entries WHERE id = $1`, [
    entryId,
  ]);
  if (rows.length === 0) throw new Error(`recordReversal: unknown ledger entry ${entryId}`);
  const original = rows[0];

  const entry = await insertEntry(client, {
    creatorId: original.creator_id,
    entryType: "reversal",
    amount: -Number(original.amount),
    orderId: original.order_id,
    orderItemId: original.order_item_id,
    sourceType: original.source_type,
    sourceId: original.source_id,
    reversesEntryId: entryId,
    createdBy: actorId ?? null,
  });

  await writeActivityLog({
    client,
    actorId: actorId ?? null,
    actorRole: actorId ? "admin" : null,
    targetType: "creator_ledger_entry",
    targetId: entry.id,
    action: "creator_ledger.reversed",
    meta: { reverses_entry_id: entryId, amount: entry.amount, reason: reason ?? null },
  });

  return entry;
}

/**
 * 創作者的**帳面**應付餘額（含被 hold 的部分）。
 *
 * ⚠️ 這**不是**可撥付金額 —— hold 只是暫時不 eligible，並未消滅應付
 * （`DEC-32` §P3：`hold ≠ 消滅`）。可撥付金額請用 `settlement.service`。
 */
async function carriedBalance(executor, creatorId) {
  const { rows } = await executor.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS balance
       FROM creator_ledger_entries WHERE creator_id = $1`,
    [creatorId]
  );
  return rows[0].balance;
}

module.exports = {
  ENTRY_TYPES,
  insertEntry,
  insertRootSlice,
  recordOrderEarnings,
  recordAdjustment,
  recordReversal,
  carriedBalance,
};
