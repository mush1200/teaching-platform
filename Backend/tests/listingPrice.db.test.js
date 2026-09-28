/**
 * `COR-09` 上架價格 —— 最終不變條件的 DB 級回歸測試
 * （`DEC-34` 整數 TWD ＋ `DEC-39` 最低 NT$30）。
 *
 * 2026-09-28 收斂完成後，保證分成三層，本檔各自驗證：
 *
 *   1. **DB 型別** —— `materials.price` 為 `INTEGER NOT NULL`，無 `DEFAULT`。
 *   2. **DB 約束** —— `materials_price_min_check CHECK (price >= 30)`。
 *   3. **應用層驗證** —— `routes/materials.js` 經 `utils/listingPricePolicy` fail-fast。
 *
 * ⚠️ **本檔先前的前提已失效**：舊版試圖插入 `price = 99.5` 來模擬 legacy 小數列，
 * 但實際欄位是 `INTEGER`，PostgreSQL 會以 `22P02` 在斷言之前就拒絕。
 * 該情境**不再是現況的有效表述**，已改為直接驗證「小數無法持久化」這個更強的性質。
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

// ─────────────────────────────────────────────────────────────────────────
// 1. Schema 不變條件
// ─────────────────────────────────────────────────────────────────────────

test("schema: materials.price is INTEGER NOT NULL with no DEFAULT", async () => {
  const { rows } = await db.query(
    `SELECT data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'price'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data_type, "integer", "price must be INTEGER, not NUMERIC");
  assert.equal(rows[0].is_nullable, "NO");
  assert.equal(
    rows[0].column_default,
    null,
    "DEFAULT must be dropped — a missing price must fail, not silently become 0"
  );
});

test("schema: materials_price_min_check exists and enforces >= 30", async () => {
  const { rows } = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'public.materials'::regclass AND conname = 'materials_price_min_check'`
  );
  assert.equal(rows.length, 1, "materials_price_min_check must exist");
  assert.match(rows[0].def, /price >= 30/);
});

// ─────────────────────────────────────────────────────────────────────────
// 2. DB 層拒絕（不是只有應用層擋）
// ─────────────────────────────────────────────────────────────────────────

test("DB rejects a fractional price outright — it can never persist", async (t) => {
  await cleanup();
  t.after(cleanup);
  const teacherId = `${PREFIX}t_frac`;
  await insertTeacher(teacherId);

  await assert.rejects(
    () => insertMaterial(`${PREFIX}frac`, teacherId, 99.5),
    (err) => {
      // INTEGER 欄位對 99.5 會回 22P02（invalid_text_representation）。
      assert.equal(err.code, "22P02", `expected 22P02, got ${err.code}`);
      return true;
    },
    "a fractional price must not be storable at all"
  );
  assert.equal(await readPrice(`${PREFIX}frac`), null, "nothing may have persisted");
});

test("DB rejects a below-minimum price via CHECK, not merely app validation", async (t) => {
  await cleanup();
  t.after(cleanup);
  const teacherId = `${PREFIX}t_min`;
  await insertTeacher(teacherId);

  for (const bad of [29, 1, 0, -5]) {
    await assert.rejects(
      () => insertMaterial(`${PREFIX}min${bad}`, teacherId, bad),
      (err) => {
        // 23514 = check_violation
        assert.equal(err.code, "23514", `price ${bad}: expected 23514, got ${err.code}`);
        assert.match(err.constraint || "", /materials_price_min_check/);
        return true;
      },
      `price ${bad} must be rejected by the DB CHECK`
    );
  }
});

test("DB accepts a compliant integer price at the boundary and above", async (t) => {
  await cleanup();
  t.after(cleanup);
  const teacherId = `${PREFIX}t_ok`;
  await insertTeacher(teacherId);

  await insertMaterial(`${PREFIX}ok30`, teacherId, MIN_LISTING_PRICE);
  assert.equal(await readPrice(`${PREFIX}ok30`), MIN_LISTING_PRICE, "boundary value stored exactly");

  await insertMaterial(`${PREFIX}ok120`, teacherId, 120);
  assert.equal(await readPrice(`${PREFIX}ok120`), 120, "value stored exactly, no normalisation");
});

// ─────────────────────────────────────────────────────────────────────────
// 3. 應用層 update 路徑（`COR-09` 的 raw-write 缺陷回歸）
// ─────────────────────────────────────────────────────────────────────────

test("COR-09 update path: rejects sub-minimum and fractional; accepts valid; preserves omitted", async (t) => {
  await cleanup();
  t.after(cleanup);

  const teacherId = `${PREFIX}teacher`;
  await insertTeacher(teacherId);

  const materialsRouter = require("../routes/materials");
  const layer = materialsRouter.stack.find(
    (l) => l.route && l.route.path === "/:id" && l.route.methods.patch
  );
  assert.ok(layer, "PATCH /:id route must exist");
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const user = { userId: teacherId, role: "teacher" };
  const mid = `${PREFIX}m1`;
  await insertMaterial(mid, teacherId, 120);

  const r29 = await callUpdate(handler, { id: mid, user, body: { price: 29 } });
  assert.equal(r29.status, 400, "29 must be rejected");
  assert.equal(r29.body.error, "price_below_minimum");
  assert.equal(await readPrice(mid), 120, "rejected update must not change stored price");

  const r305 = await callUpdate(handler, { id: mid, user, body: { price: 30.5 } });
  assert.equal(r305.status, 400, "30.5 must be rejected");
  assert.equal(r305.body.error, "price_not_integer");
  assert.equal(await readPrice(mid), 120, "30.5 must not reach storage");

  const r995 = await callUpdate(handler, { id: mid, user, body: { price: 99.5 } });
  assert.equal(r995.status, 400, "99.5 must be rejected");
  assert.equal(r995.body.error, "price_not_integer");
  assert.equal(await readPrice(mid), 120, "99.5 must not reach storage");

  const r30 = await callUpdate(handler, { id: mid, user, body: { price: MIN_LISTING_PRICE } });
  assert.equal(r30.status, 200, `${MIN_LISTING_PRICE} must be accepted`);
  assert.equal(await readPrice(mid), MIN_LISTING_PRICE, "accepted value stored exactly");

  const rOmit = await callUpdate(handler, { id: mid, user, body: { title: "renamed" } });
  assert.equal(rOmit.status, 200);
  assert.equal(await readPrice(mid), MIN_LISTING_PRICE, "omitted price must remain unchanged");

  // 無靜默正規化：被拒絕的值不得以任何形式落地。
  const before = await readPrice(mid);
  await callUpdate(handler, { id: mid, user, body: { price: 250.9 } });
  assert.equal(await readPrice(mid), before, "no silent floor/round/clamp on rejection");
});

// ─────────────────────────────────────────────────────────────────────────
// 4. 訂單路徑不再對上架價格做正規化
// ─────────────────────────────────────────────────────────────────────────

test("order path no longer normalises listing price, but keeps floorMoney for promo", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "services", "orderService.js"), "utf8");

  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.ok(
    !/floorMoney\(\s*row\.price\s*\)/.test(code),
    "listing-price flooring must be gone — DEC-34 forbids silent normalisation"
  );
  assert.ok(
    /floorMoney\(\s*promo\.value\s*\)/.test(code),
    "floorMoney must remain for promo handling — it is still in use there"
  );
  assert.ok(
    /function floorMoney\(/.test(code),
    "the floorMoney helper itself must not be deleted"
  );
});
