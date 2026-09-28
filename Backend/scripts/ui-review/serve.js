"use strict";

/**
 * UI Review 的 **backend 啟動器**。
 *
 * ```
 *   node scripts/ui-review/serve.js
 * ```
 *
 * ## 為什麼是一支 launcher 而不是 npm script 裡的環境變數前綴
 *
 * 兩個理由：
 *
 * 1. **跨平台。** `PGDATABASE=x node index.js` 在 PowerShell／cmd 是語法錯誤，
 *    而本 repo 的主要開發環境是 Windows。
 * 2. **護欄必須在 server 起來之前跑。** 在 npm script 裡設變數的話，
 *    `index.js` 會先連上資料庫、`ensureCoreTables()` 會先建表 —— 那已經是寫入了。
 *    這裡先跑完 `connectVerified()` 的四層驗證，**證明過才 require 主程式**。
 *
 * 連接埠刻意用 **3100**（不是 `CLAUDE.md` 的 dev 3000），這樣 UI Review 與一般開發的
 * backend 可以同時存在、互不干擾，也不會有人把兩者的資料庫搞混。
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { connectVerified, printProof, UI_REVIEW_DB_NAME } = require("./guard");

const UI_REVIEW_BACKEND_PORT = "3100";

async function main() {
  // 先固定目標，讓護欄檢查的就是 server 稍後會用的那一個。
  process.env.PGDATABASE = UI_REVIEW_DB_NAME;
  delete process.env.DATABASE_URL; // 避免 `.env` 的遠端連線字串蓋掉 discrete 設定
  process.env.PORT = UI_REVIEW_BACKEND_PORT;

  console.log("");
  console.log("  UI REVIEW — BACKEND");
  console.log("  ───────────────────");

  const { client, identity, target } = await connectVerified();
  printProof(identity, target);
  await client.end();

  console.log(`\n  啟動 backend on :${UI_REVIEW_BACKEND_PORT} …\n`);
  require(path.join(__dirname, "..", "..", "index.js"));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
