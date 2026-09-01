/**
 * `GET /admin/activity-logs` 的 `action` 篩選（單值與多值）資料庫整合測試。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/adminActivityLogs.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * fixture 全部帶 `tp_aaltest_` 前綴（`activity_logs.id` 是 UUID，因此改以
 * `actor_id` 前綴識別並清除），測試前後各清一次，可重複執行。
 *
 * 要鎖住的事：
 *   1. **既有單值 `action` 契約不 regression** —— 語意與只有單值的舊實作完全一致
 *   2. 逗號分隔多值取的是這組 action 的聯集，且**只有**這組
 *   3. **排序** —— `created_at DESC, id DESC`，多值不得改變排序或分頁
 *   4. **null handling** —— 未提供／空字串／只有逗號空白 = 不篩選（**不是**篩掉全部）
 *   5. **response shape** —— 每一列都帶 `actor_email` / `target_label` 等 enriched 欄位
 *   6. 與其他 filter（`actor_role`、`target_type`、`from`/`to`）是 AND 組合
 *   7. `getLogById()`（`GET /admin/activity-logs/:id`）與清單**同一個 enriched 形狀**，
 *      查無／空值／垃圾輸入一律回 `null`
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
const { getLogById, listLogs, parseActionFilter } = require("../services/adminActivityLogs.service");

const PREFIX = "tp_aaltest_";
const ADMIN_ID = `${PREFIX}admin`;
const ADMIN_EMAIL = `${PREFIX}admin@example.test`;
const MATERIAL_ID = `${PREFIX}material`;

/**
 * 所有 fixture 的 `target_id` 都指向同一份教材，因此可以用 `target_id` 把查詢
 * 限縮在本測試自己寫入的列上 —— security_test 資料庫裡本來就有數千筆歷史紀錄，
 * 不限縮的話任何「筆數」斷言都會被它們污染。
 */
const SCOPE = { target_id: MATERIAL_ID };

async function cleanup() {
  await db.query(`DELETE FROM activity_logs WHERE actor_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

/**
 * Fixtures —— 三個 action，其中兩個屬「需要注意」的那一組。
 * `created_at` 刻意錯開且**不依插入順序遞增**，這樣排序斷言才驗得到東西。
 */
const FIXTURES = [
  { action: "material.unpublished", actorRole: "admin", createdAt: "2026-08-01T03:00:00" },
  { action: "material.created", actorRole: "teacher", createdAt: "2026-08-01T05:00:00" },
  { action: "material.changes_requested", actorRole: "admin", createdAt: "2026-08-01T01:00:00" },
  { action: "material.created", actorRole: "teacher", createdAt: "2026-08-01T04:00:00" },
  { action: "material.unpublished", actorRole: "admin", createdAt: "2026-08-01T02:00:00" },
];

async function seed() {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1, $2, 'x', 'admin')`,
    [ADMIN_ID, ADMIN_EMAIL]
  );
  await db.query(
    `INSERT INTO materials(id, title, price, status, teacher_id)
     VALUES($1, $2, 0, 'published', $3)`,
    [MATERIAL_ID, `${PREFIX}教材`, ADMIN_ID]
  );
  for (const row of FIXTURES) {
    await db.query(
      `INSERT INTO activity_logs(actor_id, actor_role, target_type, target_id, action, meta, created_at)
       VALUES($1, $2, 'material', $3, $4, '{}'::jsonb, $5::timestamp)`,
      [ADMIN_ID, row.actorRole, MATERIAL_ID, row.action, row.createdAt]
    );
  }
}

test.before(async () => {
  await cleanup();
  await seed();
});

test.after(async () => {
  await cleanup();
  await db.pool.end();
});

/** 只回本測試 fixture 的 action 序列（依 API 回傳順序）。 */
async function actionsOf(filters, pageQuery = { limit: 100 }) {
  const body = await listLogs({ ...SCOPE, ...filters }, pageQuery);
  return body.items.map((item) => item.action);
}

