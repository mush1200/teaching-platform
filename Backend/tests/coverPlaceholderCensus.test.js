/**
 * `SEC-04` —— `scripts/cover-placeholder-census.js` 的無資料庫契約（跑在 `test:unit`／CI）。
 *
 * 1. 判定規則（closure rule）是純函式，三種結果各一個 case。
 * 2. 原始碼掃描：去掉註解後**不得**含任何寫入／DDL 語句，且必須在 READ ONLY transaction 內執行、
 *    以 ROLLBACK 結束 —— 這支腳本會被拿去對 production 執行，唯讀必須由建構保證。
 * 真的連資料庫跑一次的驗證在 `coverPlaceholderCensus.db.test.js`。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { classify } = require("../scripts/cover-placeholder-census");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "scripts", "cover-placeholder-census.js"), "utf8");
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("classify: nothing found → CLOSE", () => {
  assert.equal(classify({ bootstrap_written_exact: 0, picsum_any: 0 }), "CLOSE");
});

test("classify: startup-pattern rows → REMEDIATION_OPEN (even with other picsum rows)", () => {
  assert.equal(classify({ bootstrap_written_exact: 3, picsum_any: 5 }), "REMEDIATION_OPEN");
});

test("classify: picsum but not the startup pattern → REVIEW_MANUAL_PICSUM", () => {
  assert.equal(classify({ bootstrap_written_exact: 0, picsum_any: 2 }), "REVIEW_MANUAL_PICSUM");
});

test("census source contains no write or DDL statements", () => {
  // 以單字邊界、區分大小寫比對 SQL 關鍵字（本檔 SQL 一律大寫）：
  // `samplesTruncated` 之類的識別字與給 operator 的「Do NOT delete」提示都不是 SQL 語句。
  for (const kw of ["UPDATE", "DELETE", "INSERT", "TRUNCATE", "DROP", "ALTER", "CREATE", "GRANT", "COMMIT"]) {
    assert.equal(new RegExp(`\\b${kw}\\b`).test(CODE), false, `census 可執行程式碼不得含 ${kw}`);
  }
});

test("census runs inside a read-only transaction and always rolls back", () => {
  assert.match(CODE, /BEGIN TRANSACTION READ ONLY/);
  assert.match(CODE, /current_setting\('transaction_read_only'\)/);
  assert.match(CODE, /finally\s*\{\s*await client\.query\("ROLLBACK"\)/);
});

test("negative control: the keyword scan would catch a write", () => {
  const tampered = CODE + '\nclient.query("UPDATE materials SET cover_image_url = NULL");';
  assert.equal(/\bUPDATE\b/.test(tampered), true);
  assert.equal(/\bTRUNCATE\b/.test("report.samplesTruncated = true"), false, "identifiers must not trip the scan");
});
