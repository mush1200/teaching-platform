/**
 * PRE-18 settlement schema —— bootstrap 與 migration 的**共用來源**。
 *
 * ## 為什麼是「讀檔」而不是再抄一份 SQL
 *
 * 本 repo 的 DDL 一向雙軌：`db/db_schema.sql`（canonical 文件）＋
 * `Backend/models/bootstrapModel.js`（runtime，每次啟動都跑），另有
 * `Backend/migrations/*.sql` 手動套用。設計文件把「每張新表都要同時加進兩處，
 * 否則全新佈建會分歧」列為風險（§23 風險 4）。
 *
 * settlement 這 11 張表帶 trigger 與 deferred constraint，抄兩份的漂移風險遠高於
 * 一般表，因此這裡把**可執行**的那兩軌收斂成一份：bootstrap 直接執行 migration 檔。
 * 剩下的 `db/db_schema.sql` 是**文件**副本，由
 * `Backend/tests/settlementSchemaParity.test.js` 逐 statement 比對，漂了就測試紅。
 *
 * ## 為什麼是一個 glob 而不是一個寫死的檔名
 *
 * 寫死單一檔名會種下一顆定時炸彈：日後有人以新的 dated migration 擴充 PRE-18
 * （加一欄、加一張表），bootstrap 讀不到它，**全新佈建就會少掉那一部分** ——
 * 而既有環境因為跑過 migration 反而是對的。那正是 `SCHEMA-01` 那種
 * 「兩邊都宣稱正常卻不一致」的漂移。
 *
 * 因此 bootstrap 執行的是**整條鏈**：所有符合 `*_pre18_settlement_*.sql` 的檔案，
 * 依檔名（日期前綴）**由舊到新**依序執行。新增擴充只要照這個命名慣例放進
 * `Backend/migrations/`，bootstrap 與人工套用就會自動一致。
 *
 * ### 對這條鏈的兩個要求（由 `settlementSchemaParity.test.js` 強制）
 *
 *   1. **冪等** —— 每次啟動都會重跑（`IF NOT EXISTS` ／ `CREATE OR REPLACE` ／
 *      `DROP TRIGGER IF EXISTS` 後重建）。
 *   2. **additive** —— 不得 `DROP TABLE`／`DROP COLUMN`／`DELETE`／改寫既有列。
 *      需要破壞性變更時，那是一支**不屬於這條鏈**的一次性 migration，
 *      並且必須同步更新鏈上檔案，讓全新佈建直接得到最終形狀。
 *
 * ## bootstrap 不做 schema evolution
 *
 * 與 `bootstrapModel.verifyCriticalSchema()` 的分工相同：這裡只負責**建立**，
 * 偵測既存表 drift 不在此處自動修復。
 */

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

/** 這條鏈的命名慣例。擴充 PRE-18 的 schema 請沿用，否則 bootstrap 讀不到。 */
const SETTLEMENT_MIGRATION_PATTERN = /_pre18_settlement_.*\.sql$/;

let cached = null;

/**
 * 組成這條鏈的檔案，依檔名由舊到新。
 *
 * 一個都找不到就是錯誤而不是空集合 —— 檔案被改名／搬走／刪掉時，
 * 我們要的是啟動就爆掉，而不是安靜地少建 11 張表。
 */
function settlementMigrationFiles() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => SETTLEMENT_MIGRATION_PATTERN.test(name))
    .sort();
  if (files.length === 0) {
    throw new Error(
      `no settlement schema migrations found in ${MIGRATIONS_DIR} ` +
        `(expected files matching ${SETTLEMENT_MIGRATION_PATTERN}); ` +
        "bootstrap cannot establish the PRE-18 schema"
    );
  }
  return files.map((name) => path.join(MIGRATIONS_DIR, name));
}

/** settlement schema 的可執行 SQL 原文（整條鏈串接，唯一來源）。 */
function settlementSchemaSql() {
  if (cached === null) {
    cached = settlementMigrationFiles()
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
  }
  return cached;
}

/**
 * 套用 settlement schema。
 *
 * 以單一 `query` 送出整條鏈：node-postgres 的 simple query protocol 允許
 * 多語句，且會包在一個隱含 transaction 內 —— 半套 schema 不會留下來。
 */
async function applySettlementSchema(db) {
  await db.query(settlementSchemaSql());
}

module.exports = {
  MIGRATIONS_DIR,
  SETTLEMENT_MIGRATION_PATTERN,
  settlementMigrationFiles,
  settlementSchemaSql,
  applySettlementSchema,
};
