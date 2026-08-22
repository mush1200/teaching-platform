#!/usr/bin/env node
/**
 * Runs the database-backed dashboard tests against the security/integration database.
 *
 *   npm run test:db --prefix Backend
 *
 * These tests insert and delete fixture rows, so the target database is pinned here
 * rather than taken from Backend/.env (which points at the development database).
 * `PGDATABASE` is set on the child process only — nothing else in the repo is affected,
 * and the test file re-asserts the value before touching any table.
 *
 * Node's built-in test runner is used (`node --test`); there is no test framework
 * dependency to install.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const TARGET_DB = "teaching_platform_security_test";
const BACKEND_DIR = path.resolve(__dirname, "..");
const TEST_FILES = [
  path.join("tests", "dashboardPeriod.db.test.js"),
  path.join("tests", "dashboardTrends.db.test.js"),
  path.join("tests", "creatorSales.db.test.js"),
  path.join("tests", "adminOrdersFilter.db.test.js"),
  path.join("tests", "reportCases.db.test.js"),
  path.join("tests", "adminMaterialsQueue.db.test.js"),
  path.join("tests", "adminPaymentProofs.db.test.js"),
];

const shellDb = process.env.PGDATABASE;
if (shellDb && shellDb !== TARGET_DB) {
  console.error(
    `run-db-tests: refusing to run — PGDATABASE is already set to ${JSON.stringify(shellDb)}.\n` +
      `  These tests write fixtures and may only target ${TARGET_DB}.\n` +
      "  Unset PGDATABASE (or set it to the target) and retry."
  );
  process.exit(1);
}

console.log(`run-db-tests: target database = ${TARGET_DB}`);

// `--test-concurrency=1`：這些檔案共用同一個資料庫，各自先取 baseline 再插 fixture。
// 平行執行會讓 A 的 INSERT 落在 B 的 baseline 與量測之間，差值斷言就會失真。
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...TEST_FILES], {
  cwd: BACKEND_DIR,
  stdio: "inherit",
  env: { ...process.env, PGDATABASE: TARGET_DB },
});

process.exit(result.status == null ? 1 : result.status);
