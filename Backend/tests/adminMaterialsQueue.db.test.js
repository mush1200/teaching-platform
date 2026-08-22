/**
 * Admin 教材審核佇列（篩選 / 搜尋 / 排序 / 分頁）的資料庫整合測試。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/adminMaterialsQueue.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料，只允許跑在 `teaching_platform_security_test`。
 * 所有 fixture id 帶 `tp_amqtest_` 前綴，測試前後各清一次。
 *
 * 要鎖住的東西：
 *   1. 分頁真的在 SQL 端發生（LIMIT / OFFSET），不是抓全部再切
 *   2. `statusCounts` 是**全表**計數，不受 status / q / 分頁影響
 *      —— Dashboard 的教材 KPI 靠它，抓一頁再 filter().length 會得到錯的數字
 *   3. 搜尋涵蓋教材標題與創作者 email，且萬用字元被跳脫
 *   4. 排序只走 allowlist，非法值被擋在 parse 階段
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const test = require("node:test");
const assert = require("node:assert/strict");

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  throw new Error(
    `ABORT: this test writes fixtures and must run against ${EXPECTED_DB}. ` +
      `PGDATABASE is currently ${JSON.stringify(process.env.PGDATABASE)}. ` +
      "Run it via `npm run test:db --prefix Backend`."
  );
}

const db = require("../config/db");
const service = require("../services/adminMaterials.service");

const PREFIX = "tp_amqtest_";
const id = (name) => `${PREFIX}${name}`;

async function cleanup() {
  await db.query(`DELETE FROM reports WHERE material_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

/** 25 筆 pending 是刻意的：預設 limit 是 20，一頁裝不下才測得到分頁。 */
const PENDING_COUNT = 25;

