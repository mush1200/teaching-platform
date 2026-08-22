/**
 * Admin 清單 endpoint 共用的 query 解析。
 *
 * `page` / `limit` 的規則過去在 `routes/admin.js` 與 `routes/adminActivityLogs.js`
 * 各抄一份（同樣的預設值、同樣的上限），新增清單時很容易長出第三份稍微不同的版本。
 * 這裡是唯一定義：**所有 Admin 清單的分頁契約完全相同**。
 *
 *   page  ── 1 起算；非數字／< 1 → 1
 *   limit ── 預設 20；非數字／< 1 → 20；上限 100
 *
 * `limit` 的上限是硬性的：Admin UI 的「每頁筆數」選單只能提供 <= 100 的值，
 * 不得靠 `limit=10000` 一次抓完整張表。
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** UI 每頁筆數選單的 canonical 選項；與 `MAX_LIMIT` 同源。 */
const PAGE_SIZE_OPTIONS = Object.freeze([20, 50, 100]);

function parsePagination(query = {}) {
  let page = Number.parseInt(String(query.page ?? "1"), 10);
  let limit = Number.parseInt(String(query.limit ?? String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  return { page, limit, offset: (page - 1) * limit };
}

/** `{ page, limit, total, totalPages }`；`totalPages` 至少為 1（空清單仍是「第 1 頁」）。 */
function buildPaginationMeta({ page, limit }, total) {
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  return {
    page,
    limit,
    total: safeTotal,
    totalPages: Math.max(1, Math.ceil(safeTotal / limit)),
  };
}

/** trim 後的字串；空字串一律視為「未提供」→ `null`（不要送空字串進 WHERE）。 */
function optionalString(query, key) {
  const raw = query?.[key];
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

/**
 * 自由文字搜尋字串 → `ILIKE` pattern。
 *
 * `%` 與 `_` 必須跳脫，否則使用者輸入 `100%` 會變成萬用字元查詢；
 * 反斜線本身也要先跳脫（順序不可調換）。搭配 SQL 端的 `ESCAPE '\'` 使用。
 */
function toLikePattern(value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PAGE_SIZE_OPTIONS,
  parsePagination,
  buildPaginationMeta,
  optionalString,
  toLikePattern,
};
