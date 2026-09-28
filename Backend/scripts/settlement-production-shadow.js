#!/usr/bin/env node
/**
 * `PRE-18` Batch 3 —— **production-safe 唯讀 shadow ＋ legacy 對帳 census**。
 *
 * ## 這支腳本可以安全地指向 production
 *
 * **不含任何 `INSERT`／`UPDATE`／`DELETE`／DDL**，也沒有 `--fix`、`--write` 之類的旗標。
 * 它**只查詢**，然後把「如果 `PRE-18` 上線，會發生什麼」算出來。
 *
 * ## 它必須能在**還沒有 settlement schema** 的資料庫上跑
 *
 * 這一點是刻意的，而且是整支腳本最重要的設計約束：**production 目前就沒有那些表**
 * （Batch 1／2 已進 main，但 Render 是手動部署）。一支「先要求 schema 存在」的
 * census 在最需要它的時候剛好不能用。
 *
 * 因此本腳本分兩層：
 *
 *   * **Layer 1 —— 訂單側**（`orders`／`order_items`／案件表）：**不需要** settlement schema。
 *     這一層產出 legacy 對帳 census 與預期的創作者經濟事實。
 *   * **Layer 2 —— 結算側**（ledger／slices／holds／cycles）：schema 存在時才跑，
 *     否則明確標記 `skipped`，**不假裝檢查過**。
 *
 * ## 不猜測
 *
 * `paid_at IS NULL` 與 `seller_id IS NULL` 一律列為**需要人工處置**，
 * 不推導付款日、不臆造歸屬（`DEC-27` §K2／`DEC-36`）。
 *
 * ## 隱私
 *
 * 輸出只有計數、金額與 id。**不含** email、姓名、教材標題、銀行資訊。
 *
 * ```bash
 * node scripts/settlement-production-shadow.js
 * node scripts/settlement-production-shadow.js --json
 * node scripts/settlement-production-shadow.js --samples   # 附上需人工處置的 id
 * ```
 */

// `quiet` 是必要的，不是偏好：`--json` 模式的 stdout 必須**只有 JSON**，
// 否則 dotenv 的提示橫幅會讓機器讀取端在第一個字元就解析失敗。
require("dotenv").config({ quiet: true });

const { computeOrderSettlement, splitCreatorShare } = require("../utils/settlementMoney");
const { refundWindowEndAt, cycleIdForInstant } = require("../utils/settlementPolicy");

const SAMPLE_LIMIT = 25;

function getDb() {
  return require("../config/db");
}

async function hasTable(db, name) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows[0].n > 0;
}

async function hasColumn(db, table, column) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows[0].n > 0;
}

/* ------------------------------------------------------------------ *
 * Layer 1 — order-side census (no settlement schema required)
 * ------------------------------------------------------------------ */

