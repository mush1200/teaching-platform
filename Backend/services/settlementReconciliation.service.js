/**
 * Legacy 對帳與未歸屬懸記 —— `DEC-27`／`DEC-36`／`DEC-37`。
 *
 * ## 三個階段**嚴格分離**
 *
 * | 階段 | 內容 | 寫入 |
 * | --- | --- | --- |
 * | A. census | 清點 | **無** |
 * | B. decision | 逐例外記錄處置與證據 | 僅 run 記錄 |
 * | C. write | opening 分錄／suspense | 有，且冪等 |
 *
 * 分離不是潔癖：`DEC-27` §K2 對 `approved` ＋ `paid_at IS NULL` 要求 **FAIL CLOSED**
 * —— 不得自動進入創作者應付、不得繼承猜測付款日、也不得**無處置記錄地被靜默排除**。
 * 把清點與寫入混在一起，第三種錯誤（靜默排除）幾乎必然發生。
 *
 * ## 冪等是必要而非可選
 *
 * `DEC-27` §K8：bootstrap 的 legacy 語句**每次啟動都執行**。因此 C 階段的每一筆
 * 寫入都靠 DB 的 partial UNIQUE 去重（opening 每個 `order_item_id` 一筆；
 * suspense 每個 `order_item_id` 一筆），**不靠應用層記得自己跑過**。
 */

const { writeActivityLog } = require("../utils/activityLog");
const { splitCreatorShare } = require("../utils/settlementMoney");
const { cycleIdForInstant } = require("../utils/settlementPolicy");
const { ensureCycle } = require("./settlementHold.service");

/**
 * A 階段 —— **完全唯讀**的清點。
 *
 * 不寫入任何東西，也不呼叫任何寫入函式。這裡的每一個分類都是後續階段的輸入。
 */
async function census(executor) {
  const { rows } = await executor.query(`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE status = 'approved' AND paid_at IS NULL)::int
        AS approved_without_paid_at,
      (SELECT COUNT(*) FROM orders WHERE status = 'approved' AND paid_at IS NOT NULL)::int
        AS approved_with_paid_at,
      (SELECT COUNT(*) FROM orders
        WHERE status = 'approved' AND paid_at IS NOT NULL AND refund_window_end IS NULL)::int
        AS approved_paid_without_refund_window,
      (SELECT COUNT(*) FROM order_items WHERE seller_id IS NULL)::int
        AS items_without_seller,
      (SELECT COUNT(*) FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'approved' AND o.paid_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM creator_ledger_entries e
             WHERE e.order_id = oi.order_id AND e.entry_type = 'earning'
          ))::int AS paid_items_without_ledger,
      (SELECT COUNT(*) FROM unattributed_suspense_entries WHERE state = 'open')::int
        AS open_suspense_entries,
      (SELECT COALESCE(SUM(net_amount), 0) FROM unattributed_suspense_entries WHERE state = 'open')::int
        AS open_suspense_net_amount,
      (SELECT COUNT(*) FROM materials WHERE price <> trunc(price) OR price < 30)::int
        AS listing_price_violations
  `);
  return rows[0];
}

