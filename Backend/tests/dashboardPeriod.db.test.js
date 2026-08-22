/**
 * Admin dashboard period metrics 的資料庫整合測試。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/dashboardPeriod.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * 所有 fixture id 都帶 `tp_rptest_` 前綴，測試前後各清一次，因此可重複執行。
 * 斷言一律採「相對 baseline 的差值」，不依賴資料庫既有筆數。
 *
 * 這支測試要證明的三件事：
 *   1. period 邊界是 **Asia/Taipei 日曆日**，不是 UTC 日曆日
 *   2. 邊界是 **half-open [start, end)** —— 落在 end 那一瞬間的資料不算
 *   3. `orders.created_at`（新增訂單）與 `orders.paid_at`（營收認列）是兩個不同事件
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
const { resolveReportingRange } = require("../utils/reportingRange");
const { getDashboardSummary } = require("../services/adminDashboard.service");

const PREFIX = "tp_rptest_";

/**
 * 把「台北牆鐘時間」寫進**無時區**的 TIMESTAMP 欄位。
 * 與查詢端的邊界換算完全對稱（見 services/adminDashboard.service.js），
 * 因此無論資料庫 session 時區是什麼，fixture 都落在預期的台北時刻。
 */
const TPE_NAIVE = (n) => `(($${n}::timestamp AT TIME ZONE 'Asia/Taipei') AT TIME ZONE current_setting('TimeZone'))`;
/** 同樣的台北牆鐘時間，但寫進 TIMESTAMPTZ 欄位（不需要第二次換算）。 */
const TPE_INSTANT = (n) => `($${n}::timestamp AT TIME ZONE 'Asia/Taipei')`;

/** fixture 日期都在過去；注入固定 now 讓「不得選未來日期」的驗證與系統時鐘無關。 */
const NOW = new Date("2026-09-15T04:00:00.000Z");
const periodOf = (from, to) => resolveReportingRange({ range: "custom", from, to }, { now: NOW });

async function cleanup() {
  await db.query(`DELETE FROM review WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM orders WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function insertUser(id, createdAtTpe) {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role, created_at)
     VALUES($1, $2, 'x', 'buyer', ${TPE_NAIVE(3)})`,
    [PREFIX + id, `${PREFIX}${id}@example.test`, createdAtTpe]
  );
}

async function insertMaterial(id, createdAtTpe) {
  await db.query(
    `INSERT INTO materials(id, title, teacher_id, status, file_key, created_at, updated_at)
     VALUES($1, $2, $3, 'published', $4, ${TPE_NAIVE(5)}, ${TPE_NAIVE(5)})`,
    [PREFIX + id, `fixture ${id}`, `${PREFIX}owner`, `files/${PREFIX}${id}.pdf`, createdAtTpe]
  );
}

async function insertReview(id, materialId, parentId, createdAtTpe) {
  await db.query(
    `INSERT INTO review(id, material_id, parent_id, rating, comment, created_at)
     VALUES($1, $2, $3, 5, 'fixture', ${TPE_INSTANT(4)})`,
    [PREFIX + id, PREFIX + materialId, PREFIX + parentId, createdAtTpe]
  );
}

