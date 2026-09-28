#!/usr/bin/env node
/**
 * `PRE-18` Phase 3 —— **shadow 計算報表**（只比對，不服務，不寫入）。
 *
 * 對每一張 `approved` ＋ `paid_at IS NOT NULL` 的訂單，用**正式路徑的同一段程式碼**
 * （`settlementMoney.computeOrderSettlement`）算出創作者收益、平台抽成與折扣餘數，
 * 然後驗證 `DEC-24` 的兩階段合併恆等式：
 *
 * ```text
 * Σ(creator_earnings + platform_commission) + platform_discount_residue = orders.total_amount
 * ```
 *
 * 任何一張訂單不成立，就是**現在**該停下來的訊號 —— 而不是上線之後。
 *
 * ## 不寫入任何東西
 *
 * 沒有 `INSERT`／`UPDATE`／`DELETE`／DDL，也不呼叫任何寫入 service。
 * 這支腳本可以在 production 安全地跑。
 *
 * ## 用語
 *
 * 依 `mvp_rules.md` §18.4，「營收」一詞保留給 Admin 的 recognized revenue；
 * 本報表的創作者側一律用 Creator Net Sales／Creator Earnings／Platform Commission，
 * **不重用該詞**。
 *
 * ```bash
 * node scripts/settlement-shadow-report.js
 * node scripts/settlement-shadow-report.js --json
 * ```
 */

require("dotenv").config();

const { computeOrderSettlement } = require("../utils/settlementMoney");

function getDb() {
  return require("../config/db");
}

async function main() {
  const asJson = process.argv.includes("--json");
  const db = getDb();

  const { rows: orders } = await db.query(
    `SELECT id, discount_amount, total_amount
       FROM orders
      WHERE status = 'approved' AND paid_at IS NOT NULL
      ORDER BY id`
  );

  const totals = {
    orders: orders.length,
    recognizedOrderRevenue: 0,
    creatorNetSales: 0,
    creatorEarnings: 0,
    platformCommission: 0,
    platformDiscountResidue: 0,
    unattributedItems: 0,
    unattributedNetAmount: 0,
  };
  const identityFailures = [];

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

    const creatorSide = settlement.creators.reduce(
      (sum, creator) => sum + creator.creatorEarnings + creator.platformCommission,
      0
    );
    const unattributedSide = settlement.unattributed.reduce(
      (sum, item) => sum + item.itemNetAmount,
      0
    );
    const identity = creatorSide + unattributedSide + settlement.platformRoundingResidue;

    if (identity !== Number(order.total_amount)) {
      identityFailures.push({
        orderId: order.id,
        expected: Number(order.total_amount),
        computed: identity,
      });
    }

    totals.recognizedOrderRevenue += Number(order.total_amount);
    totals.platformDiscountResidue += settlement.platformRoundingResidue;
    totals.unattributedItems += settlement.unattributed.length;
    totals.unattributedNetAmount += unattributedSide;
    for (const creator of settlement.creators) {
      totals.creatorNetSales += creator.creatorNetSales;
      totals.creatorEarnings += creator.creatorEarnings;
      totals.platformCommission += creator.platformCommission;
    }
  }

  const report = { totals, identityFailures };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const pad = (label) => String(label).padEnd(34, " ");
  console.log("");
  console.log("PRE-18 shadow settlement report (read-only, nothing written)");
  console.log("-----------------------------------------------------------");
  console.log(`${pad("orders considered")}: ${totals.orders}`);
  console.log(`${pad("Recognized Order Revenue")}: ${totals.recognizedOrderRevenue}`);
  console.log(`${pad("Creator Net Sales")}: ${totals.creatorNetSales}`);
  console.log(`${pad("Creator Earnings")}: ${totals.creatorEarnings}`);
  console.log(`${pad("Platform Commission")}: ${totals.platformCommission}`);
  console.log(`${pad("Platform Discount Residue")}: ${totals.platformDiscountResidue}`);
  console.log(`${pad("Unattributed items")}: ${totals.unattributedItems}`);
  console.log(`${pad("Unattributed net amount")}: ${totals.unattributedNetAmount}`);
  console.log("");
  console.log(`${pad("DEC-24 identity failures")}: ${identityFailures.length}`);
  for (const failure of identityFailures.slice(0, 20)) {
    console.log(`  !! ${JSON.stringify(failure)}`);
  }
  console.log("");
  if (identityFailures.length === 0) {
    console.log("Identity holds for every order considered.");
  } else {
    console.log("STOP: the two-stage identity does not hold. Do not enable SETTLEMENT_WRITE_ENABLED.");
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("shadow report failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = require.cache[require.resolve("../config/db")]?.exports;
    if (db && db.pool && typeof db.pool.end === "function") await db.pool.end();
  });