async function orderCensus(db, { settlementSchema }) {
  const refundWindowColumn = await hasColumn(db, "orders", "refund_window_end");

  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM orders)::int                                        AS orders_total,
      (SELECT COUNT(*) FROM orders WHERE status = 'approved')::int              AS approved_total,
      (SELECT COUNT(*) FROM orders WHERE status = 'approved' AND paid_at IS NOT NULL)::int
                                                                                AS approved_with_paid_at,
      (SELECT COUNT(*) FROM orders WHERE status = 'approved' AND paid_at IS NULL)::int
                                                                                AS approved_without_paid_at,
      (SELECT COUNT(*) FROM order_items)::int                                   AS order_items_total,
      (SELECT COUNT(*) FROM order_items WHERE seller_id IS NULL)::int           AS items_without_seller,
      (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'approved' AND o.paid_at IS NOT NULL)::int             AS paid_items_total,
      (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'approved' AND o.paid_at IS NOT NULL AND oi.seller_id IS NOT NULL)::int
                                                                                AS attributable_paid_items,
      (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'approved' AND o.paid_at IS NOT NULL AND oi.seller_id IS NULL)::int
                                                                                AS suspense_candidates
  `);
  const census = rows[0];

  census.approved_paid_without_refund_window = refundWindowColumn
    ? (
        await db.query(
          `SELECT COUNT(*)::int AS n FROM orders
            WHERE status = 'approved' AND paid_at IS NOT NULL AND refund_window_end IS NULL`
        )
      ).rows[0].n
    : census.approved_with_paid_at; // 欄位還不存在 ＝ 全部都沒有持久化期限

  // 未結案件（可能導致 hold）。表不存在時明確標記 null，不當成 0。
  census.open_remedy_cases = (await hasTable(db, "refund_remedy_cases"))
    ? (
        await db.query(
          `SELECT COUNT(*)::int AS n FROM refund_remedy_cases
            WHERE status NOT IN ('completed', 'cancelled', 'rejected')`
        )
      ).rows[0].n
    : null;
  census.open_complaints = (await hasTable(db, "consumer_complaints"))
    ? (
        await db.query(
          `SELECT COUNT(*)::int AS n FROM consumer_complaints
            WHERE status NOT IN ('resolved', 'closed')`
        )
      ).rows[0].n
    : null;

  census.settlement_schema_present = settlementSchema;
  census.refund_window_column_present = refundWindowColumn;
  return census;
}

/** 需要人工處置的兩個族群 —— **不得**自動推導。 */
async function manualReviewSamples(db, withSamples) {
  if (!withSamples) return null;
  const { rows: noPaidAt } = await db.query(
    `SELECT id FROM orders WHERE status = 'approved' AND paid_at IS NULL ORDER BY id LIMIT $1`,
    [SAMPLE_LIMIT]
  );
  const { rows: noSeller } = await db.query(
    `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'approved' AND o.paid_at IS NOT NULL AND oi.seller_id IS NULL
      ORDER BY oi.id LIMIT $1`,
    [SAMPLE_LIMIT]
  );
  return {
    approvedWithoutPaidAt: noPaidAt.map((r) => r.id),
    paidItemsWithoutSeller: noSeller.map((r) => r.id),
  };
}

/**
 * 預期的創作者經濟事實 ＋ 切片 ＋ 懸記候選。
 *
 * 逐訂單重跑 `computeOrderSettlement`（正式路徑用的同一段程式碼），並驗證
 * `DEC-24` 的兩階段恆等式。任何一張訂單不成立就是**必須停下來**的訊號。
 */
async function expectedEconomics(db) {
  const { rows: orders } = await db.query(
    `SELECT id, discount_amount, total_amount, paid_at
       FROM orders
      WHERE status = 'approved' AND paid_at IS NOT NULL
      ORDER BY id`
  );

  const totals = {
    ordersConsidered: orders.length,
    recognizedOrderRevenue: 0,
    creatorNetSales: 0,
    creatorEarnings: 0,
    platformCommission: 0,
    platformDiscountResidue: 0,
    expectedEarningEntries: 0,
    expectedPayableSlices: 0,
    expectedResidueSlices: 0,
    expectedSliceTotal: 0,
    suspenseCandidates: 0,
    suspenseNetAmount: 0,
  };
  const identityFailures = [];
  const sliceFailures = [];
  const duplicateEarningCandidates = [];
  const byCycle = new Map();

  for (const order of orders) {
    const { rows: items } = await db.query(
      `SELECT id, seller_id, subtotal FROM order_items WHERE order_id = $1 ORDER BY id`,
      [order.id]
    );

    let settlement;
    try {
      settlement = computeOrderSettlement({
        items: items.map((item) => ({
          id: item.id,
          sellerId: item.seller_id,
          subtotal: Number(item.subtotal),
        })),
        orderDiscount: Number(order.discount_amount ?? 0),
      });
    } catch (err) {
      identityFailures.push({ orderId: order.id, reason: err.message });
      continue;
    }

    // `DEC-24` 兩階段合併恆等式。
    const creatorSide = settlement.creators.reduce(
      (sum, c) => sum + c.creatorEarnings + c.platformCommission,
      0
    );
    const unattributedSide = settlement.unattributed.reduce((sum, i) => sum + i.itemNetAmount, 0);
    const identity = creatorSide + unattributedSide + settlement.platformRoundingResidue;
    if (identity !== Number(order.total_amount)) {
      identityFailures.push({
        orderId: order.id,
        expected: Number(order.total_amount),
        computed: identity,
      });
    }

    // `DEC-31`：每創作者 × 每訂單至多一筆 earning。重複即為候選問題。
    const seen = new Set();
    for (const creator of settlement.creators) {
      if (seen.has(creator.creatorId)) {
        duplicateEarningCandidates.push({ orderId: order.id, creatorId: creator.creatorId });
      }
      seen.add(creator.creatorId);

      // leaf 切片必須精確加總回分錄金額（invariant 14）。
      const sliceTotal = creator.slices.reduce((sum, s) => sum + s.amount, 0);
      if (sliceTotal + creator.residueAmount !== creator.creatorEarnings) {
        sliceFailures.push({ orderId: order.id, creatorId: creator.creatorId });
      }

      totals.creatorNetSales += creator.creatorNetSales;
      totals.creatorEarnings += creator.creatorEarnings;
      totals.platformCommission += creator.platformCommission;
      totals.expectedPayableSlices += creator.slices.length;
      totals.expectedSliceTotal += sliceTotal;
      if (creator.residueAmount > 0) totals.expectedResidueSlices += 1;
    }
    totals.expectedEarningEntries += settlement.creators.length;
    totals.recognizedOrderRevenue += Number(order.total_amount);
    totals.platformDiscountResidue += settlement.platformRoundingResidue;

    for (const item of settlement.unattributed) {
      totals.suspenseCandidates += 1;
      totals.suspenseNetAmount += item.itemNetAmount;
    }

    // 期間歸屬預覽：以持久化規則算出的 `refund_window_end` 決定首次可納入的期間。
    const windowEnd = refundWindowEndAt(order.paid_at);
    const cycleId = cycleIdForInstant(windowEnd);
    const bucket = byCycle.get(cycleId) ?? { orders: 0, expectedPayable: 0 };
    bucket.orders += 1;
    bucket.expectedPayable += settlement.creators.reduce((s, c) => s + c.creatorEarnings, 0);
    byCycle.set(cycleId, bucket);
  }

  return {
    totals,
    identityFailures,
    sliceFailures,
    duplicateEarningCandidates,
    expectedCycleMembership: [...byCycle.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cycleId, v]) => ({ cycleId, ...v })),
  };
}

/* ------------------------------------------------------------------ *
 * Layer 2 — settlement-side (only when the schema exists)
 * ------------------------------------------------------------------ */

async function settlementSideReport(db) {
  const { runInvariantChecks } = require("../utils/settlementInvariants");
  const reporting = require("../services/settlementReporting.service");

  const invariants = await runInvariantChecks(db);
  const identity = await reporting.verifyIdentity(db);
  const { rows: counts } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM creator_ledger_entries)::int      AS ledger_entries,
      (SELECT COUNT(*) FROM creator_payable_slices)::int      AS payable_slices,
      (SELECT COUNT(*) FROM settlement_holds WHERE released_at IS NULL)::int AS open_holds,
      (SELECT COUNT(*) FROM unattributed_suspense_entries WHERE state = 'open')::int AS open_suspense,
      (SELECT COUNT(*) FROM payout_cycles)::int               AS cycles,
      (SELECT COUNT(*) FROM payout_items)::int                AS payout_items,
      (SELECT COUNT(*) FROM payout_items WHERE status = 'paid')::int AS payout_items_paid,
      (SELECT COUNT(*) FROM creator_ledger_entries WHERE entry_type = 'opening')::int AS opening_entries
  `);
  // 既有 earning 與訂單的重複候選（冪等性衝突）。
  const { rows: dupes } = await db.query(
    `SELECT order_id, creator_id, COUNT(*)::int AS n
       FROM creator_ledger_entries WHERE entry_type = 'earning'
      GROUP BY order_id, creator_id HAVING COUNT(*) > 1`
  );
  return {
    skipped: false,
    counts: counts[0],
    invariants: {
      checked: invariants.checked,
      violations: invariants.violations.length,
      keys: invariants.violations.map((v) => v.key),
    },
    reportingIdentity: {
      ok: identity.ok,
      difference: identity.difference,
      lines: identity.lines,
    },
    duplicateEarningRows: dupes,
  };
}