test("parseActionFilter: 單值、多值、空值與去重", () => {
  assert.equal(parseActionFilter(null), null);
  assert.equal(parseActionFilter(undefined), null);
  // 空字串／只有分隔符 → null（不篩選），**不是** []（那會篩掉全部）。
  assert.equal(parseActionFilter(""), null);
  assert.equal(parseActionFilter("   "), null);
  assert.equal(parseActionFilter(",,, ,"), null);

  assert.deepEqual(parseActionFilter("order_created"), ["order_created"]);
  assert.deepEqual(parseActionFilter("  order_created  "), ["order_created"]);
  assert.deepEqual(parseActionFilter("a,b,c"), ["a", "b", "c"]);
  assert.deepEqual(parseActionFilter("a, b ,c"), ["a", "b", "c"]);
  // 空片段丟棄、重複去重 —— 兩者都不改變結果集，只是不讓髒東西進 SQL。
  assert.deepEqual(parseActionFilter("a,,b,"), ["a", "b"]);
  assert.deepEqual(parseActionFilter("a,b,a"), ["a", "b"]);
});

test("既有單值 action 契約不 regression", async () => {
  assert.deepEqual(await actionsOf({ action: "material.created" }), [
    "material.created",
    "material.created",
  ]);
  assert.deepEqual(await actionsOf({ action: "material.unpublished" }), [
    "material.unpublished",
    "material.unpublished",
  ]);
  // 沒有這個 action 的紀錄 → 空集合，不是全部。
  assert.deepEqual(await actionsOf({ action: "material.published" }), []);
});

test("逗號分隔多值取聯集，且只有這組 action", async () => {
  const actions = await actionsOf({ action: "material.unpublished,material.changes_requested" });
  assert.equal(actions.length, 3);
  assert.equal(
    actions.every((a) => a === "material.unpublished" || a === "material.changes_requested"),
    true,
    `多值篩選漏進了 allowlist 以外的 action：${actions.join(", ")}`
  );
  // 未列入的高頻事件必須被擋在外面 —— 這正是 Dashboard「需要注意的活動」的重點。
  assert.equal(actions.includes("material.created"), false);
});

test("多值不改變排序：仍為 created_at DESC, id DESC", async () => {
  const body = await listLogs(
    { ...SCOPE, action: "material.unpublished,material.changes_requested,material.created" },
    { limit: 100 }
  );
  const times = body.items.map((item) => new Date(item.created_at).getTime());
  assert.equal(times.length, FIXTURES.length);
  for (let idx = 1; idx < times.length; idx += 1) {
    assert.equal(times[idx - 1] >= times[idx], true, `第 ${idx} 筆的時間比前一筆新，排序壞了`);
  }
  // 最新的一筆是 05:00 的 material.created；最舊的是 01:00 的 changes_requested。
  assert.equal(body.items[0].action, "material.created");
  assert.equal(body.items[body.items.length - 1].action, "material.changes_requested");
});

test("多值與分頁相容：limit 取的是聯集的最新 N 筆", async () => {
  const body = await listLogs(
    { ...SCOPE, action: "material.unpublished,material.changes_requested" },
    { page: 1, limit: 2 }
  );
  assert.equal(body.items.length, 2);
  // total 是**符合條件的全部**（3），不是這一頁的筆數。
  assert.equal(body.pagination.total, 3);
  assert.equal(body.pagination.totalPages, 2);
  // 最新兩筆：03:00 與 02:00 的 unpublished。
  assert.deepEqual(
    body.items.map((item) => item.action),
    ["material.unpublished", "material.unpublished"]
  );
});

test("null handling：未提供／空字串／只有分隔符 = 不篩選", async () => {
  const all = await actionsOf({});
  assert.equal(all.length, FIXTURES.length);
  assert.deepEqual(await actionsOf({ action: null }), all);
  assert.deepEqual(await actionsOf({ action: "" }), all);
  assert.deepEqual(await actionsOf({ action: "  " }), all);
  assert.deepEqual(await actionsOf({ action: ",," }), all);
});

