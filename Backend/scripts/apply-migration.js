#!/usr/bin/env node
/**
 * 套用單一 migration 檔案。
 *
 *   node scripts/apply-migration.js <database> <migration-file.sql>
 *
 * 兩層 assertion（CLAUDE.md §4）：
 *   1. 執行端 —— 目標資料庫必須在 allowlist 內，且必須由參數**明確指定**
 *      （不從 PGDATABASE 推斷，避免「以為在測試庫、其實在開發庫」）。
 *   2. SQL 內建 —— migration 檔開頭自帶 `current_database()` 檢查。
 *
 * 執行前請先備份（見 docs/db-backup-and-migration.md）。
 * 同樣的 schema 變更也存在於 `models/bootstrapModel.js` 的 idempotent 區塊，
 * 正常啟動 Backend 就會套用；這支腳本是給「不想起 server 只想套 schema」的情境。
 */
const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_DIR, ".env") });

const ALLOWED_DATABASES = new Set(["teaching_platform", "teaching_platform_security_test"]);

async function main() {
  const [target, file] = process.argv.slice(2);
  if (!target || !file) {
    console.error("usage: node scripts/apply-migration.js <database> <migration-file.sql>");
    console.error(`       allowed databases: ${[...ALLOWED_DATABASES].join(", ")}`);
    process.exit(1);
  }
  if (!ALLOWED_DATABASES.has(target)) {
    console.error(`ABORT: ${JSON.stringify(target)} is not an allowed target database.`);
    process.exit(1);
  }

  const migrationPath = path.isAbsolute(file) ? file : path.join(BACKEND_DIR, "migrations", file);
  if (!fs.existsSync(migrationPath)) {
    console.error(`ABORT: migration not found: ${migrationPath}`);
    process.exit(1);
  }

  const { Pool } = require("pg");
  const pool = new Pool({ database: target });

  const actual = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  console.log(`apply-migration: connected to ${actual}`);
  if (actual !== target) {
    console.error(`ABORT: connected to ${actual}, expected ${target}`);
    await pool.end();
    process.exit(1);
  }

  process.stdout.write(`  applying ${path.basename(migrationPath)} … `);
  await pool.query(fs.readFileSync(migrationPath, "utf8"));
  console.log("ok");

  await pool.end();
  console.log("apply-migration: done");
}

main().catch((err) => {
  console.error("apply-migration failed:", err.message);
  process.exit(1);
});
