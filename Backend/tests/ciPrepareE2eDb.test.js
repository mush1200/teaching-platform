/**
 * `UI-QA-CI` —— `scripts/ci/prepare-e2e-db.js` 的靜態護欄回歸。
 *
 * 那支腳本會對資料庫建表並寫入 seed；它唯一的合法目標是 CI job 剛建立的拋棄式資料庫。
 * 這裡釘住「靜態設定不對就拒絕」的每一條，確保任何一條被放寬都會紅燈。
 * 連線後的 `current_database()` 與空 schema 檢查需要真的資料庫，由 CI 本身執行；
 * server 位址的判定是純函式，在這裡釘住。
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { staticRefusal, isLocalServerAddress, EXPECTED_DB } = require("../scripts/ci/prepare-e2e-db");

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

test("accepts loopback, unix socket and container-network (RFC 1918) server addresses", () => {
  assert.equal(isLocalServerAddress("127.0.0.1"), true);
  assert.equal(isLocalServerAddress("::1"), true);
  assert.equal(isLocalServerAddress(null), true);
  // GitHub Actions service container behind the Docker port mapping (first real run).
  assert.equal(isLocalServerAddress("172.18.0.2"), true);
  assert.equal(isLocalServerAddress("10.1.2.3"), true);
  assert.equal(isLocalServerAddress("192.168.5.9"), true);
});

test("refuses public server addresses", () => {
  for (const addr of ["34.82.10.4", "172.32.0.1", "172.15.9.9", "8.8.8.8", "2600:1f18::1", "192.169.0.1"]) {
    assert.equal(isLocalServerAddress(addr), false, addr);
  }
});