/** 開始一次對帳 run。 */
async function startRun(client, { runScope, phase, startedBy = null, note = null }) {
  const { rows } = await client.query(
    `INSERT INTO reconciliation_runs (run_scope, phase, started_by, note)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [runScope, phase, startedBy, note]
  );
  return rows[0];
}

/** 結束一次對帳 run 並保存報表。 */
async function completeRun(client, { runId, report, status = "completed", actorId = null }) {
  const { rows } = await client.query(
    `UPDATE reconciliation_runs
        SET status = $2, completed_at = NOW(), report = $3::jsonb
      WHERE id = $1 RETURNING *`,
    [runId, status, JSON.stringify(report ?? {})]
  );
  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "reconciliation_run",
    targetId: runId,
    action: "reconciliation.run_completed",
    meta: { status, report: report ?? {} },
  });
  return rows[0];
}

/**
 * C 階段 —— legacy 期初應付分錄。
 *
 * `opening` 分錄與正常結算**結構上可區分**（`entry_type` ＋
 * `source_type = 'reconciliation_run'`），滿足 `DEC-27` §K1
 * 「必須可與 `PRE-18` 上線後的正常結算區分，不得靜默混用」。
 *
 * 冪等由 `cle_one_opening_per_order_item` 這個 partial unique index 保證 ——
 * 重跑第二次會走 `DO NOTHING`，回傳既有列。
 */
async function recordLegacyOpening(
  client,
  { runId, orderId, orderItemId, creatorId, creatorNetSales, actorId = null }
) {
  if (!Number.isInteger(creatorNetSales) || creatorNetSales <= 0) {
    throw new Error(
      `recordLegacyOpening: creatorNetSales must be a positive integer (got ${creatorNetSales})`
    );
  }
  // 對帳分錄是**創作者經濟歸屬**，不是一筆沒有來歷的餘額：`DEC-24` 的 80／20 與
  // `DEC-31` 的取整在這裡才第一次套用（創作者此刻才確定），而且只套用一次。
  // 三個欄位一起寫入，`cle_attributed_split_check` 因此能證明恆等式成立，
  // 報表也才分得出 `DEC-37` 要求的「創作者已歸屬 / 平台抽成」兩條線。
  const split = splitCreatorShare(creatorNetSales);
  const { rows } = await client.query(
    `INSERT INTO creator_ledger_entries
       (creator_id, entry_type, amount, creator_net_sales, platform_commission,
        order_id, order_item_id, source_type, source_id, created_by)
     VALUES ($1, 'opening', $2, $3, $4, $5, $6, 'reconciliation_run', $7, $8)
     ON CONFLICT (order_item_id) WHERE entry_type = 'opening' DO NOTHING
     RETURNING *`,
    [
      creatorId,
      split.creatorEarnings,
      split.creatorNetSales,
      split.platformCommission,
      orderId,
      orderItemId,
      runId,
      actorId,
    ]
  );
  if (rows.length === 0) {
    const { rows: existing } = await client.query(
      `SELECT * FROM creator_ledger_entries
        WHERE order_item_id = $1 AND entry_type = 'opening'`,
      [orderItemId]
    );
    return { entry: existing[0], created: false };
  }

  await client.query(
    `INSERT INTO creator_payable_slices (ledger_entry_id, order_item_id, amount)
     VALUES ($1, $2, $3)`,
    [rows[0].id, orderItemId, split.creatorEarnings]
  );

  return { entry: rows[0], created: true };
}

/**
 * `DEC-37` 未歸屬懸記。
 *
 * **刻意不放進 ledger**：`creator_ledger_entries.creator_id` 是 NOT NULL，
 * 那正是讓「無歸屬即無創作者責任」成為結構性保證的機制。
 * 懸記反映**歸屬未決**，不是所有權已定 —— 不得視為平台收入、不得沒收、
 * 不得 write-off、不得自動退款。
 */
async function recordSuspense(
  client,
  { orderId, orderItemId, netAmount, sourceType, sourceId, note = null, actorId = null, now = new Date() }
) {
  if (!Number.isInteger(netAmount) || netAmount <= 0) {
    throw new Error(`recordSuspense: netAmount must be a positive integer (got ${netAmount})`);
  }
  const cycleId = await ensureCycle(client, cycleIdForInstant(now));
  const { rows } = await client.query(
    `INSERT INTO unattributed_suspense_entries
       (order_id, order_item_id, net_amount, cycle_id, source_type, source_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (order_item_id) DO NOTHING
     RETURNING *`,
    [orderId, orderItemId, netAmount, cycleId, sourceType, sourceId, note]
  );
  if (rows.length === 0) {
    const { rows: existing } = await client.query(
      `SELECT * FROM unattributed_suspense_entries WHERE order_item_id = $1`,
      [orderItemId]
    );
    return { suspense: existing[0], created: false };
  }

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "unattributed_suspense_entry",
    targetId: rows[0].id,
    action: "suspense.recorded",
    meta: { order_id: orderId, order_item_id: orderItemId, net_amount: netAmount, source_type: sourceType },
  });

  return { suspense: rows[0], created: true };
}

/**
 * 日後歸屬 —— `DEC-36` §R2 的明示可稽核對帳。
 *
 * 一個 transaction 內：標記懸記為 `resolved` ＋ 寫入 ledger 分錄 ＋ **雙向連結**。
 * 原懸記歷程**保留**，不得靜默改寫。
 *
 * ⚠️ 產生的分錄是 **`opening`（`source_type = 'reconciliation_run'`）而非 `earning`**。
 * 設計文件寫的是 earning，但 `earning` 受 invariant 3
 * （每訂單每創作者唯一）約束：若該創作者在同一張訂單上已有正常 earning 分錄，
 * 補歸屬就會撞上唯一索引。改用對帳分錄型別同時滿足兩件事 ——
 * **不撞唯一性**，且**結構上可與正常結算區分**（`DEC-27` §K1 正是這麼要求的）。
 * 資格判定不受影響：該訂單若有 `refund_window_end`，仍必須等窗口屆滿
 * （見 `settlement.service.isEligibleAtCutoff`）。
 */
async function resolveSuspense(
  client,
  { suspenseId, creatorId, runId, evidenceReference, actorId = null }
) {
  if (!creatorId) {
    throw new Error("resolveSuspense: attribution cannot be invented (DEC-36 R3)");
  }
  if (!evidenceReference || !String(evidenceReference).trim()) {
    throw new Error("resolveSuspense: an evidence reference is required (DEC-36 R2)");
  }

  const { rows: suspenseRows } = await client.query(
    `SELECT * FROM unattributed_suspense_entries WHERE id = $1 FOR UPDATE`,
    [suspenseId]
  );
  if (suspenseRows.length === 0) throw new Error(`resolveSuspense: unknown suspense ${suspenseId}`);
  const suspense = suspenseRows[0];
  if (suspense.state !== "open") {
    throw new Error(`resolveSuspense: suspense ${suspenseId} is already ${suspense.state}`);
  }

  // 懸記保存的是**無爭議的經濟事實**（品項淨額）；80／20 於此刻才套用，
  // 因為 `DEC-24` 的基數 `creator_net_sales` 到現在才真正存在。
  const { entry, created } = await recordLegacyOpening(client, {
    runId,
    orderId: suspense.order_id,
    orderItemId: suspense.order_item_id,
    creatorId,
    creatorNetSales: Number(suspense.net_amount),
    actorId,
  });

  const { rows } = await client.query(
    `UPDATE unattributed_suspense_entries
        SET state = 'resolved', resolved_entry_id = $2, resolved_at = NOW(),
            resolved_by = $3, evidence_reference = $4
      WHERE id = $1 RETURNING *`,
    [suspenseId, entry.id, actorId, evidenceReference]
  );

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "unattributed_suspense_entry",
    targetId: suspenseId,
    action: "suspense.resolved",
    meta: {
      creator_id: creatorId,
      order_item_id: suspense.order_item_id,
      creator_net_sales: Number(suspense.net_amount),
      creator_earnings: Number(entry.amount),
      platform_commission: Number(entry.platform_commission),
      ledger_entry_id: entry.id,
      ledger_entry_created: created,
      evidence_reference: evidenceReference,
      reconciliation_run_id: runId,
    },
  });

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "order_item",
    targetId: suspense.order_item_id,
    action: "attribution.manually_assigned",
    meta: {
      creator_id: creatorId,
      evidence_reference: evidenceReference,
      reconciliation_run_id: runId,
    },
  });

  return { suspense: rows[0], entry };
}

module.exports = {
  census,
  startRun,
  completeRun,
  recordLegacyOpening,
  recordSuspense,
  resolveSuspense,
};
