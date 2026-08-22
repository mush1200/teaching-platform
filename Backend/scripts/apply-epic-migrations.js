#!/usr/bin/env node
/**
 * 套用 Admin Operations UX Closure Epic 的兩支 migration：
 *
 *   migrations/20260822_report_case_workflow.sql
 *   migrations/20260822_payment_proof_rejection_reason.sql
 *
 *   node scripts/apply-epic-migrations.js <database>
 *
 * 兩層 assertion（CLAUDE.md §4）：
 *   1. 執行端 —— 目標資料庫必須在下方 allowlist 內，且必須由參數明確指定。
 *   2. SQL 內建 —— 每個 .sql 檔開頭自帶 `current_database()` 檢查。
 *
 * 兩支 migration 都只做加法（ADD COLUMN / CREATE TABLE / 放寬 CHECK）。
 * 同樣的內容也在 `models/bootstrapModel.js` 的 idempotent 區塊裡，
 * 正常啟動 Backend 就會套用；這支腳本是給「不想起 server 只想套 schema」的情境用的
 * （例如先讓 DB 測試跑起來）。重複執行安全。
 */
const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_DIR, ".env") });

const ALLOWED_DATABASES = new Set(["teaching_platform", "teaching_platform_security_test"]);

const MIGRATIONS = [
  "20260822_report_case_workflow.sql",
  "20260822_payment_proof_rejection_reason.sql",
];

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node scripts/apply-epic-migrations.js <database>");
    console.error(`       allowed: ${[...ALLOWED_DATABASES].join(", ")}`);
    process.exit(1);
  }
  if (!ALLOWED_DATABASES.has(target)) {
    console.error(`ABORT: ${JSON.stringify(target)} is not an allowed target database.`);
    process.exit(1);
  }

  const { Pool } = require("pg");
  const pool = new Pool({ database: target });

  const check = await pool.query("SELECT current_database() AS db");
  const actual = check.rows[0].db;
  console.log(`apply-epic-migrations: connected to ${actual}`);
  if (actual !== target) {
    console.error(`ABORT: connected to ${actual}, expected ${target}`);
    await pool.end();
    process.exit(1);
  }

  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(BACKEND_DIR, "migrations", file), "utf8");
    process.stdout.write(`  applying ${file} … `);
    await pool.query(sql);
    console.log("ok");
  }

  await pool.end();
  console.log("apply-epic-migrations: done");
}

main().catch((err) => {
  console.error("apply-epic-migrations failed:", err.message);
  process.exit(1);
});
