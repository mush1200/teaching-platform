#!/usr/bin/env node
/**
 * `PRE-18` Phase 0 —— 結算 **read-only census** ＋ invariant 檢查。
 *
 * ## 只清點，不寫入
 *
 * **不含任何 `INSERT`／`UPDATE`／`DELETE`／DDL**，也不提供 `--fix`。
 * `DEC-27` 的三階段（census → decision → write）之所以嚴格分離，是因為
 * §K2 對 `approved` ＋ `paid_at IS NULL` 要求 **FAIL CLOSED**：
 * 不得自動進入創作者應付、不得繼承猜測付款日、也**不得無處置記錄地被靜默排除**。
 * 把清點與寫入混在一起，第三種錯誤幾乎必然發生。
 *
 * ## 輸出的每一個數字代表什麼
 *
 * | 欄位 | 意義 | 為什麼要看 |
 * | --- | --- | --- |
 * | `approved_without_paid_at` | `DEC-27` §K2 的 fail-closed 族群 | 必須逐筆人工處置 |
 * | `approved_paid_without_refund_window` | 沒有持久化期限的已付訂單 | legacy，**不得** backfill |
 * | `items_without_seller` | `DEC-36` 未歸屬品項 | 只能進懸記 |
 * | `paid_items_without_ledger` | 已付但無 earning 分錄 | shadow 期間的正常狀態；上線後應趨近 0 |
 * | `open_suspense_*` | `DEC-37` 懸記 | 必須在報表自成一行，不得埋進 order-level 彙總 |
 * | `listing_price_violations` | `COR-09` 交叉確認 | DB 已有約束，這裡應恆為 0 |
 *
 * ## 隱私
 *
 * 輸出只有計數與金額，**不含**教材標題、買家或創作者身分、銀行參考。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/settlement-census.js
 * node scripts/settlement-census.js --json
 * ```
 */

require("dotenv").config();

const { census } = require("../services/settlementReconciliation.service");
const { runInvariantChecks } = require("../utils/settlementInvariants");

function getDb() {
  // 延遲 require：設定錯誤才會以一行可讀訊息浮現，而不是在 import 時就爆。
  return require("../config/db");
}

/**
 * settlement schema 是由 bootstrap 於**啟動時**套用的。對一個還沒啟動過的資料庫
 * 直接跑 census，會得到「column does not exist」這種指不出原因的錯誤。
 */
async function assertSchemaPresent(db) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'creator_ledger_entries'`
  );
  if (rows[0].n === 0) {
    const { rows: dbRows } = await db.query("SELECT current_database() AS name");
    throw new Error(
      `settlement schema is not present in database "${dbRows[0].name}". ` +
        "It is applied by bootstrap on startup, or manually via " +
        "Backend/migrations/20260928_pre18_settlement_core.sql."
    );
  }
}

async function main() {
  const asJson = process.argv.includes("--json");
  const db = getDb();

  await assertSchemaPresent(db);
  const counts = await census(db);
  const invariants = await runInvariantChecks(db);

  if (asJson) {
    console.log(JSON.stringify({ counts, invariants }, null, 2));
    return;
  }

  const pad = (label) => String(label).padEnd(38, " ");
  console.log("");
  console.log("PRE-18 settlement census (read-only)");
  console.log("------------------------------------");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`${pad(key)}: ${value}`);
  }
  console.log("");
  console.log(`invariant checks run                  : ${invariants.checked}`);
  console.log(`invariant violations                  : ${invariants.violations.length}`);
  for (const violation of invariants.violations) {
    console.log("");
    console.log(`  !! ${violation.key} (invariant ${violation.invariant})`);
    console.log(`     ${violation.why}`);
    console.log(`     offending rows: ${violation.rows.length}`);
  }
  console.log("");
  if (Number(counts.approved_without_paid_at) > 0) {
    console.log(
      "NOTE: approved orders without paid_at must be resolved one by one (DEC-27 K2 fail closed)."
    );
    console.log("      They must NOT be auto-included, auto-dated, or silently dropped.");
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error("settlement census failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = require.cache[require.resolve("../config/db")]?.exports;
    if (db && db.pool && typeof db.pool.end === "function") await db.pool.end();
  });
