#!/usr/bin/env node
/**
 * `COR-09` Phase 0 —— 上架價格 **read-only census**。
 *
 * ## 這支腳本只做一件事：清點，不修任何東西
 *
 * **它不含任何 `UPDATE`／`DELETE`／`INSERT`／DDL。** 這是刻意的：
 * `COR-09` V8 規定的順序是
 *
 * ```text
 * ① read-only census → ② 對帳處理違反列 → ③ 驗證零違反
 *   → ④ 移除 orderService 的靜默 floor → ⑤ 加 DB 層價格約束
 * ```
 *
 * 在 ③ 之前做任何寫入，就等於跳過了讓人**先看見**再決定的那一步。
 * 加一個 `--fix` 旗標會讓「不小心改到歷史價格」重新變成可能，因此**不提供**。
 *
 * ## 分類（互斥，總和必等於 total）
 *
 * | 類別 | 定義 |
 * | --- | --- |
 * | `null_price` | `price IS NULL`（`NOT NULL` 約束下理論上為 0，仍清點以證明） |
 * | `non_positive` | `price <= 0` |
 * | `fractional` | 有小數部分（含 `0 < price < 30` 的小數，見下） |
 * | `below_minimum` | `0 < price < 30` **且為整數** |
 * | `compliant` | 整數且 `>= 30` —— 符合 `DEC-34` ＋ `DEC-39` |
 *
 * **互斥規則**：一列只會落入一個類別，順序為
 * `null_price → non_positive → fractional → below_minimum → compliant`。
 * 另外**額外**回報一個**非互斥**的交集 `fractional_and_below_minimum`
 * （既是小數又 `< 30`），因為對帳時這類列同時違反兩條規則、處置成本最高。
 *
 * ## 隱私
 *
 * 輸出**只有計數與價格值**，不含教材標題、創作者身分或任何個資。
 * `--samples` 會列出違反列的 `id` 與 `price`（供對帳定位），**不含其他欄位**。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/listing-price-census.js            # 只印摘要
 * node scripts/listing-price-census.js --samples  # 另列違反列的 id 與 price
 * node scripts/listing-price-census.js --json     # 機器可讀輸出
 * ```
 *
 * 目標資料庫由既有的 `config/db.js` 決定（`PGDATABASE` 等環境變數）。
 * **執行前請先確認目標資料庫** —— 腳本會把它印出來。
 */

require("dotenv").config({ quiet: true });

const { MIN_LISTING_PRICE } = require("../utils/listingPricePolicy");

/*
 * `config/db.js` 在 require 當下就會對缺漏的設定 fail-closed（正確行為，見 CLAUDE.md §8）。
 * 這裡延後 require，好讓「設定不足」以一行可讀訊息呈現，而不是 require 階段的 stack trace。
 */
function getDb() {
  try {
    return require("../config/db");
  } catch (err) {
    console.error("census cannot run: " + err.message);
    console.error("Set DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (see Backend/.env).");
    process.exit(1);
  }
}

const args = new Set(process.argv.slice(2));
const WANT_SAMPLES = args.has("--samples");
const WANT_JSON = args.has("--json");
const SAMPLE_LIMIT = 50;

/**
 * 互斥分類 —— 全部在 SQL 內完成，避免把整張表拉進記憶體。
 *
 * `price` 是 `NUMERIC`，故以 `price <> trunc(price)` 判斷小數，
 * **不**用浮點比較。
 */
const CENSUS_SQL = `
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE price IS NULL)::int AS null_price,
    COUNT(*) FILTER (WHERE price IS NOT NULL AND price <= 0)::int AS non_positive,
    COUNT(*) FILTER (WHERE price IS NOT NULL AND price > 0 AND price <> trunc(price))::int AS fractional,
    COUNT(*) FILTER (
      WHERE price IS NOT NULL AND price > 0 AND price = trunc(price) AND price < $1
    )::int AS below_minimum,
    COUNT(*) FILTER (
      WHERE price IS NOT NULL AND price = trunc(price) AND price >= $1
    )::int AS compliant,
    COUNT(*) FILTER (
      WHERE price IS NOT NULL AND price > 0 AND price <> trunc(price) AND price < $1
    )::int AS fractional_and_below_minimum
  FROM materials
`;

