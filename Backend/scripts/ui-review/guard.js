"use strict";

/**
 * UI Review 環境的 **fail-closed production 護欄**。
 *
 * ## 這個檔案回答的唯一問題
 *
 * 「我正要寫入的這個資料庫，**可以被證明**不是 production 嗎？」
 *
 * 不是「看起來像 dev 嗎」，也不是「名字裡有 test 嗎」。**證明不了就一律中止。**
 * UI Review 的 reset／seed 會 `TRUNCATE` 使用者資料 —— 猜錯一次的代價是不可逆的。
 *
 * ## 為什麼是四層而不是一層
 *
 * 每一層都擋得住前一層漏掉的情況：
 *
 *   1. **NODE_ENV** —— `production` 直接拒絕，不看其他條件。
 *   2. **連線設定（靜態）** —— DB 名稱必須**整段相等** UI review 專用名稱，
 *      host 必須是 loopback，且整條連線字串不得命中任何託管供應商標記。
 *   3. **連線後（動態）** —— 真的連上去問 `current_database()` 與 `inet_server_addr()`。
 *      靜態設定可能被 `PGSERVICE`、`~/.pgpass`、`PGHOSTADDR` 等覆寫；
 *      **只有實際連線回報的身分算數**。
 *   4. **production 指紋** —— 若該 DB 裡存在只有 production 才會有的資料形狀
 *      （已核准的付款證明、真實 payout item），視為 production 並中止。
 *
 * ## 刻意沒有 `--force`
 *
 * 加了就等於把四層護欄變成一個提示。需要指向別的資料庫時，改 `UI_REVIEW_DB_NAME`
 * 這個常數並在 review 中說明，而不是在命令列繞過。
 *
 * 本檔**不得**被 production 程式路徑 require —— 它只服務 `npm run ui-review:*`。
 */

const { Client } = require("pg");

/** UI Review 專用資料庫名稱。**唯一**被允許的寫入目標。 */
const UI_REVIEW_DB_NAME = "teaching_platform_ui_review";

/**
 * 可接受的 loopback host。
 *
 * 空字串代表 unix socket／預設，在 Windows 上實測為 local named pipe，同樣是本機。
 */
const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * 託管資料庫供應商的網域標記。
 *
 * 命中任何一個即視為遠端 production 候選 —— **即使 DB 名稱剛好對**。
 * 本專案的 production 是 Neon；其餘為防止日後搬遷時這份護欄靜默失效。
 */
const REMOTE_PROVIDER_MARKERS = [
  /neon\.tech/i,
  /neon\.build/i,
  /render\.com/i,
  /amazonaws\.com/i,
  /\brds\b/i,
  /supabase\.(co|com|net)/i,
  /database\.azure\.com/i,
  /googleapis\.com/i,
  /cockroachlabs\.cloud/i,
  /planetscale/i,
  /heroku/i,
];

class UiReviewGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "UiReviewGuardError";
  }
}

function abort(reason, detail) {
  const lines = [
    "",
    "  ✖ UI REVIEW GUARD: ABORTED — 目標資料庫無法被證明為非 production。",
    "",
    `    原因：${reason}`,
  ];
  if (detail) lines.push(`    細節：${detail}`);
  lines.push(
    "",
    `    UI Review 只允許寫入本機的 ${UI_REVIEW_DB_NAME}。`,
    "    未執行任何寫入。",
    ""
  );
  throw new UiReviewGuardError(lines.join("\n"));
}

/** 從環境變數解析出「打算連到哪裡」，不連線。 */
function resolveTarget(env = process.env) {
  const url = (env.DATABASE_URL || "").trim();

  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      abort("DATABASE_URL 無法解析為 URL", "護欄無法判定目標，因此拒絕繼續。");
    }
    return {
      source: "DATABASE_URL",
      host: (parsed.hostname || "").toLowerCase(),
      database: decodeURIComponent((parsed.pathname || "").replace(/^\//, "")),
      // 只保留 host 與 db 供比對；**不回傳、不記錄任何憑證**。
      haystack: `${parsed.hostname || ""} ${parsed.pathname || ""} ${parsed.search || ""}`,
    };
  }

  const host = (env.PGHOST || "").trim().toLowerCase();
  const database = (env.PGDATABASE || "").trim();
  if (!database) {
    abort("既沒有 DATABASE_URL，PGDATABASE 也是空的", "護欄無法判定目標資料庫名稱。");
  }
  return { source: "PGHOST/PGDATABASE", host, database, haystack: `${host} ${database}` };
}