/* ------------------------------------------------------------------ */

async function main() {
  const asJson = process.argv.includes("--json");
  const withSamples = process.argv.includes("--samples");
  const db = getDb();

  const { rows: who } = await db.query(
    `SELECT current_database() AS database, current_user AS "user"`
  );
  const settlementSchema = await hasTable(db, "creator_ledger_entries");

  const census = await orderCensus(db, { settlementSchema });
  const manual = await manualReviewSamples(db, withSamples);
  const economics = await expectedEconomics(db);
  const settlementSide = settlementSchema
    ? await settlementSideReport(db)
    : { skipped: true, reason: "settlement schema is not present in this database" };

  const orderSideBlocking = [
    ...economics.identityFailures.map((f) => ({ layer: "order_side", kind: "dec24_identity", ...f })),
    ...economics.sliceFailures.map((f) => ({ layer: "order_side", kind: "slice_reconstruction", ...f })),
    ...economics.duplicateEarningCandidates.map((f) => ({
      layer: "order_side",
      kind: "duplicate_earning",
      ...f,
    })),
  ];
  const settlementBlocking = settlementSide.skipped
    ? []
    : settlementSide.invariants.keys.map((k) => ({ layer: "settlement", kind: "invariant", key: k }));
  const blocking = [...orderSideBlocking, ...settlementBlocking];

  /*
   * ⚠️ **一個被跳過的層不得看起來像通過的層。**
   *
   * Layer 2 在 settlement schema 不存在時 `skipped` 是**刻意的**（production 部署前
   * 就是這個狀態），因此它不是失敗；但它同樣**不是驗證**。把兩者都算成
   * `NO_UNEXPLAINED_DIFFERENCE`，等於拿部分證據冒充完整驗證。
   *
   * 因此只有**每一層都實際執行且通過**時才給完整結論，否則是 `PARTIAL`。
   */
  const orderSide = orderSideBlocking.length === 0 ? "PASS" : "FAIL";
  const settlementLayer = settlementSide.skipped
    ? "SKIPPED_SCHEMA_ABSENT"
    : settlementBlocking.length === 0
    ? "PASS"
    : "FAIL";

  let overall;
  if (orderSide === "FAIL" || settlementLayer === "FAIL") {
    overall = "STOP_UNEXPLAINED_DIFFERENCE";
  } else if (settlementLayer === "SKIPPED_SCHEMA_ABSENT") {
    overall = "PARTIAL";
  } else {
    overall = "NO_UNEXPLAINED_DIFFERENCE";
  }

  const report = {
    target: who[0],
    generatedAt: new Date().toISOString(),
    readOnly: true,
    census,
    manualReviewSamples: manual,
    economics,
    settlementSide,
    blocking,
    layers: { orderSide, settlementLayer },
    overall,
    // 保留舊欄位名以免既有讀取端突然拿到 undefined；值與 `overall` 相同。
    verdict: overall,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const pad = (label) => String(label).padEnd(40, " ");
  console.log("");
  console.log(`PRE-18 production shadow (READ-ONLY) — ${who[0].database}`);
  console.log("=".repeat(70));
  console.log("");
  console.log("-- order-side census (no settlement schema required) --");
  for (const [key, value] of Object.entries(census)) {
    console.log(`${pad(key)}: ${value === null ? "n/a (table absent)" : value}`);
  }
  console.log("");
  console.log("-- expected creator economics if PRE-18 were enabled --");
  for (const [key, value] of Object.entries(economics.totals)) {
    console.log(`${pad(key)}: ${value}`);
  }
  console.log("");
  console.log("-- expected cycle membership (by persisted refund-window rule) --");
  for (const row of economics.expectedCycleMembership) {
    console.log(`${pad("  " + row.cycleId)}: ${row.orders} orders, payable ${row.expectedPayable}`);
  }
  console.log("");
  console.log("-- settlement side --");
  if (settlementSide.skipped) {
    console.log(`${pad("status")}: SKIPPED — ${settlementSide.reason}`);
  } else {
    for (const [key, value] of Object.entries(settlementSide.counts)) {
      console.log(`${pad(key)}: ${value}`);
    }
    console.log(
      `${pad("invariant violations")}: ${settlementSide.invariants.violations} ` +
        `(of ${settlementSide.invariants.checked} checks)`
    );
    console.log(
      `${pad("reporting identity")}: ${settlementSide.reportingIdentity.ok ? "OK" : "BROKEN"} ` +
        `(difference ${settlementSide.reportingIdentity.difference})`
    );
    console.log(`${pad("duplicate earning rows")}: ${settlementSide.duplicateEarningRows.length}`);
  }
  console.log("");
  console.log(`${pad("BLOCKING DIFFERENCES")}: ${blocking.length}`);
  for (const item of blocking.slice(0, 20)) console.log(`  !! ${JSON.stringify(item)}`);
  console.log("");
  console.log(`${pad("order_side")}: ${orderSide}`);
  console.log(`${pad("settlement_layer")}: ${settlementLayer}`);
  console.log(`OVERALL: ${overall}`);
  if (overall === "PARTIAL") {
    console.log("");
    console.log(
      "PARTIAL: the order-side comparison passed, but the settlement layer did not run " +
        "because the schema is absent. This is NOT a complete settlement shadow verification."
    );
  }
  if (overall === "STOP_UNEXPLAINED_DIFFERENCE") {
    console.log("");
    console.log("STOP: an unexplained difference exists. Do not enable SETTLEMENT_WRITE_ENABLED.");
  }
  if (manual) {
    console.log("");
    console.log("-- ids requiring manual disposition (never auto-resolved) --");
    console.log(`  approved without paid_at : ${manual.approvedWithoutPaidAt.join(", ") || "(none)"}`);
    console.log(`  paid items without seller: ${manual.paidItemsWithoutSeller.join(", ") || "(none)"}`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("production shadow failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = require.cache[require.resolve("../config/db")]?.exports;
    if (db && db.pool && typeof db.pool.end === "function") await db.pool.end();
  });
