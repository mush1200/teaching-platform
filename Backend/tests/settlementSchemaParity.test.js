/**
 * Schema 雙軌 parity —— 設計 §23 風險 4 的自動化防線。
 *
 * settlement 的**可執行** DDL 只有一份（migration 檔；bootstrap 直接讀它執行）。
 * `db/db_schema.sql` 是 canonical **文件**副本，人會忘記同步 ——
 * 本測試逐 statement 比對兩者，漂了就紅。
 *
 * 比對前會移除註解並正規化空白，所以排版差異不會造成假警報，
 * 但**任何語意差異都會被抓到**。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { settlementSchemaSql, settlementMigrationFiles } = require("../models/settlementSchema");

const SCHEMA_DOC = path.join(__dirname, "..", "..", "db", "db_schema.sql");
const BEGIN = "-- BEGIN PRE18_SETTLEMENT_CORE";
const END = "-- END PRE18_SETTLEMENT_CORE";

/** 去掉行註解與多餘空白，只留下語意。 */
function normalise(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

test("the migration chain is readable and is what bootstrap will execute", () => {
  for (const file of settlementMigrationFiles()) {
    assert.ok(fs.existsSync(file), `${file} must exist`);
  }
  const sql = settlementSchemaSql();
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS creator_ledger_entries"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS creator_payable_slices"));
});

test("db/db_schema.sql carries a verbatim copy of the settlement DDL", () => {
  const doc = fs.readFileSync(SCHEMA_DOC, "utf8");
  const start = doc.indexOf(BEGIN);
  const end = doc.indexOf(END);
  assert.ok(start >= 0, "db_schema.sql must contain the PRE18_SETTLEMENT_CORE begin marker");
  assert.ok(end > start, "db_schema.sql must contain the PRE18_SETTLEMENT_CORE end marker");

  const block = doc.slice(start + BEGIN.length, end);
  assert.equal(
    normalise(block),
    normalise(settlementSchemaSql()),
    "db/db_schema.sql has drifted from Backend/migrations/20260928_pre18_settlement_core.sql"
  );
});

test("all eleven settlement tables are present in the single executable source", () => {
  const sql = settlementSchemaSql();
  const tables = [
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
  for (const table of tables) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`),
      `${table} is missing from the settlement schema`
    );
  }
  assert.equal(
    (sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length,
    tables.length,
    "the settlement schema must create exactly the eleven documented tables"
  );
});

test("the schema is additive: it never drops or rewrites an existing table", () => {
  const sql = settlementSchemaSql().replace(/^\s*--.*$/gm, "");
  assert.ok(!/DROP TABLE/i.test(sql), "settlement schema must not drop tables");
  assert.ok(!/ALTER TABLE \w+ DROP COLUMN/i.test(sql), "settlement schema must not drop columns");
  assert.ok(!/DELETE FROM/i.test(sql), "settlement schema must not delete data");
  assert.ok(
    !/UPDATE\s+\w+\s+SET/i.test(sql),
    "settlement schema must not mutate existing rows"
  );
  // 唯一允許碰既有表的語句。
  const alters = sql.match(/ALTER TABLE [^;]*/gi) || [];
  assert.deepEqual(
    alters.map((statement) => statement.replace(/\s+/g, " ").trim()),
    ["ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_window_end TIMESTAMP"]
  );
});

test("the schema is idempotent: every create is guarded and every trigger is re-created", () => {
  const sql = settlementSchemaSql().replace(/^\s*--.*$/gm, "");
  const createTriggers = (sql.match(/CREATE (CONSTRAINT )?TRIGGER (\w+)/g) || []).map((match) =>
    match.replace(/CREATE (CONSTRAINT )?TRIGGER /, "")
  );
  const dropTriggers = (sql.match(/DROP TRIGGER IF EXISTS (\w+)/g) || []).map((match) =>
    match.replace("DROP TRIGGER IF EXISTS ", "")
  );
  assert.ok(createTriggers.length > 0, "the schema must define invariant triggers");
  for (const trigger of createTriggers) {
    assert.ok(
      dropTriggers.includes(trigger),
      `${trigger} is created without a preceding DROP TRIGGER IF EXISTS, so re-running would fail`
    );
  }
  for (const index of sql.match(/CREATE (UNIQUE )?INDEX [^;]*/gi) || []) {
    assert.ok(/IF NOT EXISTS/i.test(index), `index is not idempotent: ${index.slice(0, 60)}`);
  }
});

test("E: bootstrap consumes a CHAIN of settlement migrations, not one hard-coded file", () => {
  const { settlementMigrationFiles, SETTLEMENT_MIGRATION_PATTERN } = require("../models/settlementSchema");
  const files = settlementMigrationFiles();
  assert.ok(files.length >= 1, "at least one settlement migration must exist");
  // 依檔名（日期前綴）由舊到新 —— 日後擴充 PRE-18 只要照命名慣例放進 migrations/，
  // bootstrap 與人工套用就會自動一致，不會出現「既有環境對、全新佈建少一塊」。
  assert.deepEqual([...files].sort(), files, "the chain must be applied in lexical order");
  for (const file of files) {
    assert.ok(SETTLEMENT_MIGRATION_PATTERN.test(path.basename(file)));
  }
});

test("E: an empty chain fails loudly instead of silently skipping the schema", () => {
  const settlementSchema = require("../models/settlementSchema");
  const original = fs.readdirSync;
  try {
    fs.readdirSync = () => ["20260101_something_else.sql"];
    assert.throws(
      () => settlementSchema.settlementMigrationFiles(),
      /no settlement schema migrations found/
    );
  } finally {
    fs.readdirSync = original;
  }
});

test("E: every file in the chain is idempotent and additive", () => {
  const { settlementMigrationFiles } = require("../models/settlementSchema");
  for (const file of settlementMigrationFiles()) {
    const sql = fs.readFileSync(file, "utf8").replace(/^\s*--.*$/gm, "");
    const name = path.basename(file);
    assert.ok(!/DROP TABLE/i.test(sql), `${name} must not drop tables`);
    assert.ok(!/DROP COLUMN/i.test(sql), `${name} must not drop columns`);
    assert.ok(!/DELETE FROM/i.test(sql), `${name} must not delete data`);
    for (const statement of sql.match(/CREATE TABLE[^;]*/gi) || []) {
      assert.ok(/IF NOT EXISTS/i.test(statement), `${name} has a non-idempotent CREATE TABLE`);
    }
    for (const statement of sql.match(/ALTER TABLE \w+ ADD COLUMN[^;]*/gi) || []) {
      assert.ok(/IF NOT EXISTS/i.test(statement), `${name} has a non-idempotent ADD COLUMN`);
    }
  }
});
