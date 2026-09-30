#!/usr/bin/env node
/**
 * `SEC-04` —— 教材封面 placeholder **read-only census**（2026-09-30）。
 *
 * ## 背景
 *
 * 舊版 `bootstrapModel.runIdempotentMigrations()` 每次啟動（含 production）都執行
 * `UPDATE materials SET cover_image_url = 'https://picsum.photos/seed/tp-' || md5(id::text) || '/640/480'`
 * 於無封面的教材。那段寫入已移除（預防已完成），這支腳本回答剩下的問題：
 * **production 裡有沒有被它寫過的列？**
 *
 * ## 這支腳本只做一件事：清點，不修任何東西
 *
 * - **不含任何 `UPDATE`／`DELETE`／`INSERT`／DDL**，也不提供 `--fix`（與 `listing-price-census.js` 同一原則）。
 * - 全部查詢在 **`BEGIN TRANSACTION READ ONLY`** 內執行，並在查詢前**斷言**
 *   `transaction_read_only = on`；結束一律 `ROLLBACK`。即使日後有人誤加寫入語句，資料庫也會拒絕。
 * - 唯讀保證在 transaction 層、由腳本自己斷言，**不依賴** `PGOPTIONS`（Neon 的 pooled endpoint
 *   可能拒絕 startup options，那會讓 operator 的指令失敗而不是更安全）。
 *
 * ## 判定（CLAUDE.md 不回填歷史；本腳本**只回報**，處置由 Owner 決定）
 *
 * | 結果 | 意義 |
 * | --- | --- |
 * | `CLOSE` | `bootstrap_written_exact = 0` 且 `picsum_any = 0` —— 未發現歷史影響 |
 * | `REMEDIATION_OPEN` | `bootstrap_written_exact > 0` —— 確定是啟動寫入造成；依 status 分類回報 |
 * | `REVIEW_MANUAL_PICSUM` | `bootstrap_written_exact = 0` 但 `picsum_any > 0` —— 不是啟動寫入的模式，需人工判斷是否為合法使用 |
 *
 * `bootstrap_written_exact` 用**完整網址等值比對**（`tp-` ＋ `md5(id)`），因此能證明來源是啟動寫入，
 * 而不是有人手動貼了一張 picsum 圖。`bootstrap_shape_other_id` 另外清點「形狀是啟動網址、但 md5 不是
 * 本列 id」的列 —— 最可能是從被啟動寫入的教材**複製**過來的；它不改變判定，但 `REVIEW_MANUAL_PICSUM`
 * 時必須一併看（security test 資料庫實測的非啟動 picsum 列全是 Postman fixture `seed/postman-cover`）。
 *
 * ## 隱私
 *
 * 輸出只有計數、`status` 與（`--samples`）教材 `id`／封面網址，不含標題、創作者或任何個資。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/cover-placeholder-census.js            # 摘要
 * node scripts/cover-placeholder-census.js --samples  # 另列 picsum 列的 id／status／url（最多 50）
 * node scripts/cover-placeholder-census.js --json     # 機器可讀
 * ```
 *
 * 目標資料庫由既有的 `config/db.js` 決定（`DATABASE_URL` 或 `PG*`）。腳本會先印出目標資料庫名稱。
 *
 * **Production（operator 執行）**：與 `check-production-db.js` 相同的慣例 —— `DATABASE_URL` 只設在
 * operator 自己的 shell，**不寫進任何檔案、不貼到對話或 issue**：
 *
 * ```bash
 * cd Backend
 * DATABASE_URL='<Neon connection string>' node scripts/cover-placeholder-census.js --samples
 * ```
 */

require("dotenv").config({ quiet: true });

const SAMPLE_LIMIT = 50;

const BOOTSTRAP_URL_SQL = `'https://picsum.photos/seed/tp-' || md5(id::text) || '/640/480'`;

const COUNTS_SQL = `
  SELECT
    count(*)::int AS materials_total,
    count(*) FILTER (WHERE cover_image_url = ${BOOTSTRAP_URL_SQL})::int AS bootstrap_written_exact,
    count(*) FILTER (
      WHERE cover_image_url ~ '^https://picsum\\.photos/seed/tp-[0-9a-f]{32}/640/480$'
        AND cover_image_url <> ${BOOTSTRAP_URL_SQL}
    )::int AS bootstrap_shape_other_id,
    count(*) FILTER (WHERE cover_image_url ILIKE '%picsum.photos%')::int AS picsum_any,
    count(*) FILTER (WHERE cover_image_url IS NULL OR btrim(cover_image_url) = '')::int AS cover_missing
  FROM materials
`;

const EXACT_BY_STATUS_SQL = `
  SELECT status, count(*)::int AS count
  FROM materials
  WHERE cover_image_url = ${BOOTSTRAP_URL_SQL}
  GROUP BY status
  ORDER BY status
`;

