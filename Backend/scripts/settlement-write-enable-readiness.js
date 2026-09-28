#!/usr/bin/env node
/**
 * `PRE-18` —— **`SETTLEMENT_WRITE_ENABLED` 啟用前的正式 readiness gate**。
 *
 * ## 這支腳本不會啟用任何東西
 *
 * 它**只檢查**，然後回 PASS／FAIL。**不含任何 `INSERT`／`UPDATE`／`DELETE`／DDL**，
 * 也不會去改環境變數或部署設定。啟用旗標永遠是人的決定，這裡只是讓那個決定
 * 有依據，而不是靠印象。
 *
 * ## 判準
 *
 * 每一條都必須 PASS：
 *
 * | # | 檢查 | 為什麼 |
 * | --- | --- | --- |
 * | 1 | settlement schema 存在 | 沒有表就沒有可寫的地方 |
 * | 2 | migration chain 完整套用 | bootstrap 與 migration 不得分歧 |
 * | 3 | invariant 零違反 | 任一違反即設計 §21 的 rollback trigger |
 * | 4 | `DEC-24` 兩階段恆等式全數成立 | 金額算錯就不該開 |
 * | 5 | 無重複 earning 候選 | invariant 3 的事前檢查 |
 * | 6 | 對帳狀態可接受 | 未處置的 fail-closed 族群必須先有決定 |
 * | 7 | 未歸屬金額已隔離 | `DEC-36`／`DEC-37`：不得變成創作者應付 |
 * | 8 | 稽核原子性可用 | `PRE-18` §W 的選用 client |
 * | 9 | 撥款 API 受旗標約束 | 開旗標前先確認閘門真的在 |
 * | 10 | 旗標目前為 OFF | 已經開著就不是「啟用前檢查」 |
 *
 * ## 第 6 條刻意不是「必須為 0」
 *
 * `approved` ＋ `paid_at IS NULL` 與 `seller_id IS NULL` 的存在**本身不是錯誤** ——
 * `DEC-27` §K2／`DEC-36` 要求的是**逐筆有明示處置**，不是要求它們消失。
 * 因此這裡回報數量並標為 **REQUIRES_DISPOSITION**，由操作者判斷是否已處置完畢；
 * 腳本**不會**替它們決定，也不會因為有這些列就自動 FAIL。
 *
 * ```bash
 * node scripts/settlement-write-enable-readiness.js
 * node scripts/settlement-write-enable-readiness.js --json
 * ```
 */

// `quiet` 是必要的，不是偏好：`--json` 模式的 stdout 必須**只有 JSON**，
// 否則 dotenv 的提示橫幅會讓機器讀取端在第一個字元就解析失敗。
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const { isSettlementWriteEnabled } = require("../utils/settlementPolicy");
const { computeOrderSettlement } = require("../utils/settlementMoney");
const reconciliationService = require("../services/settlementReconciliation.service");

function getDb() {
  return require("../config/db");
}

const SETTLEMENT_TABLES = [
  "payout_cycles",
  "creator_fault_classifications",
  "creator_ledger_entries",
  "creator_payable_slices",
  "settlement_holds",
  "settlement_hold_allocations",
  "unattributed_suspense_entries",
  "creator_cycle_statements",
  "payout_items",
  "payout_allocations",
  "reconciliation_runs",
];

