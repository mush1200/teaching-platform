/**
 * Admin 清單共用 query 契約的單元測試（無資料庫）。
 *
 *   node --test tests/adminQuery.test.js
 *
 * 重點在兩件事：
 *   1. 分頁上限是硬的 —— 不得靠 `limit=10000` 一次抓完整張表
 *   2. `toLikePattern` 必須跳脫 `%` / `_` / `\` —— 否則使用者搜尋 `100%`
 *      會退化成萬用字元查詢，回傳一堆不相干的列
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PAGE_SIZE_OPTIONS,
  parsePagination,
  buildPaginationMeta,
  optionalString,
  toLikePattern,
} = require("../utils/adminQuery");

test("預設分頁", () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: DEFAULT_LIMIT, offset: 0 });
  assert.deepEqual(parsePagination({ page: "3", limit: "50" }), { page: 3, limit: 50, offset: 100 });
});

test("非法輸入回落到預設，不丟例外", () => {
  assert.deepEqual(parsePagination({ page: "banana", limit: "-1" }), {
    page: 1,
    limit: DEFAULT_LIMIT,
    offset: 0,
  });
  assert.deepEqual(parsePagination({ page: "0" }), { page: 1, limit: DEFAULT_LIMIT, offset: 0 });
});

test("limit 上限是硬的", () => {
  assert.equal(parsePagination({ limit: "10000" }).limit, MAX_LIMIT);
  // UI 的每頁筆數選單不得提供超過上限的值，否則使用者會選到一個被靜默改小的數字。
  for (const size of PAGE_SIZE_OPTIONS) {
    assert.ok(size <= MAX_LIMIT, `${size} <= ${MAX_LIMIT}`);
    assert.equal(parsePagination({ limit: String(size) }).limit, size);
  }
});

test("空清單仍是「第 1 / 1 頁」", () => {
  assert.deepEqual(buildPaginationMeta({ page: 1, limit: 20 }, 0), {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  assert.equal(buildPaginationMeta({ page: 1, limit: 20 }, 41).totalPages, 3);
});

test("optionalString：空字串視為未提供", () => {
  assert.equal(optionalString({ q: "  " }, "q"), null);
  assert.equal(optionalString({}, "q"), null);
  assert.equal(optionalString({ q: " abc " }, "q"), "abc");
});

test("toLikePattern 跳脫萬用字元", () => {
  assert.equal(toLikePattern("abc"), "%abc%");
  assert.equal(toLikePattern("100%"), "%100\\%%");
  assert.equal(toLikePattern("a_b"), "%a\\_b%");
  // 反斜線必須先跳脫，否則 `\%` 會被當成「已跳脫的百分號」
  assert.equal(toLikePattern("a\\b"), "%a\\\\b%");
});