const PICSUM_SAMPLES_SQL = `
  SELECT id, status, cover_image_url,
         (cover_image_url = ${BOOTSTRAP_URL_SQL}) AS bootstrap_exact
  FROM materials
  WHERE cover_image_url ILIKE '%picsum.photos%'
  ORDER BY bootstrap_exact DESC, status, id
  LIMIT ${SAMPLE_LIMIT}
`;

/**
 * 在 READ ONLY transaction 內執行 `fn(client)`，結束一律 ROLLBACK。
 * 斷言失敗（transaction 不是唯讀）時**不執行** `fn`。
 */
async function withReadOnlyTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const ro = await client.query("SELECT current_setting('transaction_read_only') AS ro");
    if (ro.rows[0].ro !== "on") {
      throw new Error("ABORT: transaction is not read-only");
    }
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

/** 依 SEC-04 closure rule 判定（純函式，供單元測試）。 */
function classify(counts) {
  if (counts.bootstrap_written_exact > 0) return "REMEDIATION_OPEN";
  if (counts.picsum_any > 0) return "REVIEW_MANUAL_PICSUM";
  return "CLOSE";
}

async function runCensus(client, { samples = false } = {}) {
  const database = (await client.query("SELECT current_database() AS name")).rows[0].name;
  const counts = (await client.query(COUNTS_SQL)).rows[0];
  const exactByStatus = (await client.query(EXACT_BY_STATUS_SQL)).rows;
  const report = {
    database,
    readOnlyTransaction: true,
    generatedAt: new Date().toISOString(),
    counts,
    exactByStatus,
    // 等值比對的列必定也符合 ILIKE；對不上代表 SQL 有錯，寧可大聲失敗。
    reconciles: counts.bootstrap_written_exact <= counts.picsum_any,
    verdict: classify(counts),
  };
  if (samples && counts.picsum_any > 0) {
    report.samples = (await client.query(PICSUM_SAMPLES_SQL)).rows;
    report.samplesTruncated = counts.picsum_any > SAMPLE_LIMIT;
  }
  return report;
}

function print(r) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log("");
  console.log("SEC-04 —— cover placeholder census (READ-ONLY TRANSACTION)");
  console.log("==========================================================");
  console.log(`database                 : ${r.database}`);
  console.log(`generated                : ${r.generatedAt}`);
  console.log(`transaction_read_only    : on (asserted before any query; ended with ROLLBACK)`);
  console.log("");
  console.log(`${pad("materials_total", 26)} ${r.counts.materials_total}`);
  console.log(`${pad("bootstrap_written_exact", 26)} ${r.counts.bootstrap_written_exact}`);
  console.log(`${pad("bootstrap_shape_other_id", 26)} ${r.counts.bootstrap_shape_other_id}  (startup-shaped URL whose md5 is not this row's id → likely copied from a startup-written row)`);
  console.log(`${pad("picsum_any", 26)} ${r.counts.picsum_any}`);
  console.log(`${pad("cover_missing", 26)} ${r.counts.cover_missing}`);
  console.log("");
  console.log("bootstrap_written_exact by status:");
  if (r.exactByStatus.length === 0) console.log("  (none)");
  for (const row of r.exactByStatus) console.log(`  ${pad(row.status, 22)} ${row.count}`);
  if (r.samples) {
    console.log("");
    console.log(`picsum rows (first ${r.samples.length}${r.samplesTruncated ? ", truncated" : ""}):`);
    for (const s of r.samples) {
      console.log(`  ${pad(s.id, 40)} ${pad(s.status, 18)} ${s.bootstrap_exact ? "EXACT " : "other "} ${s.cover_image_url}`);
    }
  }
  console.log("");
  console.log(`reconciles               : ${r.reconciles ? "YES" : "NO !!"}`);
  console.log(`verdict                  : ${r.verdict}`);
  if (r.verdict === "CLOSE") console.log("  → no historical production impact found; SEC-04 may be closed.");
  if (r.verdict === "REMEDIATION_OPEN") console.log("  → prevention is done; historical rows exist. Do NOT mutate — return to Owner.");
  if (r.verdict === "REVIEW_MANUAL_PICSUM") console.log("  → picsum present but NOT the startup pattern; classify manually. Do NOT delete.");
  console.log("");
}

async function main() {
  let db;
  try {
    db = require("../config/db");
  } catch (err) {
    console.error("census cannot run: " + err.message);
    console.error("Set DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (see Backend/.env).");
    process.exit(1);
  }
  const args = new Set(process.argv.slice(2));
  try {
    const report = await withReadOnlyTransaction(db.pool, (client) =>
      runCensus(client, { samples: args.has("--samples") })
    );
    if (args.has("--json")) console.log(JSON.stringify(report, null, 2));
    else print(report);
    if (!report.reconciles) process.exitCode = 2;
  } finally {
    await db.pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("census failed:", err.message);
    process.exit(1);
  });
}

module.exports = { withReadOnlyTransaction, runCensus, classify, BOOTSTRAP_URL_SQL };