async function insertOrder(id, { userId, status, amount, createdAtTpe, paidAtTpe = null }) {
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, created_at, updated_at, paid_at)
     VALUES($1, $2, $3, 'manual_transfer', $4, $4, ${TPE_NAIVE(5)}, ${TPE_NAIVE(5)},
            CASE WHEN $6::text IS NULL THEN NULL ELSE ${TPE_NAIVE(6)} END)`,
    [PREFIX + id, PREFIX + userId, status, amount, createdAtTpe, paidAtTpe]
  );
}

/**
 * 受測期間。**每個期間都必須各自取 baseline** —— period metric 只在同一個期間內可比較，
 * 拿 A 期間的 baseline 去減 B 期間的結果會得到毫無意義的差值。
 */
const PERIODS = {
  aug05: periodOf("2026-08-05", "2026-08-05"),
  august: periodOf("2026-08-01", "2026-08-31"),
  aug19: periodOf("2026-08-19", "2026-08-19"),
  aug20: periodOf("2026-08-20", "2026-08-20"),
  jul10: periodOf("2026-07-10", "2026-07-10"),
  jul11: periodOf("2026-07-11", "2026-07-11"),
  wide: periodOf("2026-01-01", "2026-09-01"),
  aug01to10: periodOf("2026-08-01", "2026-08-10"),
};

/** 播種前先為每個期間各取一次 baseline。 */
const baselines = {};

test("dashboard period metrics", async (t) => {
  const dbNameRes = await db.query("SELECT current_database() AS d");
  assert.equal(dbNameRes.rows[0].d, EXPECTED_DB, "connected to the wrong database");

  await cleanup();
  for (const [name, period] of Object.entries(PERIODS)) {
    baselines[name] = await getDashboardSummary(period);
  }

  // ── fixtures ────────────────────────────────────────────────────────────────
  // 訂單擁有者：建立時間刻意遠離所有受測期間。
  await insertUser("owner", "2026-01-01 00:00:00");
  // 期間邊界用：7/10 00:00:00 應計入 7/10；7/11 00:00:00 是 endExclusive，不得計入。
  await insertUser("uin", "2026-07-10 00:00:00");
  await insertUser("uout", "2026-07-11 00:00:00");

  await insertMaterial("min", "2026-07-10 12:00:00");
  await insertMaterial("mout", "2026-07-11 00:00:00");

  // review.created_at 是 TIMESTAMPTZ，走與上述不同的比較路徑。
  await insertReview("rin", "min", "owner", "2026-07-10 23:59:59");
  await insertReview("rout", "mout", "owner", "2026-07-11 00:00:00");

  // §51：建立與核准分屬不同日期。
  await insertOrder("oa", {
    userId: "owner", status: "approved", amount: 100,
    createdAtTpe: "2026-08-01 10:00:00", paidAtTpe: "2026-08-05 14:00:00",
  });
  await insertOrder("ob", {
    userId: "owner", status: "pending_payment", amount: 200,
    createdAtTpe: "2026-08-05 09:00:00",
  });
  // §52：跨台北午夜。建立在 8/19 23:00，核准在 8/20 00:30。
  await insertOrder("oc", {
    userId: "owner", status: "approved", amount: 500,
    createdAtTpe: "2026-08-19 23:00:00", paidAtTpe: "2026-08-20 00:30:00",
  });
  // §53：期間端點精確性。
  await insertOrder("od", {
    userId: "owner", status: "pending_payment", amount: 7,
    createdAtTpe: "2026-07-10 00:00:00",
  });
  await insertOrder("oe", {
    userId: "owner", status: "pending_payment", amount: 9,
    createdAtTpe: "2026-07-11 00:00:00",
  });

  /** 查詢指定期間，回傳相對同一期間 baseline 的差值。 */
  async function deltas(name) {
    const now = await getDashboardSummary(PERIODS[name]);
    const base = baselines[name];
    return { raw: now, of: (key) => now[key] - base[key] };
  }

  await t.test("created_at and paid_at are different events (2026-08-05)", async () => {
    const d = await deltas("aug05");
    // Order B 在 8/5 建立 → 算新訂單；Order A 在 8/1 建立、8/5 核准 → 只算營收。
    assert.equal(d.of("newOrdersCount"), 1, "only Order B was created on 8/5");
    assert.equal(d.of("periodRevenueAmount"), 100, "only Order A was approved on 8/5");
  });

  await t.test("pending_payment orders never contribute revenue", async () => {
    // Order B（200）在 8/5 建立且從未核准，任何期間都不得出現在營收中。
    const d = await deltas("august");
    assert.equal(d.of("periodRevenueAmount"), 600, "only the two approved orders (100 + 500)");
    assert.equal(d.of("newOrdersCount"), 3, "Orders A, B, C were created in August");
  });

  await t.test("revenue is recognised on the Taipei day of paid_at (2026-08-20)", async () => {
    const d = await deltas("aug20");
    // paid_at = 台北 8/20 00:30（UTC 為 8/19 16:30Z）。若邊界用 UTC 日曆日，這裡會是 0。
    assert.equal(d.of("periodRevenueAmount"), 500, "Order C was approved on the Taipei 8/20");
    assert.equal(d.of("newOrdersCount"), 0, "no order was created on 8/20");
  });

  await t.test("order creation is attributed to the Taipei day of created_at (2026-08-19)", async () => {
    const d = await deltas("aug19");
    assert.equal(d.of("newOrdersCount"), 1, "Order C was created on the Taipei 8/19");
    assert.equal(d.of("periodRevenueAmount"), 0, "Order C was not approved until 8/20");
  });

  await t.test("range is half-open: the start instant is in, the end instant is out", async () => {
    const d = await deltas("jul10");
    // 每一組都是「恰好 00:00:00 的 7/10」與「恰好 00:00:00 的 7/11」。
    assert.equal(d.of("newOrdersCount"), 1, "07-10 00:00:00 in, 07-11 00:00:00 out");
    assert.equal(d.of("newUsersCount"), 1, "07-10 00:00:00 in, 07-11 00:00:00 out");
    assert.equal(d.of("newMaterialsCount"), 1, "07-10 12:00:00 in, 07-11 00:00:00 out");
    // TIMESTAMPTZ 欄位走另一條比較路徑，同樣必須是 half-open。
    assert.equal(d.of("newReviewsCount"), 1, "07-10 23:59:59 in, 07-11 00:00:00 out");
  });

  await t.test("the excluded fixtures do land in the next day's period", async () => {
    const d = await deltas("jul11");
    assert.equal(d.of("newOrdersCount"), 1);
    assert.equal(d.of("newUsersCount"), 1);
    assert.equal(d.of("newMaterialsCount"), 1);
    assert.equal(d.of("newReviewsCount"), 1);
  });

  await t.test("snapshot and all-time metrics are identical for every period", async () => {
    const results = [];
    for (const name of ["aug05", "aug20", "jul10", "wide"]) {
      results.push((await deltas(name)).raw);
    }

    const snapshotKeys = [
      "ordersCount", "usersCount", "materialsCount", "reviewsCount",
      "revenueAmount", "pendingProofsCount", "pendingReportsCount",
    ];
    for (const key of snapshotKeys) {
      const values = results.map((r) => r[key]);
      assert.equal(new Set(values).size, 1, `${key} must not change with the reporting period (got ${values.join(", ")})`);
    }

    // 全部 fixture 都應反映在 all-time 總數上。
    const base = baselines.aug05;
    assert.equal(results[0].ordersCount - base.ordersCount, 5);
    assert.equal(results[0].usersCount - base.usersCount, 3);
    assert.equal(results[0].materialsCount - base.materialsCount, 2);
    assert.equal(results[0].reviewsCount - base.reviewsCount, 2);
    // all-time 營收（不看 paid_at）：兩筆已核准訂單。
    assert.equal(results[0].revenueAmount - base.revenueAmount, 600);
  });

  await t.test("resolved period metadata is echoed back", async () => {
    const s = await getDashboardSummary(PERIODS.aug01to10);
    assert.equal(s.periodFrom, "2026-08-01");
    assert.equal(s.periodTo, "2026-08-10");
    assert.equal(s.periodTimezone, "Asia/Taipei");
    assert.equal(s.periodPreset, "custom");
  });

  t.after(async () => {
    await cleanup();
    await db.pool.end();
  });
});
