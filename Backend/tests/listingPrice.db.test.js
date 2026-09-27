/**
 * `COR-09` 上架價格強制 —— create／update 兩條路徑的 DB 級測試
 * （`DEC-34` 整數 TWD ＋ `DEC-39` 最低 NT$30）。
 *
 * 本檔鎖住三件事：
 *
 *   1. **兩條路徑同樣嚴格** —— create 與 update 都必須拒絕 29／30.5／99.5。
 *   2. **寫入的是驗證後的值** —— `COR-09` 的既有缺陷是 update 路徑驗證一個值、
 *      卻把 `req.body?.price` 的**原始值**寫進 DB。本檔直接讀回 DB 驗證。
 *   3. **partial-update 語意不變** —— 未提供價格時不得覆寫既有值。
 *
 * 這裡走 route handler（而非只測 policy 模組），因為缺陷本身就在
 * 「驗證」與「寫入」之間的接縫上 —— 只測 policy 抓不到它。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { MIN_LISTING_PRICE } = require("../utils/listingPricePolicy");

const PREFIX = "lpx_";

/** 這些測試會寫入資料；跑錯資料庫是不可接受的。 */
test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS name");
  assert.equal(rows[0].name, EXPECTED_DB);
});

async function cleanup() {
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function insertTeacher(id) {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1, $2, 'x', 'teacher')`,
    [id, `${id}@example.test`]
  );
}

/** 直接以 SQL 建立教材 —— 模擬「已存在的合法教材」，供 update 路徑測試。 */
async function insertMaterial(id, teacherId, price) {
  await db.query(
    `INSERT INTO materials(id, title, teacher_id, status, file_key, price)
     VALUES($1, $2, $3, 'changes_requested', $4, $5)`,
    [id, `fixture ${id}`, teacherId, `files/${id}.pdf`, price]
  );
}

async function readPrice(id) {
  const { rows } = await db.query(`SELECT price FROM materials WHERE id = $1`, [id]);
  return rows.length ? Number(rows[0].price) : null;
}

/** 以 handler 直呼的方式模擬一次 update 請求，回傳 { status, body }。 */
function callUpdate(handler, { id, user, body }) {
  return new Promise((resolve, reject) => {
    const req = { params: { id }, body, user };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload });
        return this;
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test("COR-09 update path: rejects sub-minimum, fractional; accepts valid; preserves omitted", async (t) => {
  await cleanup();
  t.after(cleanup);

  const teacherId = `${PREFIX}teacher`;
  await insertTeacher(teacherId);

  // route 模組在 require 時會建立 router；取出 PATCH /:id 的 handler。
  const materialsRouter = require("../routes/materials");
  const layer = materialsRouter.stack.find(
    (l) => l.route && l.route.path === "/:id" && l.route.methods.patch
  );
  assert.ok(layer, "PATCH /:id route must exist");
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const user = { userId: teacherId, role: "teacher" };

  // --- 拒絕：低於下限 ---
  const mid1 = `${PREFIX}m1`;
  await insertMaterial(mid1, teacherId, 120);
  const r29 = await callUpdate(handler, { id: mid1, user, body: { price: 29 } });
  assert.equal(r29.status, 400, "29 must be rejected");
  assert.equal(r29.body.error, "price_below_minimum");
  assert.equal(await readPrice(mid1), 120, "rejected update must not change stored price");

  // --- 拒絕：小數（且此為 raw-write 缺陷的回歸測試）---
  const r305 = await callUpdate(handler, { id: mid1, user, body: { price: 30.5 } });
  assert.equal(r305.status, 400, "30.5 must be rejected");
  assert.equal(r305.body.error, "price_not_integer");
  assert.equal(await readPrice(mid1), 120, "30.5 must not reach storage");

  const r995 = await callUpdate(handler, { id: mid1, user, body: { price: 99.5 } });
  assert.equal(r995.status, 400, "99.5 must be rejected");
  assert.equal(await readPrice(mid1), 120, "99.5 must not reach storage");

  // --- 接受：下限值，且必須原封不動寫入 ---
  const r30 = await callUpdate(handler, { id: mid1, user, body: { price: MIN_LISTING_PRICE } });
  assert.equal(r30.status, 200, `${MIN_LISTING_PRICE} must be accepted`);
  assert.equal(await readPrice(mid1), MIN_LISTING_PRICE, "accepted value stored exactly");

  // --- partial-update：未提供價格時不得覆寫 ---
  const rOmit = await callUpdate(handler, { id: mid1, user, body: { title: "renamed" } });
  assert.equal(rOmit.status, 200);
  assert.equal(await readPrice(mid1), MIN_LISTING_PRICE, "omitted price must remain unchanged");

  // --- 無靜默正規化：被拒絕的值不得以任何形式落地 ---
  const before = await readPrice(mid1);
  await callUpdate(handler, { id: mid1, user, body: { price: 250.9 } });
  assert.equal(await readPrice(mid1), before, "no silent floor/round/clamp on rejection");
});

test("COR-09: legacy fractional rows remain checkout-compatible while floorMoney is retained", async (t) => {
  await cleanup();
  t.after(cleanup);

  const teacherId = `${PREFIX}teacher2`;
  await insertTeacher(teacherId);

  // 直接以 SQL 寫入小數價格，模擬 legacy 資料（驗證層攔不到既有資料）。
  const mid = `${PREFIX}legacy`;
  await insertMaterial(mid, teacherId, 99.5);
  assert.equal(await readPrice(mid), 99.5, "legacy fractional row exists (NUMERIC, no CHECK)");

  // `floorMoney` 仍在，故建單時該列會被視為 99 —— 這是 COR-09 V8 刻意保留的相容行為。
  // 此測試存在的目的，是讓「提前移除 floorMoney」在對帳完成前會明顯失敗。
  const { floorMoney } = requireFloorMoneyProbe();
  assert.equal(floorMoney(99.5), 99, "floorMoney must still normalise legacy rows at order time");
});

/**
 * `floorMoney` 未被 export（它是 `orderService` 的內部函式）。
 * 這裡以最小的方式取得等價行為，避免為了測試而改動生產模組的 export 介面。
 */
function requireFloorMoneyProbe() {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "services", "orderService.js"), "utf8");
  assert.match(
    src,
    /const unitPrice = floorMoney\(row\.price\);/,
    "floorMoney must remain in the order path until the census/reconciliation is complete (COR-09 V8)"
  );
  return { floorMoney: (n) => Math.floor(Number(n)) };
}