async function main() {
  const asJson = process.argv.includes("--json");
  const db = getDb();
  const checks = [];

  const add = (id, label, status, detail, extra) =>
    checks.push({ id, label, status, detail, ...(extra || {}) });

  const { rows: who } = await db.query(
    `SELECT current_database() AS database, current_user AS "user"`
  );

  // 1. schema present
  const { rows: tables } = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [SETTLEMENT_TABLES]
  );
  const present = tables.map((r) => r.table_name);
  const missing = SETTLEMENT_TABLES.filter((t) => !present.includes(t));
  add(
    "schema_present",
    "all eleven settlement tables exist",
    missing.length === 0 ? "PASS" : "FAIL",
    missing.length === 0 ? `${present.length}/11` : `missing: ${missing.join(", ")}`
  );

  if (missing.length > 0) {
    return finish(checks, who[0], asJson); // 後面全部依賴 schema
  }

  // 2. migration chain fully applied — every trigger the chain defines must exist
  const { settlementSchemaSql, settlementMigrationFiles } = require("../models/settlementSchema");
  const sql = settlementSchemaSql();
  const expectedTriggers = [
    ...new Set(
      (sql.match(/CREATE (?:CONSTRAINT )?TRIGGER (\w+)/g) || []).map((m) =>
        m.replace(/CREATE (?:CONSTRAINT )?TRIGGER /, "")
      )
    ),
  ];
  const { rows: liveTriggers } = await db.query(
    `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1)`,
    [expectedTriggers]
  );
  const missingTriggers = expectedTriggers.filter(
    (t) => !liveTriggers.some((r) => r.tgname === t)
  );
  add(
    "migrations_current",
    "migration chain fully applied",
    missingTriggers.length === 0 ? "PASS" : "FAIL",
    missingTriggers.length === 0
      ? `${settlementMigrationFiles().length} file(s), ${expectedTriggers.length} triggers present`
      : `missing triggers: ${missingTriggers.join(", ")}`
  );

  // 3. invariants
  const { runInvariantChecks } = require("../utils/settlementInvariants");
  const invariants = await runInvariantChecks(db);
  add(
    "no_invariant_violations",
    "invariant checks clean",
    invariants.ok ? "PASS" : "FAIL",
    `${invariants.violations.length} violation(s) across ${invariants.checked} checks` +
      (invariants.ok ? "" : `: ${invariants.violations.map((v) => v.key).join(", ")}`)
  );

  // 4. DEC-24 identity across every approved+paid order
  const { rows: orders } = await db.query(
    `SELECT id, discount_amount, total_amount FROM orders
      WHERE status = 'approved' AND paid_at IS NOT NULL ORDER BY id`
  );
  let identityFailures = 0;
  for (const order of orders) {
    const { rows: items } = await db.query(
      `SELECT id, seller_id, subtotal FROM order_items WHERE order_id = $1 ORDER BY id`,
      [order.id]
    );
    try {
      const s = computeOrderSettlement({
        items: items.map((i) => ({
          id: i.id,
          sellerId: i.seller_id,
          subtotal: Number(i.subtotal),
        })),
        orderDiscount: Number(order.discount_amount ?? 0),
      });
      const total =
        s.creators.reduce((sum, c) => sum + c.creatorEarnings + c.platformCommission, 0) +
        s.unattributed.reduce((sum, i) => sum + i.itemNetAmount, 0) +
        s.platformRoundingResidue;
      if (total !== Number(order.total_amount)) identityFailures += 1;
    } catch {
      identityFailures += 1;
    }
  }
  add(
    "shadow_identities_pass",
    "DEC-24 two-stage identity holds for every paid order",
    identityFailures === 0 ? "PASS" : "FAIL",
    `${orders.length} order(s), ${identityFailures} failure(s)`
  );

  // 5. duplicate earning candidates
  const { rows: dupes } = await db.query(
    `SELECT order_id, creator_id FROM creator_ledger_entries
      WHERE entry_type = 'earning' GROUP BY order_id, creator_id HAVING COUNT(*) > 1`
  );
  add(
    "no_duplicate_earnings",
    "no duplicate earning rows",
    dupes.length === 0 ? "PASS" : "FAIL",
    `${dupes.length} duplicate group(s)`
  );

  // 6. reconciliation dispositions — the blocking form of the DEC-27 K3 requirement
  //
  // `DEC-27` §K2 不要求那些列消失，但**要求每一列都有明示處置**。
  // 因此判準不是「數量為 0」，而是「**偵測到的列是否都已被處置**」。
  // 有偵測、缺處置 → BLOCKED_BY_DISPOSITION，絕不可回 READY。
  const outstanding = await reconciliationService.outstandingDispositions(db);
  add(
    "dispositions_recorded",
    "every DEC-27 manual-disposition row has an explicit auditable disposition",
    outstanding.total === 0 ? "PASS" : "BLOCKING",
    outstanding.total === 0
      ? "no row awaits a disposition"
      : `awaiting disposition — orders without paid_at: ${outstanding.approvedWithoutPaidAt.length}, ` +
        `unattributed items: ${outstanding.unattributedOrderItems.length} ` +
        "(record one per row; they are never auto-resolved)",
    { outstanding }
  );

  // 7. unattributed money isolated from creator payable
  const { rows: leak } = await db.query(
    `SELECT COUNT(*)::int AS n FROM unattributed_suspense_entries u
      WHERE u.state = 'open'
        AND EXISTS (SELECT 1 FROM creator_ledger_entries e WHERE e.order_item_id = u.order_item_id)`
  );
  add(
    "external_blockers_isolated",
    "unattributed money never reaches creator payable",
    leak[0].n === 0 ? "PASS" : "FAIL",
    `${leak[0].n} leaked suspense row(s); creator_id NOT NULL makes this structural`
  );

  // 8. activity-log atomicity capability (PRE-18 §W)
  const activityLog = fs.readFileSync(
    path.join(__dirname, "..", "utils", "activityLog.js"),
    "utf8"
  );
  const atomic = /client\s*=\s*null/.test(activityLog) && /client \|\| db/.test(activityLog);
  add(
    "activity_log_atomicity",
    "writeActivityLog accepts a transaction client",
    atomic ? "PASS" : "FAIL",
    atomic ? "optional client supported" : "helper cannot join a caller transaction"
  );

  // 9. payout APIs gated
  const route = fs.readFileSync(
    path.join(__dirname, "..", "routes", "adminSettlement.js"),
    "utf8"
  );
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // 記錄處置刻意不受旗標約束（不移動金錢，且是開旗標的前置條件）。
  // 這個例外必須**明列**，否則閘門會對自己的設計誤報。
  const UNGATED_BY_DESIGN = ["/settlement/reconciliation/dispositions"];
  const posts = [...code.matchAll(/router\.post\("([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => !UNGATED_BY_DESIGN.includes(r));
  const ungated = posts.filter((r) => {
    const start = code.indexOf(`router.post("${r}"`);
    const next = code.indexOf("\nrouter.", start + 1);
    return !/isSettlementWriteEnabled\(\)/.test(code.slice(start, next === -1 ? undefined : next));
  });
  add(
    "payout_apis_gated",
    "every settlement write endpoint is flag-gated",
    ungated.length === 0 ? "PASS" : "FAIL",
    ungated.length === 0 ? `${posts.length} endpoint(s) gated` : `ungated: ${ungated.join(", ")}`
  );

  // 10. flag currently OFF
  const flagOn = isSettlementWriteEnabled();
  add(
    "flag_currently_off",
    "SETTLEMENT_WRITE_ENABLED is currently OFF",
    flagOn ? "FAIL" : "PASS",
    flagOn ? "already enabled — this is no longer a pre-enable check" : "OFF"
  );

  return finish(checks, who[0], asJson);
}

/**
 * 結果狀態 —— **不再有「PASS 但同時有未決事項」這種自相矛盾的輸出**。
 *
 * 一個用來決定「可不可以開啟 production 金流寫入」的閘門，只要還有未處置的
 * `DEC-27` 列，就必須擋下來。先前的版本會回 PASS 並在旁邊註記
 * REQUIRES_DISPOSITION —— 那是把判斷責任丟回給讀的人，對這種閘門並不安全。
 *
 * 阻擋原因依嚴重度取**第一個**成立者，讓輸出永遠指得出「先修哪一個」。
 */
const BLOCK_PRECEDENCE = [
  ["schema_present", "BLOCKED_BY_SCHEMA"],
  ["migrations_current", "BLOCKED_BY_SCHEMA"],
  ["no_invariant_violations", "BLOCKED_BY_INVARIANT"],
  ["dispositions_recorded", "BLOCKED_BY_DISPOSITION"],
];

function finish(checks, target, asJson) {
  const bad = checks.filter((c) => c.status === "FAIL" || c.status === "BLOCKING");

  let verdict = "READY";
  let blockedBy = null;
  if (bad.length > 0) {
    verdict = "NOT_READY";
    for (const [id, reason] of BLOCK_PRECEDENCE) {
      if (bad.some((c) => c.id === id)) {
        verdict = reason;
        blockedBy = id;
        break;
      }
    }
    if (blockedBy === null) blockedBy = bad[0].id;
  }

  const report = {
    check: "pre18_settlement_write_enable_readiness",
    target,
    generatedAt: new Date().toISOString(),
    verdict,
    ready: verdict === "READY",
    blockedBy,
    reasons: bad.map((c) => ({ id: c.id, status: c.status, detail: c.detail })),
    checks,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("");
    console.log(`PRE-18 write-enable readiness — ${target.database}`);
    console.log("=".repeat(70));
    for (const c of checks) {
      const mark = c.status === "PASS" ? "PASS " : c.status === "BLOCKING" ? "BLOCK" : "FAIL ";
      console.log(`  [${mark}] ${String(c.id).padEnd(34)} ${c.detail}`);
    }
    console.log("");
    console.log(`VERDICT: ${verdict}`);
    if (verdict !== "READY") {
      console.log("");
      console.log("Reasons:");
      for (const r of bad) console.log(`  - ${r.id}: ${r.detail}`);
      console.log("");
      console.log("SETTLEMENT_WRITE_ENABLED must remain OFF.");
    }
    console.log("");
  }
  process.exitCode = verdict === "READY" ? 0 : 1;
  return report;
}

main()
  .catch((err) => {
    console.error("readiness check failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = require.cache[require.resolve("../config/db")]?.exports;
    if (db && db.pool && typeof db.pool.end === "function") await db.pool.end();
  });
