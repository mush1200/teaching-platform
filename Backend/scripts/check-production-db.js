#!/usr/bin/env node
/**
 * Production 資料庫連線前置檢查（`PRE-07` STEP 2）—— **完全唯讀**。
 *
 * ## 為什麼需要一支專門的腳本
 *
 * `Backend/index.js` 一啟動就會跑 `ensureCoreTables()`，那會**建表**。
 * 在把一個全新的 production 資料庫交給它之前，我們需要先知道三件事，
 * 而且是在**還沒寫任何東西**的前提下知道：
 *
 *   1. 連得上嗎、TLS 真的開了嗎（不是「設定裡寫了 sslmode」而是「這條連線真的加密」）
 *   2. 它是不是一個**全新的空庫**（`DEC-15` 要求 production 從空庫開始）
 *   3. server 版本是多少（`pg_dump` 版本必須 ≥ 它，否則 `PRE-08` 的備份做不了）
 *
 * 一旦 backend 起過一次，(2) 就再也問不出來了 —— 所以順序上這支必須先跑。
 *
 * ## 這支腳本只執行 SELECT
 *
 * 沒有 CREATE、沒有 INSERT、沒有 ALTER、沒有 DROP。可以安全地對任何資料庫執行。
 *
 * ## 用法
 *
 *   DATABASE_URL='postgres://...?sslmode=require' node Backend/scripts/check-production-db.js
 *
 * `DATABASE_URL` **只從環境變數讀取，永遠不會被印出來**（連遮罩版本都不印 ——
 * 主機名稱本身也是 `O-20` 要揭露的事實，不該散落在終端機記錄裡）。
 */

const { Client } = require("pg");

/** `db/db_schema.sql` 的 canonical 表清單（26 張）。 */
const CANONICAL_TABLES = [
  "activity_logs", "cart_items", "consent_records", "consumer_complaint_events",
  "consumer_complaint_evidence", "consumer_complaints", "legal_documents",
  "manual_payment_proofs", "material_contents", "material_download_tokens",
  "material_files", "material_images", "material_media_files",
  "material_rights_reviews", "materials", "order_items", "orders",
  "privacy_request_events", "privacy_requests", "promotions",
  "refund_remedy_cases", "report_events", "reports", "review",
  "user_favorites", "users",
];

/** 開發／測試資料庫。production 檢查誤指到這些是設定錯誤，直接擋下。 */
const NON_PRODUCTION_DATABASES = new Set([
  "teaching_platform",
  "teaching_platform_security_test",
]);

const problems = [];
const warnings = [];

function fail(message) {
  problems.push(message);
  console.log(`  FAIL  ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`  WARN  ${message}`);
}

function pass(message) {
  console.log(`  ok    ${message}`);
}

async function main() {
  const raw = String(process.env.DATABASE_URL || "").trim();
  if (!raw) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "Usage: DATABASE_URL='postgres://...?sslmode=require' node Backend/scripts/check-production-db.js\n" +
        "Do NOT paste the value into a shared terminal log or chat."
    );
    process.exit(2);
  }

  console.log("Production database preflight (read-only)\n");

  // --- 1. 連線字串形狀 -------------------------------------------------------
  console.log("[1] connection string");
  let sslmode = null;
  try {
    // 只解析、不回顯。URL 物件本身不會被印出來。
    sslmode = new URL(raw).searchParams.get("sslmode");
  } catch {
    fail("DATABASE_URL is not a parseable URL");
  }
  if (!sslmode) {
    fail(
      "DATABASE_URL has no explicit sslmode. config/db.js never sets an `ssl` key " +
        "and pg's default is ssl:false — without sslmode this is an UNENCRYPTED connection."
    );
  } else if (sslmode === "disable") {
    fail("sslmode=disable — production must be encrypted");
  } else {
    pass(`sslmode=${sslmode} present`);
  }

  // --- 2. 連線 ---------------------------------------------------------------
  console.log("\n[2] connectivity");
  const client = new Client({ connectionString: raw });
  try {
    await client.connect();
    pass("connected");
  } catch (err) {
    fail(`could not connect: ${err.message}`);
    console.log(`\nRESULT: BLOCKED (${problems.length} problem(s))`);
    process.exit(1);
  }

  try {
    // --- 3. TLS 實測 ---------------------------------------------------------
    // 設定裡寫了 sslmode 不代表這條連線真的加密。問資料庫本人。
    console.log("\n[3] transport encryption (measured, not inferred)");
    const ssl = await client.query(
      "SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()"
    );
    if (ssl.rows[0]?.ssl === true) {
      pass(`TLS active (${ssl.rows[0].version || "version not reported"})`);
    } else {
      fail("connection is NOT encrypted despite the configured sslmode");
    }

    // --- 4. 身分 -------------------------------------------------------------
    console.log("\n[4] identity");
    const who = await client.query(
      "SELECT current_database() AS db, current_user AS usr, version() AS v"
    );
    const { db, usr, v } = who.rows[0];
    console.log(`        database = ${db}`);
    console.log(`        user     = ${usr}`);

    if (NON_PRODUCTION_DATABASES.has(db)) {
      fail(
        `this is a development/test database (${db}). ` +
          "Refusing to treat it as production — see DEC-15."
      );
    } else {
      pass(`database name is not a known dev/test database`);
    }

    const serverVersion = (await client.query("SHOW server_version")).rows[0].server_version;
    console.log(`        server   = PostgreSQL ${serverVersion}`);
    console.log(
      `        note     = pg_dump must be >= ${String(serverVersion).split(".")[0]} for PRE-08 backups`
    );
    void v;

    // --- 5. Schema 狀態（不建立任何東西）--------------------------------------
    console.log("\n[5] schema state");
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const present = new Set(tables.rows.map((r) => r.table_name));
    const found = CANONICAL_TABLES.filter((t) => present.has(t));

    if (present.size === 0) {
      pass("EMPTY database — fresh, as DEC-15 requires. ensureCoreTables() will provision it.");
    } else if (found.length === CANONICAL_TABLES.length) {
      pass(`already provisioned (${found.length}/${CANONICAL_TABLES.length} canonical tables)`);
      // 已 provision 的話順帶確認 SCHEMA-01 那個會讓 backend fail-closed 的欄位。
      const idType = await client.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = 'activity_logs' AND column_name = 'id'`
      );
      if (idType.rows[0]?.data_type === "text") {
        pass("activity_logs.id is text (SCHEMA-01 satisfied)");
      } else {
        fail(
          `activity_logs.id is ${idType.rows[0]?.data_type ?? "missing"}, expected text — ` +
            "verifyCriticalSchema() will refuse to start the backend"
        );
      }
      const rows = await client.query("SELECT COUNT(*)::int AS n FROM users");
      if (rows.rows[0].n > 0) {
        warn(
          `users table already has ${rows.rows[0].n} row(s). ` +
            "DEC-15 requires production to start from an EMPTY database — confirm this is intended."
        );
      }
    } else {
      warn(
        `partially provisioned: ${found.length}/${CANONICAL_TABLES.length} canonical tables, ` +
          `${present.size} table(s) total. Missing: ${CANONICAL_TABLES.filter((t) => !present.has(t)).join(", ")}`
      );
    }
  } finally {
    await client.end();
  }

  console.log("");
  if (problems.length > 0) {
    console.log(`RESULT: BLOCKED — ${problems.length} problem(s), ${warnings.length} warning(s)`);
    process.exit(1);
  }
  console.log(`RESULT: PASS — 0 problems, ${warnings.length} warning(s)`);
}

main().catch((err) => {
  console.error("preflight crashed:", err.message);
  process.exit(1);
});
