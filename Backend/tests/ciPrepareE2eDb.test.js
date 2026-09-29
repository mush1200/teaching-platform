/**
 * `UI-QA-CI` —— `scripts/ci/prepare-e2e-db.js` 的靜態護欄回歸。
 *
 * 那支腳本會對資料庫建表並寫入 seed；它唯一的合法目標是 CI job 剛建立的拋棄式資料庫。
 * 這裡釘住「靜態設定不對就拒絕」的每一條，確保任何一條被放寬都會紅燈。
 * 連線後的檢查（current_database／loopback／空 schema）需要真的資料庫，由 CI 本身執行。
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { staticRefusal, isLoopbackAddress, EXPECTED_DB } = require("../scripts/ci/prepare-e2e-db");

const OK = { CI_DISPOSABLE_DB: "1", PGDATABASE: EXPECTED_DB, PGHOST: "127.0.0.1" };

test("accepts the explicit disposable CI settings", () => {
  assert.equal(staticRefusal(OK), null);
  assert.equal(staticRefusal({ ...OK, PGHOST: "localhost" }), null);
  assert.equal(staticRefusal({ ...OK, PGHOST: "::1" }), null);
});

test("refuses without the CI_DISPOSABLE_DB opt-in", () => {
  assert.match(staticRefusal({ ...OK, CI_DISPOSABLE_DB: undefined }), /CI_DISPOSABLE_DB/);
  assert.match(staticRefusal({ ...OK, CI_DISPOSABLE_DB: "true" }), /CI_DISPOSABLE_DB/);
});

test("refuses NODE_ENV=production", () => {
  assert.match(staticRefusal({ ...OK, NODE_ENV: "production" }), /production/);
});

test("refuses any DATABASE_URL, even one that looks local", () => {
  assert.match(staticRefusal({ ...OK, DATABASE_URL: "postgres://127.0.0.1/x" }), /DATABASE_URL/);
});

test("refuses every database name except the E2E target", () => {
  for (const name of ["teaching_platform", "teaching_platform_ui_review", "postgres", undefined]) {
    assert.match(staticRefusal({ ...OK, PGDATABASE: name }), /PGDATABASE/, String(name));
  }
});

test("refuses non-loopback hosts", () => {
  for (const host of ["db.example.com", "10.0.0.5", "dpg-abc.render.com", "", undefined]) {
    assert.match(staticRefusal({ ...OK, PGHOST: host }), /PGHOST/, String(host));
  }
});

test("treats only loopback server addresses (or a unix socket) as local", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress(null), true);
  assert.equal(isLoopbackAddress("172.18.0.2"), false);
  assert.equal(isLoopbackAddress("10.1.2.3"), false);
});
