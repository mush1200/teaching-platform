/**
 * 帳號凍結能力的資料庫測試（P1-09 Wave 1 #4 foundation — Gate 1）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是六條不變條件：
 *
 *   1. migration 後既有使用者全部維持 `active` —— 沒有帳號被誤凍結。
 *   2. 稽核欄位對既有列為 NULL —— 沒有假造的凍結事件。
 *   3. `account_status` 只接受兩個值。
 *   4. **凍結的帳號無法通過 `requireActiveAccount`，且 active 帳號行為完全不變。**
 *   5. 解凍後權限恢復，但**凍結的稽核軌跡仍然保留**。
 *   6. 帳號凍結與 `orders.status` 正交 —— 凍結不改動任何訂單狀態。
 *
 * 第 4 條直接跑 middleware，而不是只檢查欄位：
 * 「只在前端 disable 按鈕」正是這個 Gate 要防的失敗模式，
 * 所以驗收必須發生在 backend authorization 層。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { requireActiveAccount } = require("../middlewares/accountStatus");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], orders: [] };

async function makeUser(role = "buyer") {
  const id = `usr_af_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

/** 直接跑中介層，回傳 `{ status, body, passed }`。 */
function runMiddleware(userId) {
  return new Promise((resolve) => {
    const req = { user: userId ? { userId, role: "parent" } : undefined };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body, passed: false });
        return this;
      },
    };
    requireActiveAccount(req, res, () => resolve({ status: 200, body: null, passed: true }));
  });
}

test.after(async () => {
  try {
    if (created.orders.length) {
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.users.length) {
      // frozen_by / unfrozen_by 是自我參照的 FK；先清掉指標再刪列。
      await db.query(
        `UPDATE users SET frozen_by = NULL, unfrozen_by = NULL WHERE id = ANY($1) OR frozen_by = ANY($1) OR unfrozen_by = ANY($1)`,
        [created.users]
      );
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("migration: 既有使用者全部維持 active，且沒有假造的凍結稽核", async () => {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE account_status = 'active') AS active_rows,
            COUNT(frozen_at)  AS with_frozen_at,
            COUNT(frozen_by)  AS with_frozen_by
       FROM users`
  );
  const r = rows[0];
  assert.equal(r.total, r.active_rows, "migration 後不得有任何帳號被誤凍結");
  assert.equal(Number(r.with_frozen_at), 0, "不得 backfill 沒發生過的凍結時間");
  assert.equal(Number(r.with_frozen_by), 0);
});

test("schema: account_status 只接受 active / frozen", async () => {
  const userId = await makeUser();
  await assert.rejects(
    () => db.query(`UPDATE users SET account_status = 'deleted' WHERE id = $1`, [userId]),
    /users_account_status_check/
  );
});

test("enforcement: active 帳號通過；frozen 帳號在 backend 被擋下（不是只擋前端）", async () => {
  const userId = await makeUser();

  const before = await runMiddleware(userId);
  assert.equal(before.passed, true, "active 帳號的行為必須完全不變");

  await db.query(
    `UPDATE users SET account_status = 'frozen', frozen_at = NOW(), freeze_reason = 'db test' WHERE id = $1`,
    [userId]
  );

  const after = await runMiddleware(userId);
  assert.equal(after.passed, false, "frozen 帳號不得通過敏感寫入的授權閘門");
  assert.equal(after.status, 403);
  assert.equal(after.body.code, "account_frozen");
});

test("enforcement: fail-closed —— token 有效但使用者不存在時不得放行", async () => {
  const result = await runMiddleware(`usr_af_ghost_${uniqueSuffix()}`);
  assert.equal(result.passed, false);
  assert.equal(result.status, 401);
});

test("unfreeze: 權限恢復，但凍結的稽核軌跡仍然保留", async () => {
  const admin = await makeUser("admin");
  const userId = await makeUser();

  await db.query(
    `UPDATE users SET account_status = 'frozen', frozen_at = NOW(), frozen_by = $2, freeze_reason = '疑似遭冒用'
      WHERE id = $1`,
    [userId, admin]
  );
  assert.equal((await runMiddleware(userId)).passed, false);

  await db.query(
    `UPDATE users SET account_status = 'active', unfrozen_at = NOW(), unfrozen_by = $2 WHERE id = $1`,
    [userId, admin]
  );

  assert.equal((await runMiddleware(userId)).passed, true, "解凍後權限必須恢復");

  const { rows } = await db.query(
    `SELECT frozen_at, frozen_by, freeze_reason, unfrozen_at FROM users WHERE id = $1`,
    [userId]
  );
  assert.ok(rows[0].frozen_at, "解凍不得抹去『曾經被凍結』的事實");
  assert.equal(rows[0].frozen_by, admin);
  assert.equal(rows[0].freeze_reason, "疑似遭冒用");
  assert.ok(rows[0].unfrozen_at);
});

test("orthogonality: 凍結帳號不改動任何訂單狀態", async () => {
  const userId = await makeUser();
  const orderId = `ord_af_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 100, 100, 0)`,
    [orderId, userId]
  );
  created.orders.push(orderId);

  await db.query(
    `UPDATE users SET account_status = 'frozen', frozen_at = NOW(), freeze_reason = 'db test' WHERE id = $1`,
    [userId]
  );

  const { rows } = await db.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
  assert.equal(
    rows[0].status,
    "pending_payment",
    "帳號凍結與訂單狀態機正交 —— 不得以 orders.status 代替帳號凍結"
  );
});
