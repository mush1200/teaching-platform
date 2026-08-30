#!/usr/bin/env node
/**
 * 清掉沒被認領的教材檔案上傳，以及過期的下載票。
 *
 *   node scripts/cleanup-material-files.js [--hours=24] [--dry-run]
 *
 * ## 為什麼需要
 *
 * 上傳流程是 upload-first：檔案先進儲存拿到 `fileId`，之後才在建立／更新教材時
 * 被認領。使用者上傳完就關掉視窗是很正常的事，那些檔案會一直留著。
 *
 * 因為每一個實體物件都對應一列 `material_files`，這裡不需要掃描檔案系統 ——
 * 一句 SQL 就能列出所有孤兒。
 *
 * ## 為什麼是 CLI 而不是背景排程
 *
 * 這個 milestone 刻意不引入排程框架。孤兒檔案不影響正確性（買家永遠拿不到
 * `unattached` 的檔案），只佔空間，因此由維運按需執行或掛系統排程即可。
 *
 * ## 刪除資格不在這裡判斷
 *
 * 唯一的判斷點是 `services/materialFileRetention.service.js` 的
 * `canPhysicallyDeleteMaterialFile()`。這支腳本**不得**自行拼任何資格條件 ——
 * 讓多支腳本各自判斷，等於讓「可以刪嗎」有多個會不同步的答案。
 * `--dry-run` 走的也是同一個 predicate。
 */
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_DIR, ".env") });

const db = require("../config/db");
const materialFileService = require("../services/materialFile.service");

function parseHours() {
  const arg = process.argv.find((a) => a.startsWith("--hours="));
  if (!arg) return 24;
  const value = Number(arg.split("=")[1]);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`ABORT: invalid --hours value ${JSON.stringify(arg.split("=")[1])}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const hours = parseHours();
  const dryRun = process.argv.includes("--dry-run");

  const { rows } = await db.query("SELECT current_database() AS db");
  console.log(`cleanup-material-files: database = ${rows[0].db}, ttl = ${hours}h${dryRun ? " (dry run)" : ""}`);

  // dry-run 走**完全相同的 predicate**，只是不刪。
  // 舊版的 dry-run 自己另寫一句 SQL，因此它印出的「會刪掉這些」與實際刪除的判斷
  // 可能不一致 —— 那讓 dry-run 失去它唯一的用途。
  const result = await materialFileService.cleanupOrphans({ olderThanHours: hours, dryRun });

  console.log(`  orphan rows found      : ${result.candidates}`);
  console.log(`  skipped (kept)         : ${result.skipped.length}`);
  for (const skip of result.skipped) {
    console.log(`    keep ${skip.id}  reasons: ${skip.reasons.join(", ")}`);
  }
  if (dryRun) {
    console.log("cleanup-material-files: dry run — nothing was deleted");
    return;
  }
  console.log(`  storage objects deleted: ${result.deletedObjects}`);
  console.log(`  rows deleted           : ${result.deletedRows}`);
  console.log(`  expired tokens purged  : ${result.deletedExpiredTokens}`);
  for (const failure of result.failures) {
    console.warn(`  ! failed to clean ${failure.id}: ${failure.message}`);
  }
  if (result.failures.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("cleanup-material-files failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
  });
