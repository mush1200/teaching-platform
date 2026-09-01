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
    /*
     * --- 3. TLS 實測 ---------------------------------------------------------
     *
     * 量的是**我們這一端的 socket**，不是 `pg_stat_ssl`。
     *
     * ## 為什麼不用 pg_stat_ssl（原本用了，而且是錯的）
     *
     * `pg_stat_ssl` 回報的是 **PostgreSQL backend 自己看到的那一段連線**。
     * 在有 TLS-terminating proxy 的供應商上，拓撲是：
     *
     *     client --TLS--> provider proxy --plaintext--> PostgreSQL
     *
     * proxy 在前面就把 TLS 解掉了（Neon 用 SNI 決定要路由到哪個 compute，
     * 所以它**必須**自己終結 TLS），backend 因此永遠看到一條「未加密」的連線，
     * `pg_stat_ssl.ssl` 回 false —— 即使 client 這一端是完整加密的。
     * 同樣的原因，Neon 也不支援 `sslinfo` extension。
     *
     * 這個誤判已在本機以「TLS proxy → 明文 PostgreSQL」的拓撲重現過：
     * 連線確實走 TLS 且憑證通過驗證，舊的檢查仍然回報 NOT encrypted。
     *
     * ## 為什麼新的量法**更嚴格**，不是放寬
     *
     * `pg_stat_ssl` 只說「backend 那段有 TLS」，**完全不管 client 有沒有驗憑證**。
     * 一條 `sslmode=no-verify` 的連線可以讓 `pg_stat_ssl.ssl = true`，
     * 但它對中間人毫無防禦 —— 舊檢查會放行。
     *
     * 新的檢查同時要求三件事，缺一即 fail：
     *   1. 這個 process 的 socket 真的是 TLSSocket（`encrypted === true`）
     *   2. **對端憑證通過 CA 驗證**（`authorized === true`）—— 舊檢查沒有這一項
     *   3. 協定至少 TLSv1.2
     *
     * 拿不到 socket 時一律 fail（fail-closed），不猜。
     */
    console.log("\n[3] transport encryption (measured on this process's own socket)");
    const socket = client.connection && client.connection.stream;
    const isTls = Boolean(socket && socket.encrypted === true && typeof socket.getProtocol === "function");

    if (!isTls) {
      fail(
        "the client socket is NOT a TLS socket — traffic from this machine is plaintext, " +
          "regardless of what the connection string says"
      );
    } else {
      const protocol = String(socket.getProtocol() || "");
      const cipher = (typeof socket.getCipher === "function" && socket.getCipher()) || {};

      if (socket.authorized !== true) {
        fail(
          `TLS is active (${protocol}) but the server certificate was NOT verified ` +
            `(${socket.authorizationError || "no reason reported"}). Encrypted, but open to a ` +
            "man-in-the-middle — do not use sslmode=no-verify against a managed provider."
        );
      } else if (!/^TLSv1\.[23]$/.test(protocol)) {
        fail(`negotiated ${protocol}; require TLSv1.2 or better`);
      } else {
        pass(`${protocol}, cipher ${cipher.name || "unknown"}, server certificate verified`);
      }

      // Issuer 是有用的脈絡且不是 secret。**刻意不印 subject/CN** —— 那是主機名稱，
      // 屬於 O-20 要揭露的事實，不該散落在終端機記錄裡。
      const peer = typeof socket.getPeerCertificate === "function" ? socket.getPeerCertificate() : null;
      if (peer && peer.issuer) {
        console.log(`        cert issuer  = ${peer.issuer.O || peer.issuer.CN || "(unnamed)"}`);
      }
    }

    /*
     * backend 那一段仍然值得印出來，但**只作為脈絡，不作為判準**。
     * 它是 false 通常代表前面有 proxy 在終結 TLS（Neon 即如此），不代表沒有加密。
     */
    const backendSsl = await client.query(
      "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()"
    );
    console.log(
      backendSsl.rows[0] && backendSsl.rows[0].ssl === true
        ? "        backend hop  = also TLS (no TLS-terminating proxy in front)"
        : "        backend hop  = plaintext behind the provider's TLS-terminating proxy (expected on Neon)"
    );

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
      /*
       * Business-data census.
       *
       * 一旦 bootstrap 跑過，「資料庫是不是空的」就不再是有意義的問題 —— 表一定存在了。
       * 此時該問的是**另一個**問題：除了 schema 之外，有沒有任何業務資料被帶進來？
       * `DEC-15` 禁止匯入 dev／test 內容，而最容易發生的失誤是「順手跑了 smoke 或
       * 匯了一份備份」——那不會破壞 schema，只會安靜地多出幾百列。
       *
       * `promotions` 是**唯一**預期非零的表：`runIdempotentMigrations()` 會 seed
       * `WELCOME100` 與 `MAY10` 兩筆（`bootstrapModel.js`）。那是產品預設，不是測試資料。
       */
      const BUSINESS_TABLES = [
        "users", "materials", "material_files", "material_media_files",
        "orders", "order_items", "manual_payment_proofs",
        "reports", "review", "consumer_complaints", "cart_items",
        "activity_logs", "legal_documents", "consent_records", "privacy_requests",
      ];

      const counts = [];
      for (const table of BUSINESS_TABLES) {
        if (!present.has(table)) continue;
        const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
        counts.push([table, r.rows[0].n]);
      }
      const populated = counts.filter(([, n]) => n > 0);

      /*
       * `users` 需要單獨判讀，其餘表不用。
       *
       * `PRE-07` STEP 4 會**刻意**建立一個 admin，所以從那之後 `users = 1` 是**預期狀態**，
       * 不是「匯進了測試資料」。但那個豁免只對 admin 成立 —— 出現任何 buyer／creator
       * 就代表有人在 production 註冊或匯入了帳號，那仍然是 `DEC-15` 要擋的事。
       * 因此這裡看的是**角色組成**，不是單純的列數。
       */
      let userRoles = [];
      if (present.has("users")) {
        const r = await client.query(
          "SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY role"
        );
        userRoles = r.rows.map((x) => [x.role, x.n]);
      }
      const nonAdminUsers = userRoles.filter(([role]) => role !== "admin");
      const adminCount = (userRoles.find(([role]) => role === "admin") || [, 0])[1];
      const otherPopulated = populated.filter(([t]) => t !== "users");

      if (userRoles.length > 0) {
        console.log(`        users by role= ${userRoles.map(([r, n]) => `${r}=${n}`).join(", ")}`);
      }

      if (otherPopulated.length === 0 && nonAdminUsers.length === 0) {
        if (adminCount === 0) {
          pass(`no business data in any of ${counts.length} tables — DEC-15 satisfied after bootstrap`);
        } else {
          pass(
            `only ${adminCount} admin account(s) and no other business data — ` +
              "expected state after PRE-07 STEP 4"
          );
        }
      } else {
        const detail = [
          ...otherPopulated.map(([t, n]) => `${t}=${n}`),
          ...nonAdminUsers.map(([role, n]) => `users(role=${role})=${n}`),
        ].join(", ");
        warn(
          `unexpected business data present: ${detail}. DEC-15 forbids importing dev/test ` +
            "content, and production accounts other than the initial admin are not expected yet."
        );
      }

      // 預期由 bootstrap seed 的資料，單獨列出以免被誤判為「匯進來的測試資料」。
      if (present.has("promotions")) {
        const promos = await client.query("SELECT COUNT(*)::int AS n FROM promotions");
        console.log(
          `        promotions   = ${promos.rows[0].n} (bootstrap seeds WELCOME100 + MAY10; 2 is expected)`
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