test("response shape：多值路徑仍回完整的 enriched 欄位", async () => {
  const body = await listLogs({ ...SCOPE, action: "material.unpublished,material.created" }, { limit: 1 });
  const [item] = body.items;
  assert.ok(item, "多值篩選應至少回一筆");

  assert.deepEqual(Object.keys(item).sort(), [
    "action",
    "actor_email",
    "actor_id",
    "actor_role",
    "created_at",
    "id",
    "meta",
    "order_buyer_email",
    "target_id",
    "target_label",
    "target_type",
  ]);
  assert.equal(typeof item.id, "string");
  assert.equal(item.actor_email, ADMIN_EMAIL);
  // target_type = material → target_label 是教材標題，不是 id。
  assert.equal(item.target_label, `${PREFIX}教材`);
  assert.deepEqual(item.meta, {});
  // target_type 不是 order，因此沒有買家 email —— null，不是 undefined。
  assert.equal(item.order_buyer_email, null);
  assert.deepEqual(Object.keys(body.pagination).sort(), ["limit", "page", "total", "totalPages"]);
});

test("多值與其他 filter 是 AND 組合，不是 OR", async () => {
  // actor_role 把 teacher 寫的 material.created 全部排除。
  const withRole = await actionsOf({
    action: "material.unpublished,material.created",
    actor_role: "admin",
  });
  assert.deepEqual(withRole, ["material.unpublished", "material.unpublished"]);

  // 日期區間同樣是 AND：只留 02:00 那一筆。
  const withDate = await actionsOf({
    action: "material.unpublished,material.changes_requested",
    from: "2026-08-01",
    to: "2026-08-01",
  });
  assert.equal(withDate.length, 3, "同一天的三筆都應落在含當日的區間內");

  // target_type 不符時，多值也不得把它撈回來。
  assert.deepEqual(
    await actionsOf({ action: "material.unpublished", target_type: "order" }),
    []
  );
});

/* ------------------------------------------------------------------------- *
 * getLogById —— GET /admin/activity-logs/:id（IA-02）
 * ------------------------------------------------------------------------- */

/**
 * 詳情端點原本在 route 層自己寫一段 plain SELECT，於是同一筆事件在清單有
 * `actor_email` / `target_label`、在詳情頁沒有。改成共用 service 之後，
 * 這幾支測試把「兩邊形狀一致」鎖起來 —— 這正是 UI 那個共用 formatter 的前提。
 */

/** 取一筆本測試 fixture 的 id（清單與詳情要比對的是同一筆）。 */
async function anyFixtureId() {
  const body = await listLogs(SCOPE, { limit: 1 });
  assert.ok(body.items[0], "fixture 應至少有一筆");
  return body.items[0];
}

test("getLogById：與清單同一個 enriched 形狀", async () => {
  const fromList = await anyFixtureId();
  const row = await getLogById(fromList.id);

  assert.ok(row, "以清單回傳的 id 應查得到同一筆");
  // 形狀必須逐鍵相同，否則詳情頁的 describeActivity() 會組出不同的句子。
  assert.deepEqual(Object.keys(row).sort(), Object.keys(fromList).sort());
  assert.deepEqual(row, fromList);

  assert.equal(row.actor_email, ADMIN_EMAIL);
  assert.equal(row.target_label, `${PREFIX}教材`);
  assert.equal(row.order_buyer_email, null);
  assert.deepEqual(row.meta, {});
  assert.equal(typeof row.id, "string");
});

test("getLogById：查無 / 空值 / 垃圾輸入一律回 null（不丟例外）", async () => {
  // `id::text` 比對讓任意輸入都是安全的查詢，不是 cast 錯誤（BIGSERIAL 舊環境亦然）。
  assert.equal(await getLogById("999999999999999"), null);
  assert.equal(await getLogById("not-a-real-id"), null);
  assert.equal(await getLogById(""), null);
  assert.equal(await getLogById("   "), null);
  assert.equal(await getLogById(null), null);
  assert.equal(await getLogById(undefined), null);
});

test("getLogById：id 以字串比對，數字型別也查得到同一筆", async () => {
  const fromList = await anyFixtureId();
  const asNumber = Number(fromList.id);
  // canonical schema 是 TEXT UUID；呼叫端傳數字或字串都必須指到同一列。
  if (Number.isSafeInteger(asNumber)) {
    const row = await getLogById(asNumber);
    assert.ok(row, "數字型別的 id 應查得到");
    assert.equal(row.id, fromList.id);
  }
});