/** 第 1～2 層：環境與靜態連線設定。 */
function assertStaticTarget(env = process.env) {
  if (String(env.NODE_ENV || "").trim().toLowerCase() === "production") {
    abort("NODE_ENV=production", "UI Review 永遠不得在 production 模式下執行。");
  }

  const target = resolveTarget(env);

  for (const marker of REMOTE_PROVIDER_MARKERS) {
    if (marker.test(target.haystack)) {
      abort(
        "連線目標命中託管資料庫供應商標記",
        `來源 ${target.source}；命中樣式 ${marker}。即使資料庫名稱相符也一律拒絕。`
      );
    }
  }

  if (!LOCAL_HOSTS.has(target.host)) {
    abort(
      "資料庫 host 不是 loopback",
      `來源 ${target.source}；host = ${target.host || "(空)"}。只接受 ${[...LOCAL_HOSTS]
        .filter(Boolean)
        .join(" / ")}。`
    );
  }

  // **整段相等**，不得用 includes／startsWith —— `teaching_platform_ui_review_backup`
  // 之類的名字不該被放行（同一個錯誤在 proxy 的 ALLOW_ROOT 上發生過）。
  if (target.database !== UI_REVIEW_DB_NAME) {
    abort(
      "資料庫名稱不是 UI Review 專用資料庫",
      `來源 ${target.source}；目標 = ${target.database}，要求 = ${UI_REVIEW_DB_NAME}（整段相等）。`
    );
  }

  return target;
}

/** 第 3～4 層：連線後由伺服器自己回報的身分，以及 production 資料指紋。 */
async function assertLiveIdentity(client) {
  // `host()` 去掉 `inet` 型別附帶的網段（`::1` 會回 `::1/128`），直接比對位址本身。
  const { rows } = await client.query(
    "SELECT current_database() AS db, host(inet_server_addr()) AS addr, version() AS version"
  );
  const { db, addr } = rows[0];

  if (db !== UI_REVIEW_DB_NAME) {
    abort(
      "連線後 current_database() 與預期不符",
      `實際 = ${db}，要求 = ${UI_REVIEW_DB_NAME}。靜態設定可能被 PGSERVICE/.pgpass 覆寫。`
    );
  }

  // `inet_server_addr()` 在 unix socket／named pipe 連線時為 NULL，那本來就是本機。
  if (addr !== null && !["127.0.0.1", "::1"].includes(addr)) {
    abort("連線後伺服器位址不是 loopback", `inet_server_addr() = ${addr}`);
  }

  await assertNoProductionFingerprint(client);

  return { database: db, serverAddress: addr };
}

/**
 * production 指紋 —— 只有真實營運才會產生的資料形狀。
 *
 * 用「已核准的付款證明」與「payout item」而不是「有沒有使用者」：
 * UI Review 自己就會建使用者與訂單，拿那些當指紋會讓護欄在第二次執行時誤判。
 * 這兩者 UI Review **從不建立**，出現即代表連錯地方。
 */
async function assertNoProductionFingerprint(client) {
  const probes = [
    { table: "payment_proofs", where: "review_status = 'approved'", label: "已核准的付款憑證" },
    { table: "payout_items", where: "TRUE", label: "撥款項目" },
    { table: "creator_ledger_entries", where: "TRUE", label: "創作者分類帳分錄" },
  ];

  for (const probe of probes) {
    const exists = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [`public.${probe.table}`]
    );
    if (!exists.rows[0].present) continue;

    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${probe.table} WHERE ${probe.where}`
    );
    if (rows[0].n > 0) {
      abort(
        "目標資料庫含有 production 指紋資料",
        `${probe.table} 有 ${rows[0].n} 筆${probe.label}。UI Review 從不建立這類資料 —— 極可能連錯資料庫。`
      );
    }
  }
}

/**
 * 完整護欄：靜態 ＋ 動態。回傳一個**已驗證**的 client，呼叫端負責 `end()`。
 *
 * 任何一層不通過都會 throw，且**在 throw 之前不會有任何寫入發生**。
 */
async function connectVerified(env = process.env) {
  const target = assertStaticTarget(env);

  const client = new Client({
    host: target.host || "localhost",
    port: Number(env.PGPORT || 5432),
    user: env.PGUSER || "postgres",
    password: String(env.PGPASSWORD || ""),
    database: UI_REVIEW_DB_NAME,
  });

  await client.connect();
  try {
    const identity = await assertLiveIdentity(client);
    return { client, identity, target };
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
}

/** 人類可讀的證明列印（**不含任何憑證**）。 */
function printProof(identity, target) {
  console.log("  UI REVIEW GUARD: PASS — 目標已證明為非 production");
  console.log(`    設定來源            : ${target.source}`);
  console.log(`    current_database()  : ${identity.database}`);
  console.log(`    inet_server_addr()  : ${identity.serverAddress ?? "NULL（本機 socket）"}`);
  console.log(`    NODE_ENV            : ${process.env.NODE_ENV || "(未設定)"}`);
  console.log("    production 指紋      : 無");
}

module.exports = {
  UI_REVIEW_DB_NAME,
  UiReviewGuardError,
  assertStaticTarget,
  assertLiveIdentity,
  connectVerified,
  printProof,
  // 匯出供 guard 測試使用
  LOCAL_HOSTS,
  REMOTE_PROVIDER_MARKERS,
};
