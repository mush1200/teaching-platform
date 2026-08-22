/**
 * Creator Gross Sales 與 Admin Recognized Revenue 的對帳整合測試。
 *
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * fixture id 帶 `tp_cstest_` 前綴，測試前後各清一次，因此可重複執行。
 * 斷言一律採「相對同一期間 baseline 的差值」，不依賴資料庫既有筆數。
 *
 * 這支測試要證明的事：
 *   1. Creator 與 Admin 涵蓋**完全相同的一組訂單**（approved + paid_at NOT NULL）
 *   2. 兩者在**完全相同的日期**認列（orders.paid_at）
 *   3. 金額**刻意不同**：Admin = orders.total_amount（折扣後）、
 *      Creator = Σ order_items.subtotal（折扣前），差額恰為 orders.discount_amount
 *   4. 跨創作者隔離（P0 security invariant）
 *   5. Asia/Taipei 日曆日、half-open [start, end)、趨勢補 0
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
const { getSalesSummary, getSalesByMaterial, getSalesRecords } = require("../services/teacherSales.service");

const PREFIX = "tp_cstest_";
const A = `${PREFIX}creatorA`;
const B = `${PREFIX}creatorB`;

/** 把「台北牆鐘時間」寫進無時區的 TIMESTAMP 欄位，與查詢端的換算完全對稱。 */
const TPE_NAIVE = (n) => `(($${n}::timestamp AT TIME ZONE 'Asia/Taipei') AT TIME ZONE current_setting('TimeZone'))`;

const NOW = new Date("2026-09-15T04:00:00.000Z");
const periodOf = (from, to) => resolveReportingRange({ range: "custom", from, to }, { now: NOW });

async function cleanup() {
  await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM orders WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function insertUser(id) {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role, created_at)
     VALUES($1, $2, 'x', 'teacher', ${TPE_NAIVE(3)})`,
    [id, `${id}@example.test`, "2026-01-01 00:00:00"]
  );
}

async function insertMaterial(id, sellerId) {
  await db.query(
    `INSERT INTO materials(id, title, teacher_id, status, file_key, price, created_at, updated_at)
     VALUES($1, $2, $3, 'published', $4, 0, ${TPE_NAIVE(5)}, ${TPE_NAIVE(5)})`,
    [PREFIX + id, `fixture ${id}`, sellerId, `files/${PREFIX}${id}.pdf`, "2026-01-01 00:00:00"]
  );
}

/**
 * 建立一筆訂單與其明細。
 * `items` = [{ material, seller, amount }]；`total` 若未指定則為 Σ amount - discount。
 */
async function insertOrder(id, { items, discount = 0, status = "approved", createdAtTpe, paidAtTpe = null, total }) {
  const gross = items.reduce((s, it) => s + it.amount, 0);
  const orderTotal = total != null ? total : Math.max(0, gross - discount);
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount,
                        created_at, updated_at, paid_at)
     VALUES($1, $2, $3, 'manual_transfer', $4, $4, $5, ${TPE_NAIVE(6)}, ${TPE_NAIVE(6)},
            CASE WHEN $7::text IS NULL THEN NULL ELSE ${TPE_NAIVE(7)} END)`,
    [PREFIX + id, `${PREFIX}buyer`, status, orderTotal, discount, createdAtTpe, paidAtTpe]
  );
  let n = 0;
  for (const it of items) {
    n += 1;
    await db.query(
      `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, seller_id, subtotal)
       VALUES($1, $2, $3, 'fixture', $4, 1, $5, $4)`,
      [`${PREFIX}${id}_i${n}`, PREFIX + id, PREFIX + it.material, it.amount, it.seller]
    );
  }
}

const P = {
  aug05: periodOf("2026-08-05", "2026-08-05"),
  august: periodOf("2026-08-01", "2026-08-31"),
  aug01: periodOf("2026-08-01", "2026-08-01"),
  aug12: periodOf("2026-08-12", "2026-08-12"),
  aug19: periodOf("2026-08-19", "2026-08-19"),
  aug20: periodOf("2026-08-20", "2026-08-20"),
  jul14to20: periodOf("2026-07-14", "2026-07-20"),
  jun: periodOf("2026-06-10", "2026-06-10"),
  wide: periodOf("2026-01-01", "2026-09-01"),
};