async function seed() {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES
       ($1, $2, 'x', 'teacher'),
       ($3, $4, 'x', 'buyer')`,
    [id("creator"), `${PREFIX}alice@example.test`, id("buyer"), `${PREFIX}buyer@example.test`]
  );

  const rows = [];
  for (let n = 0; n < PENDING_COUNT; n += 1) {
    rows.push([id(`pending_${String(n).padStart(2, "0")}`), `${PREFIX}待審教材 ${n}`, "pending_review", n]);
  }
  rows.push([id("published_a"), `${PREFIX}已上架教材 A`, "published", 100]);
  rows.push([id("published_b"), `${PREFIX}已上架教材 B`, "published", 101]);
  rows.push([id("unpublished_a"), `${PREFIX}已下架教材 A`, "unpublished", 102]);
  // 標題含 LIKE 萬用字元，用來證明搜尋有跳脫
  rows.push([id("wildcard"), `${PREFIX}100% 完成度教材`, "published", 103]);

  for (const [mid, title, status, seq] of rows) {
    await db.query(
      `INSERT INTO materials(id, title, price, teacher_id, status, file_key, created_at)
       VALUES($1, $2, $3, $4, $5, 'k', NOW() - ($6 || ' minutes')::interval)`,
      [mid, title, 100 + seq, id("creator"), status, String(seq)]
    );
  }

  // 一筆未結案的檢舉，用來驗 open_report_count
  await db.query(
    `INSERT INTO reports(id, material_id, reporter_id, reason, status)
     VALUES($1, $2, $3, '測試', 'pending')`,
    [id("rep1"), id("pending_00"), id("buyer")]
  );
}

const ours = (items) => items.filter((m) => String(m.id).startsWith(PREFIX));

test.before(async () => {
  const check = await db.query("SELECT current_database() AS db");
  assert.equal(check.rows[0].db, EXPECTED_DB);
  await cleanup();
  await seed();
});

test.after(async () => {
  await cleanup();
  await db.pool.end();
});

test("status 篩選只回該狀態，且 total 為符合條件的總數", async () => {
  const page1 = await service.listMaterials({ status: "pending_review", q: PREFIX, limit: 20 });
  assert.equal(page1.items.length, 20, "一頁最多 20 筆");
  assert.equal(page1.pagination.total, PENDING_COUNT);
  assert.equal(page1.pagination.totalPages, 2);
  for (const m of page1.items) assert.equal(m.status, "pending_review");
});

test("分頁在 SQL 端發生：第 2 頁是剩下的 5 筆，且與第 1 頁不重疊", async () => {
  const page1 = await service.listMaterials({ status: "pending_review", q: PREFIX, page: 1, limit: 20 });
  const page2 = await service.listMaterials({ status: "pending_review", q: PREFIX, page: 2, limit: 20 });
  assert.equal(page2.items.length, PENDING_COUNT - 20);
  const ids1 = new Set(page1.items.map((m) => m.id));
  for (const m of page2.items) assert.equal(ids1.has(m.id), false, `${m.id} 重複出現在兩頁`);
});

test("statusCounts 是全表計數，不受 status / q / 分頁影響", async () => {
  const counts = await service.getStatusCounts();
  const scoped = await db.query(
    `SELECT status, COUNT(*)::int c FROM materials WHERE id LIKE $1 GROUP BY status`,
    [`${PREFIX}%`]
  );
  const ourCounts = Object.fromEntries(scoped.rows.map((r) => [r.status, r.c]));

  // fixture 的貢獻必須完整反映在全表計數裡（其他既有資料只會讓數字更大）。
  assert.ok(counts.pending_review >= ourCounts.pending_review);
  assert.ok(counts.published >= ourCounts.published);
  assert.ok(counts.unpublished >= ourCounts.unpublished);
  assert.equal(counts.total, counts.pending_review + counts.published + counts.unpublished);

  // 拿一頁的 items 自己數是**錯的**——這正是這個欄位存在的理由。
  const onePage = await service.listMaterials({ limit: 20 });
  assert.ok(onePage.items.length <= 20);
  assert.ok(counts.total >= onePage.items.length);
});

test("搜尋涵蓋教材標題與創作者 email", async () => {
  const byTitle = await service.listMaterials({ q: `${PREFIX}已上架教材`, limit: 100 });
  assert.equal(ours(byTitle.items).length, 2);

  const byEmail = await service.listMaterials({ q: `${PREFIX}alice@`, limit: 100 });
  assert.equal(ours(byEmail.items).length, PENDING_COUNT + 4);
});

test("搜尋會跳脫 LIKE 萬用字元", async () => {
  // `100%` 若未跳脫，`%` 會變成萬用字元而撈回全部 fixture。
  const result = await service.listMaterials({ q: "100% 完成度", limit: 100 });
  const mine = ours(result.items);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, id("wildcard"));
});

test("status 與搜尋可以疊加", async () => {
  const result = await service.listMaterials({
    status: "published",
    q: `${PREFIX}已上架教材 A`,
    limit: 100,
  });
  assert.equal(ours(result.items).length, 1);
  assert.equal(result.items[0].id, id("published_a"));
});

test("排序走 allowlist；非法值在 parse 階段被擋下", async () => {
  assert.deepEqual(service.parseSortQuery("title_asc"), { valid: true, sort: "title_asc" });
  assert.equal(service.parseSortQuery("id; DROP TABLE materials").valid, false);
  assert.deepEqual(service.parseSortQuery(undefined), { valid: true, sort: service.DEFAULT_SORT });

  const asc = await service.listMaterials({ q: PREFIX, sort: "created_asc", limit: 100 });
  const desc = await service.listMaterials({ q: PREFIX, sort: "created_desc", limit: 100 });
  assert.equal(asc.items[0].id, desc.items[desc.items.length - 1].id);
});

test("status parse：all / 空字串視為不篩選；未知值 400", () => {
  assert.deepEqual(service.parseStatusQuery("all"), { valid: true, status: null });
  assert.deepEqual(service.parseStatusQuery(""), { valid: true, status: null });
  assert.deepEqual(service.parseStatusQuery(undefined), { valid: true, status: null });
  assert.equal(service.parseStatusQuery("draft").valid, false, "draft 不是後端存在的狀態");
  assert.equal(service.parseStatusQuery("rejected").valid, false);
});

test("每列帶創作者 email 與未結案檢舉數", async () => {
  const result = await service.listMaterials({ q: `${PREFIX}待審教材`, limit: 100 });
  const target = result.items.find((m) => m.id === id("pending_00"));
  assert.ok(target);
  assert.equal(target.creator_email, `${PREFIX}alice@example.test`);
  assert.equal(target.open_report_count, 1);

  const clean = result.items.find((m) => m.id === id("pending_01"));
  assert.ok(clean);
  assert.equal(clean.open_report_count, 0);
});