const SAMPLES_SQL = `
  SELECT id, price
  FROM materials
  WHERE price IS NULL
     OR price <= 0
     OR price <> trunc(price)
     OR price < $1
  ORDER BY price NULLS FIRST, id
  LIMIT ${SAMPLE_LIMIT}
`;

async function main() {
  const db = getDb();
  const dbNameResult = await db.query("SELECT current_database() AS name");
  const database = dbNameResult.rows[0].name;

  const { rows } = await db.query(CENSUS_SQL, [MIN_LISTING_PRICE]);
  const c = rows[0];

  const violations =
    c.null_price + c.non_positive + c.fractional + c.below_minimum;
  const accounted = violations + c.compliant;

  const report = {
    database,
    generatedAt: new Date().toISOString(),
    policy: { minListingPrice: MIN_LISTING_PRICE, integerOnly: true, source: "DEC-34 + DEC-39" },
    counts: {
      total: c.total,
      null_price: c.null_price,
      non_positive: c.non_positive,
      fractional: c.fractional,
      below_minimum: c.below_minimum,
      compliant: c.compliant,
    },
    overlaps: { fractional_and_below_minimum: c.fractional_and_below_minimum },
    violations,
    // 互斥分類的自檢：對不上就代表 SQL 分類有漏，寧可大聲失敗也不要靜默少算。
    categoriesReconcile: accounted === c.total,
    readyForConstraint: violations === 0,
  };

  let samples = [];
  if (WANT_SAMPLES && violations > 0) {
    const s = await db.query(SAMPLES_SQL, [MIN_LISTING_PRICE]);
    samples = s.rows.map((r) => ({ id: r.id, price: r.price }));
    report.samples = samples;
    report.samplesTruncated = violations > SAMPLE_LIMIT;
  }

  if (WANT_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    print(report, samples);
  }

  if (!report.categoriesReconcile) {
    console.error("\n!! 分類總和與 total 不符 —— census SQL 有漏，結果不可信。");
    process.exitCode = 2;
    return;
  }
  // 有違反列不是錯誤，是這支腳本存在的理由。exit 0。
}

function print(r, samples) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log("");
  console.log("COR-09 Phase 0 —— listing price census (READ-ONLY)");
  console.log("=================================================");
  console.log(`database      : ${r.database}`);
  console.log(`generated     : ${r.generatedAt}`);
  console.log(`policy        : integer TWD AND >= ${r.policy.minListingPrice}  (${r.policy.source})`);
  console.log("");
  console.log(`${pad("category", 30)} count`);
  console.log(`${pad("-".repeat(30), 30)} -----`);
  console.log(`${pad("total materials", 30)} ${r.counts.total}`);
  console.log(`${pad("  null price", 30)} ${r.counts.null_price}`);
  console.log(`${pad("  price <= 0", 30)} ${r.counts.non_positive}`);
  console.log(`${pad("  fractional", 30)} ${r.counts.fractional}`);
  console.log(`${pad(`  integer 0 < price < ${r.policy.minListingPrice}`, 30)} ${r.counts.below_minimum}`);
  console.log(`${pad("  compliant", 30)} ${r.counts.compliant}`);
  console.log("");
  console.log(`overlap (non-exclusive):`);
  console.log(`${pad("  fractional AND < min", 30)} ${r.overlaps.fractional_and_below_minimum}`);
  console.log("");
  console.log(`violations total            : ${r.violations}`);
  console.log(`categories reconcile        : ${r.categoriesReconcile ? "YES" : "NO !!"}`);
  console.log(`ready for DB constraint     : ${r.readyForConstraint ? "YES" : "NO — reconcile first (COR-09 V8)"}`);

  if (samples.length > 0) {
    console.log("");
    console.log(`violating rows (first ${samples.length}${r.samplesTruncated ? ", truncated" : ""}):`);
    for (const s of samples) console.log(`  ${pad(s.id, 40)} ${s.price}`);
  }
  console.log("");
  if (!r.readyForConstraint) {
    console.log("NOTE: floorMoney in orderService MUST remain until violations = 0 (COR-09 V8).");
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error("census failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = require.cache[require.resolve("../config/db")]?.exports;
    if (db && db.pool && typeof db.pool.end === "function") await db.pool.end();
  });
