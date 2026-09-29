#!/usr/bin/env node
/**
 * `UI-QA-CI` —— 為 CI 的 UI quality gate 準備一個**用完即丟**的 E2E 資料庫。
 *
 *   CI_DISPOSABLE_DB=1 PGHOST=127.0.0.1 PGDATABASE=teaching_platform_security_test \
 *     node Backend/scripts/ci/prepare-e2e-db.js
 *
 * ## 它做的事
 *
 *   1. fail-closed 護欄（見下）
 *   2. 以正式 bootstrap（`models/bootstrapModel.ensureCoreTables`）建立 schema ——
 *      與 backend 啟動、`PRE-05` fresh-DB 驗證、UI Review seed 走同一條路，不維護第二套建表邏輯
 *   3. 套用 `migrations/20260508_seed_material_detail_demo.sql`：E2E harness 的
 *      `global-setup.ts` 以 `mat_detail_seed_1` 判定「backend 連到的是有 seed 的資料庫」
 *
 * ## 為什麼資料庫名稱是 `teaching_platform_security_test`
 *
 * E2E harness（`tests/e2e/helpers/backend-prerequisite.ts`）**只接受**這個名稱，這是既有的
 * 單一護欄，CI 不另開後門。CI 裡它是 GitHub Actions 的 `postgres` service container，
 * job 結束即銷毀，與任何開發者機器上的同名資料庫**毫無關係**。
 *
 * ## Fail-closed 護欄（任一不成立即 exit 1，**不寫入任何東西**）
 *
 *   - `CI_DISPOSABLE_DB=1` —— 呼叫端明示「這是本 job 剛建立的拋棄式資料庫」
 *   - `NODE_ENV` 不是 `production`；`DATABASE_URL` **未設定**（只允許離散的 `PG*` loopback 設定）
 *   - `PGDATABASE` 恰為 `teaching_platform_security_test`；`PGHOST` 為 loopback
 *   - 連線後 `current_database()` 相符、`inet_server_addr()` 為 loopback
 *   - `public` schema 內**沒有任何資料表** —— 只接受全新的空資料庫。
 *     開發者機器上真正的 security test DB 一定有表，因此即使有人在本機誤跑也會被擋下。
 *
 * 本檔**刻意不載入 `Backend/.env`**：CI 沒有那個檔，本機誤跑時也不該被它補上任何連線設定。
 */
const fs = require("fs");
const path = require("path");

const EXPECTED_DB = "teaching_platform_security_test";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SEED_FILE = path.join(__dirname, "..", "..", "migrations", "20260508_seed_material_detail_demo.sql");
const SEED_MATERIAL_ID = "mat_detail_seed_1";

function refuse(reason) {
  console.error(
    [
      "",
      "═══════════════════════════════════════════════════════════════",
      "  CI E2E DATABASE GUARD — REFUSING",
      "═══════════════════════════════════════════════════════════════",
      "",
      `  ${reason}`,
      "",
      "  沒有任何資料被寫入。本腳本只用於 CI job 剛建立的拋棄式資料庫。",
      "═══════════════════════════════════════════════════════════════",
      "",
    ].join("\n")
  );
  process.exit(1);
}

/** 靜態設定檢查：回傳拒絕理由；全部通過時回傳 `null`。 */
function staticRefusal(env) {
  if (env.CI_DISPOSABLE_DB !== "1") return "未設定 CI_DISPOSABLE_DB=1。";
  if (env.NODE_ENV === "production") return "NODE_ENV=production。";
  if (env.DATABASE_URL && env.DATABASE_URL.trim()) return "DATABASE_URL 已設定；CI 只允許離散的 PG* loopback 設定。";
  if (env.PGDATABASE !== EXPECTED_DB) return `PGDATABASE 必須是 ${EXPECTED_DB}（實際：${JSON.stringify(env.PGDATABASE)}）。`;
  if (!LOOPBACK_HOSTS.has(String(env.PGHOST || ""))) return `PGHOST 必須是 loopback（實際：${JSON.stringify(env.PGHOST)}）。`;
  return null;
}

function isLoopbackAddress(addr) {
  // `inet_server_addr()` 在 Unix socket 連線時為 NULL —— 那也只可能是本機。
  if (addr === null || addr === undefined) return true;
  const a = String(addr);
  return a === "::1" || a.startsWith("127.");
}

async function main() {
  const reason = staticRefusal(process.env);
  if (reason) refuse(reason);

  // 護欄通過之後才載入 pool —— `config/db.js` 在 require 時就建立連線設定。
  const db = require("../../config/db");
  const { ensureCoreTables } = require("../../models/bootstrapModel");

  try {
    const { rows } = await db.query(
      `SELECT current_database() AS db,
              host(inet_server_addr()) AS addr,
              (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables`
    );
    const live = rows[0];
    console.log(`prepare-e2e-db: target db=${live.db} server=${live.addr ?? "unix-socket"} public tables=${live.tables}`);

    if (live.db !== EXPECTED_DB) refuse(`連線後的 current_database() 是 ${live.db}。`);
    if (!isLoopbackAddress(live.addr)) refuse(`連線後的 inet_server_addr() 不是 loopback：${live.addr}。`);
    if (live.tables !== 0) refuse(`public schema 已有 ${live.tables} 張表 —— 這不是剛建立的拋棄式資料庫。`);

    await ensureCoreTables();
    console.log("prepare-e2e-db: schema bootstrapped (ensureCoreTables)");

    const seedSql = fs.readFileSync(SEED_FILE, "utf8");
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(seedSql);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const seed = await db.query("SELECT status FROM materials WHERE id = $1", [SEED_MATERIAL_ID]);
    if (seed.rows[0]?.status !== "published") {
      throw new Error(`seed material ${SEED_MATERIAL_ID} missing or not published after seeding`);
    }
    console.log(`prepare-e2e-db: seed ${SEED_MATERIAL_ID} = published — ready`);
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("prepare-e2e-db: failed:", err.message);
    process.exit(1);
  });
}

module.exports = { staticRefusal, isLoopbackAddress, EXPECTED_DB };