const base = {};

/** 相對 baseline 的差值。 */
const d = (now, was, key) => Number(now[key]) - Number(was[key]);

test("creator gross sales vs admin recognized revenue", async (t) => {
  assert.equal((await db.query("SELECT current_database() AS d")).rows[0].d, EXPECTED_DB);

  await cleanup();
  await insertUser(A);
  await insertUser(B);
  await insertUser(`${PREFIX}buyer`);
  await insertMaterial("matA", A);
  await insertMaterial("matB", B);

  for (const [name, period] of Object.entries(P)) {
    base[name] = {
      admin: await getDashboardSummary(period),
      a: await getSalesSummary(period, A),
      b: await getSalesSummary(period, B),
    };
  }

  // ── fixtures ────────────────────────────────────────────────────────────────
  // §58 Case 1 — 單一創作者，無折扣。8/1 下單、8/5 核准。
  await insertOrder("c1", {
    items: [{ material: "matA", seller: A, amount: 1000 }],
    discount: 0, createdAtTpe: "2026-08-01 10:00:00", paidAtTpe: "2026-08-05 14:00:00",
  });
  // §59 Case 2 — 單一創作者 + 折扣 200。同樣 8/5 核准。
  await insertOrder("c2", {
    items: [{ material: "matA", seller: A, amount: 1000 }],
    discount: 200, createdAtTpe: "2026-08-01 11:00:00", paidAtTpe: "2026-08-05 15:00:00",
  });
  // §60 Case 3 — 多創作者，無折扣。8/19 核准。
  await insertOrder("c3", {
    items: [{ material: "matA", seller: A, amount: 600 }, { material: "matB", seller: B, amount: 400 }],
    discount: 0, createdAtTpe: "2026-08-18 10:00:00", paidAtTpe: "2026-08-19 10:00:00",
  });
  // §61 Case 4 — 多創作者 + 折扣 200。8/20 00:30（跨台北午夜）核准。
  await insertOrder("c4", {
    items: [{ material: "matA", seller: A, amount: 600 }, { material: "matB", seller: B, amount: 400 }],
    discount: 200, createdAtTpe: "2026-08-19 23:00:00", paidAtTpe: "2026-08-20 00:30:00",
  });
  // §62 Case 5 — pending_payment（從未核准）。
  await insertOrder("c5", {
    items: [{ material: "matA", seller: A, amount: 7777 }],
    status: "pending_payment", createdAtTpe: "2026-08-05 09:00:00",
  });
  // §63 Case 6 — 憑證遭駁回：訂單狀態不變，仍 pending_payment。
  await insertOrder("c6", {
    items: [{ material: "matA", seller: A, amount: 8888 }],
    status: "pending_payment", createdAtTpe: "2026-08-05 09:30:00",
  });
  // §64 Case 7 — 延遲核准：8/1 下單、8/12 核准。
  await insertOrder("c7", {
    items: [{ material: "matA", seller: A, amount: 333 }],
    discount: 0, createdAtTpe: "2026-08-01 09:00:00", paidAtTpe: "2026-08-12 09:00:00",
  });
  // §66 Case 9 — half-open：台北 8/21 00:00 核准。
  await insertOrder("c9", {
    items: [{ material: "matA", seller: A, amount: 999 }],
    discount: 0, createdAtTpe: "2026-08-20 10:00:00", paidAtTpe: "2026-08-21 00:00:00",
  });
  // §67 Case 10 — legacy：approved 但 paid_at 為 NULL。
  await insertOrder("c10", {
    items: [{ material: "matA", seller: A, amount: 4242 }],
    discount: 0, createdAtTpe: "2026-06-10 12:00:00", paidAtTpe: null,
  });
  // §69 趨勢補 0：7/14、7/16、7/20 各一筆。
  for (const [n, day] of [["t14", "2026-07-14"], ["t16", "2026-07-16"], ["t20", "2026-07-20"]]) {
    await insertOrder(n, {
      items: [{ material: "matA", seller: A, amount: 100 }],
      discount: 0, createdAtTpe: `${day} 09:00:00`, paidAtTpe: `${day} 09:00:00`,
    });
  }

  const snap = async (name) => ({
    admin: await getDashboardSummary(P[name]),
    a: await getSalesSummary(P[name], A),
    b: await getSalesSummary(P[name], B),
  });

  await t.test("Case 1+2 — single creator, with and without discount (2026-08-05)", async () => {
    const s = await snap("aug05");
    const w = base.aug05;
    // 兩筆都在 8/5 核准：gross 1000 + 1000 = 2000，折扣 0 + 200 = 200，實付 1000 + 800 = 1800。
    assert.equal(d(s.a, w.a, "totalSalesAmount"), 2000, "Creator gross sales are pre-discount");
    assert.equal(d(s.admin, w.admin, "periodRevenueAmount"), 1800, "Admin revenue is post-discount");
    // §57 可解釋差額：Σ Creator gross − Σ discount = Admin revenue
    assert.equal(2000 - 200, 1800);
    assert.equal(d(s.a, w.a, "totalOrders"), 2);
    assert.equal(d(s.b, w.b, "totalSalesAmount"), 0, "creator B had no sales that day");
  });

  await t.test("Case 3 — multi creator, no discount (2026-08-19)", async () => {
    const s = await snap("aug19");
    const w = base.aug19;
    assert.equal(d(s.a, w.a, "totalSalesAmount"), 600);
    assert.equal(d(s.b, w.b, "totalSalesAmount"), 400);
    assert.equal(d(s.admin, w.admin, "periodRevenueAmount"), 1000, "no discount → creator sum equals admin");
    assert.equal(600 + 400, 1000);
  });

  await t.test("Case 4 — multi creator + discount: creator sum intentionally exceeds admin", async () => {
    const s = await snap("aug20");
    const w = base.aug20;
    // paid_at 為台北 8/20 00:30（UTC 8/19T16:30Z）；若邊界用 UTC 日曆日，這裡會是 0。
    assert.equal(d(s.a, w.a, "totalSalesAmount"), 600, "creator A gross, before discount");
    assert.equal(d(s.b, w.b, "totalSalesAmount"), 400, "creator B gross, before discount");
    assert.equal(d(s.admin, w.admin, "periodRevenueAmount"), 800, "admin collects the discounted total");
    // §61：**不得**實作 net sales（A 480 / B 320）。
    assert.equal(600 + 400, 1000);
    assert.equal(1000 - 200, 800, "the gap is exactly orders.discount_amount");
  });

  await t.test("Case 5+6 — pending payment and rejected proof contribute nothing", async () => {
    // 兩筆都在 8/5 建立、從未核准；8/5 的統計不得包含它們（7777 / 8888 都很顯眼）。
    const s = await snap("aug05");
    const w = base.aug05;
    assert.equal(d(s.a, w.a, "totalSalesAmount"), 2000, "7777 and 8888 must not appear");
    assert.equal(d(s.admin, w.admin, "periodRevenueAmount"), 1800);
    // 整個八月也一樣。
    const aug = await snap("august");
    assert.ok(!String(d(aug.a, base.august.a, "totalSalesAmount")).includes("7777"));
  });

  await t.test("Case 7 — delayed approval is recognised on paid_at, not created_at", async () => {
    const created = await snap("aug01");
    assert.equal(d(created.a, base.aug01.a, "totalSalesAmount"), 0, "8/1 is the order date, not the sale date");
    assert.equal(d(created.admin, base.aug01.admin, "periodRevenueAmount"), 0);

    const paid = await snap("aug12");
    assert.equal(d(paid.a, base.aug12.a, "totalSalesAmount"), 333, "recognised on 8/12");
    assert.equal(d(paid.admin, base.aug12.admin, "periodRevenueAmount"), 333);
    assert.equal(d(paid.a, base.aug12.a, "totalOrders"), 1);
  });

  await t.test("Case 9 — half-open: the next day's 00:00 is excluded", async () => {
    // c9 的 paid_at 是台北 8/21 00:00，金額 999 —— 查 8/20 不得出現。
    const s = await snap("aug20");
    assert.equal(d(s.a, base.aug20.a, "totalSalesAmount"), 600, "999 must not leak into 8/20");
  });

  await t.test("Case 10 — legacy approved rows without paid_at never enter period sales", async () => {
    const s = await snap("jun");
    assert.equal(d(s.a, base.jun.a, "totalSalesAmount"), 0, "must not fall back to created_at");
    assert.equal(d(s.admin, base.jun.admin, "periodRevenueAmount"), 0);
    // 最寬的期間也一樣抓不到它。
    const wide = await snap("wide");
    const wideCreator = d(wide.a, base.wide.a, "totalSalesAmount");
    assert.ok(!String(wideCreator).includes("4242"), `legacy row leaked: ${wideCreator}`);
  });

  await t.test("reconciliation invariant across the whole month", async () => {
    const s = await snap("august");
    const w = base.august;
    const creatorGross = d(s.a, w.a, "totalSalesAmount") + d(s.b, w.b, "totalSalesAmount");
    const adminRevenue = d(s.admin, w.admin, "periodRevenueAmount");
    // 八月（8/01–8/31）核准的訂單，依 paid_at：
    //   c1 gross 1000 / discount   0   (8/05)
    //   c2 gross 1000 / discount 200   (8/05)
    //   c3 gross 1000 / discount   0   (8/19，A 600 + B 400)
    //   c4 gross 1000 / discount 200   (8/20，A 600 + B 400)
    //   c7 gross  333 / discount   0   (8/12)
    //   c9 gross  999 / discount   0   (8/21 —— 在八月內，只是不在 8/20 的單日期間內)
    assert.equal(creatorGross, 5332);
    assert.equal(adminRevenue, 4932);
    assert.equal(creatorGross - 400, adminRevenue, "Σ creator gross − Σ discount = admin revenue");
  });

  await t.test("§69 trend gap fill: every day in the period gets a bucket", async () => {
    const s = await getSalesSummary(P.jul14to20, A);
    assert.equal(s.granularity, "day");
    assert.deepEqual(
      s.trend.map((p) => p.key),
      ["2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20"]
    );
    const bw = new Map(base.jul14to20.a.trend.map((p) => [p.key, p.salesAmount]));
    const delta = Object.fromEntries(
      s.trend.map((p) => [p.key, p.salesAmount - (bw.get(p.key) ?? 0)]).filter(([, v]) => v !== 0)
    );
    assert.deepEqual(delta, { "2026-07-14": 100, "2026-07-16": 100, "2026-07-20": 100 });
    // 補 0 的日期必須是數字 0，不是 undefined/null。
    for (const gap of ["2026-07-15", "2026-07-17", "2026-07-18", "2026-07-19"]) {
      const point = s.trend.find((p) => p.key === gap);
      assert.equal(typeof point.salesAmount, "number");
      assert.equal(typeof point.soldUnits, "number");
    }
  });

  await t.test("§70 hourly granularity buckets by the Taipei hour", async () => {
    const s = await getSalesSummary(P.aug20, A);
    assert.equal(s.granularity, "hour");
    assert.equal(s.trend.length, 24);
    assert.equal(s.trend[0].key, "2026-08-20T00");
    assert.equal(s.trend[23].key, "2026-08-20T23");
    const bw = new Map(base.aug20.a.trend.map((p) => [p.key, p.salesAmount]));
    // c4 的 paid_at 是台北 00:30 → 落 T00。
    assert.equal(s.trend[0].salesAmount - (bw.get("2026-08-20T00") ?? 0), 600);
  });

  await t.test("§71 ranges over 90 days use monthly buckets", async () => {
    const s = await getSalesSummary(P.wide, A);
    assert.equal(s.granularity, "month");
    assert.ok(s.trend.length <= 13);
    assert.ok(s.trend.every((p) => /^\d{4}-\d{2}$/.test(p.key)), "monthly keys must be YYYY-MM");
  });

  await t.test("trend keys are machine-friendly strings, never PG date objects", async () => {
    const s = await getSalesSummary(P.jul14to20, A);
    for (const p of s.trend) {
      assert.equal(typeof p.key, "string");
      assert.match(p.key, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(p.day, p.key, "deprecated alias must mirror the canonical key");
      assert.equal(p.revenue, p.salesAmount);
    }
  });

  await t.test("trend total reconciles with the period total", async () => {
    const s = await getSalesSummary(P.august, A);
    const w = base.august.a;
    const bw = new Map(w.trend.map((p) => [p.key, p.salesAmount]));
    const trendDelta = s.trend.reduce((sum, p) => sum + (p.salesAmount - (bw.get(p.key) ?? 0)), 0);
    assert.equal(trendDelta, s.totalSalesAmount - w.totalSalesAmount);
  });

  await t.test("§68 authorization: creators only ever see their own items", async () => {
    const period = P.august;
    const [sa, sb] = [await getSalesSummary(period, A), await getSalesSummary(period, B)];
    // c3 + c4 各含 A 與 B 的商品；兩人看到的金額必須只含自己的行。
    assert.equal(d(sa, base.august.a, "totalSalesAmount"), 4532, "A: 1000+1000+600+600+333+999");
    assert.equal(d(sb, base.august.b, "totalSalesAmount"), 800, "B: 400+400");

    const [ma, mb] = [
      await getSalesByMaterial(period, A, { page: 1, limit: 50 }),
      await getSalesByMaterial(period, B, { page: 1, limit: 50 }),
    ];
    assert.ok(ma.items.every((r) => r.materialId.startsWith(`${PREFIX}matA`) || !r.materialId.startsWith(PREFIX)));
    assert.ok(!ma.items.some((r) => r.materialId === `${PREFIX}matB`), "A must not see B's material");
    assert.ok(!mb.items.some((r) => r.materialId === `${PREFIX}matA`), "B must not see A's material");

    const [ra, rb] = [
      await getSalesRecords(period, A, { page: 1, limit: 100 }),
      await getSalesRecords(period, B, { page: 1, limit: 100 }),
    ];
    assert.ok(!ra.items.some((r) => r.materialId === `${PREFIX}matB`));
    assert.ok(!rb.items.some((r) => r.materialId === `${PREFIX}matA`));
  });

  await t.test("records are ordered by paid_at and exclude ineligible orders", async () => {
    const r = await getSalesRecords(P.august, A, { page: 1, limit: 100 });
    const mine = r.items.filter((x) => String(x.orderId).startsWith(PREFIX));
    // c1, c2, c3, c4, c7, c9 —— 排除 c5/c6（pending_payment）與 c10（paid_at 為 NULL）。
    assert.equal(mine.length, 6);
    assert.ok(!mine.some((x) => x.orderId === `${PREFIX}c5` || x.orderId === `${PREFIX}c6`), "pending orders excluded");
    assert.ok(!mine.some((x) => x.orderId === `${PREFIX}c10`), "legacy row without paid_at excluded");
    for (const row of mine) {
      assert.ok(row.paidAt != null, "every record must have a recognition timestamp");
      assert.equal(row.orderStatus, "approved");
    }
    const paidTimes = mine.map((x) => new Date(x.paidAt).getTime());
    assert.deepEqual(paidTimes, [...paidTimes].sort((a, b) => b - a), "ORDER BY paid_at DESC");
  });

  await t.test("materials aggregation uses paid_at for lastSoldAt", async () => {
    const m = await getSalesByMaterial(P.august, A, { page: 1, limit: 50 });
    const row = m.items.find((x) => x.materialId === `${PREFIX}matA`);
    assert.ok(row, "creator A's material must appear");
    // 八月內 matA 最後一筆成交是 c9，paid_at = 台北 2026-08-21 00:00。
    // 若 lastSoldAt 仍取 MAX(created_at)，最晚的會是 c9 的下單日 8/20 10:00，時間不同。
    const lastSold = await db.query(
      `SELECT to_char($1::timestamp, 'YYYY-MM-DD HH24:MI') AS wall`, [row.lastSoldAt]
    );
    assert.equal(lastSold.rows[0].wall, "2026-08-21 00:00", "lastSoldAt must be MAX(paid_at), not MAX(created_at)");
    assert.equal(row.salesAmount, row.revenue, "deprecated alias mirrors the canonical field");
  });

  await t.test("period metadata is echoed by every endpoint", async () => {
    const period = P.jul14to20;
    for (const payload of [
      await getSalesSummary(period, A),
      await getSalesByMaterial(period, A, {}),
      await getSalesRecords(period, A, {}),
    ]) {
      assert.equal(payload.periodFrom, "2026-07-14");
      assert.equal(payload.periodTo, "2026-07-20");
      assert.equal(payload.periodTimezone, "Asia/Taipei");
      assert.equal(payload.periodPreset, "custom");
    }
  });

  t.after(async () => {
    await cleanup();
    await db.pool.end();
  });
});
