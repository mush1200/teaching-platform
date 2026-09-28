"use strict";

/**
 * `UI Review` production 護欄的回歸測試。
 *
 * 這一份存在的理由：護欄的價值**完全**取決於「它會不會擋」。
 * 一個永遠回 true 的 `assertStaticTarget` 讓所有 UI Review 指令看起來都正常，
 * 直到某次有人帶著 production 的連線設定跑 `ui-review:reset` —— 那時才發現已經來不及。
 *
 * 因此這裡斷言的是**拒絕**，不是通過：每一個 case 都必須 throw。
 * 只有最後一個「合法的本機目標」斷言不 throw。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertStaticTarget,
  UI_REVIEW_DB_NAME,
} = require("../scripts/ui-review/guard");

/** 一個合法的本機 UI Review 目標，各 case 以此為基準做單點變異。 */
const VALID = { PGHOST: "localhost", PGDATABASE: UI_REVIEW_DB_NAME };

function blocked(t, env, why) {
  assert.throws(
    () => assertStaticTarget(env),
    (err) => err.name === "UiReviewGuardError",
    `應該要被擋下來：${why}`
  );
}

test("合法的本機 UI Review 目標會通過", () => {
  const target = assertStaticTarget({ ...VALID });
  assert.equal(target.database, UI_REVIEW_DB_NAME);
  assert.equal(target.host, "localhost");
});

test("擋下 development 資料庫", (t) => {
  blocked(t, { ...VALID, PGDATABASE: "teaching_platform" }, "dev DB 不是 UI Review DB");
});

test("擋下 security test 資料庫", (t) => {
  blocked(t, { ...VALID, PGDATABASE: "teaching_platform_security_test" }, "security test DB 另有用途");
});

test("擋下名稱前綴相同但不相等的資料庫", (t) => {
  // 比對必須**整段相等**。`ALLOW_ROOT` 的 prefix 比對曾經因為同一類錯誤而放行過不該放行的路徑。
  blocked(t, { ...VALID, PGDATABASE: `${UI_REVIEW_DB_NAME}_backup` }, "前綴相同不等於同一個 DB");
  blocked(t, { ...VALID, PGDATABASE: `x${UI_REVIEW_DB_NAME}` }, "後綴相同不等於同一個 DB");
});

test("擋下非 loopback 的 host（即使資料庫名稱正確）", (t) => {
  blocked(t, { ...VALID, PGHOST: "10.0.0.5" }, "私有網段仍是遠端");
  blocked(t, { ...VALID, PGHOST: "db.internal" }, "具名主機仍是遠端");
});

test("擋下託管供應商（Neon 是本專案的 production）", (t) => {
  blocked(
    t,
    { ...VALID, PGHOST: "ep-abc.ap-southeast-1.aws.neon.tech" },
    "Neon host 是 production"
  );
  blocked(
    t,
    { DATABASE_URL: `postgres://u:p@ep-abc.aws.neon.tech/${UI_REVIEW_DB_NAME}` },
    "連線字串裡的 Neon host 同樣要擋"
  );
  blocked(
    t,
    { DATABASE_URL: `postgres://u:p@x.render.com/${UI_REVIEW_DB_NAME}` },
    "其他託管供應商亦然"
  );
});

test("擋下 NODE_ENV=production —— 優先於其他所有條件", (t) => {
  blocked(
    t,
    { ...VALID, NODE_ENV: "production" },
    "production 模式下永遠不執行 UI Review，連本機目標也不行"
  );
});

test("擋下無法判定的設定（fail-closed，不是預設放行）", (t) => {
  blocked(t, {}, "既無 DATABASE_URL 也無 PGDATABASE");
  blocked(t, { PGHOST: "localhost" }, "PGDATABASE 為空");
  blocked(t, { DATABASE_URL: "not-a-url" }, "無法解析的連線字串");
});

test("DATABASE_URL 指向本機的 UI Review DB 時通過", () => {
  const target = assertStaticTarget({
    DATABASE_URL: `postgres://postgres:x@localhost:5432/${UI_REVIEW_DB_NAME}`,
  });
  assert.equal(target.database, UI_REVIEW_DB_NAME);
  assert.equal(target.source, "DATABASE_URL");
});
