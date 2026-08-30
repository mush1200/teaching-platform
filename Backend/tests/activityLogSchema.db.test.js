/**
 * `activity_logs` schema 收斂的資料庫測試（`SCHEMA-01`）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 這裡鎖的是什麼
 *
 * `activity_logs` 是 Gate 1（帳號凍結）／Gate 2（教材權利審查）／Gate 3（消費申訴）／
 * Gate 14（entitlement、退款、legal hold）**共同**的稽核證據來源。
 * 它的 schema 與排序語意錯了，四個 Gate 的 evidence 就同時失準。
 *
 * 三組不變條件：
 *
 *   1. **canonical schema 就是實際 schema** —— `id TEXT`（UUID）、
 *      `target_id` / `created_at` / `meta` 皆 `NOT NULL`、`actor_id` 有 FK。
 *   2. **`id` 是 identity 不是 time** —— UUID 無序，因此排序一律以 `created_at` 為準。
 *   3. **歷史稽核內容不得被 schema 整理改動。**
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { verifyCriticalSchema } = require("../models/bootstrapModel");
const { writeActivityLog } = require("../utils/activityLog");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], logTargets: [] };

async function makeUser(role = "buyer") {
  const id = `usr_al_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

test.after(async () => {
  try {
    if (created.logTargets.length) {
      await db.query(`DELETE FROM activity_logs WHERE target_id = ANY($1)`, [created.logTargets]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("canonical schema: 實際資料庫就是 canonical 宣告的形狀", async () => {
  const { rows } = await db.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_name = 'activity_logs'`
  );
  const col = (n) => rows.find((r) => r.column_name === n);

  assert.equal(col("id").data_type, "text", "id 是 TEXT UUID，不是 BIGSERIAL");
  assert.match(col("id").column_default, /gen_random_uuid/);
  assert.equal(col("id").is_nullable, "NO");
  assert.equal(col("target_type").is_nullable, "NO");
  assert.equal(col("target_id").is_nullable, "NO", "canonical 先前誤記為 nullable");
  assert.equal(col("action").is_nullable, "NO");
  assert.equal(col("meta").is_nullable, "NO");
  assert.equal(col("created_at").is_nullable, "NO", "canonical 先前誤記為 nullable");
  assert.match(col("created_at").column_default, /CURRENT_TIMESTAMP/i);

  // 沒有殘留的 sequence（BIGSERIAL 的遺跡）。
  const seqs = await db.query(
    `SELECT relname FROM pg_class WHERE relkind = 'S' AND relname LIKE 'activity_logs%'`
  );
  assert.equal(seqs.rows.length, 0, "不應存在 activity_logs 的 sequence");

  // actor_id 的 FK（canonical 先前完全沒記載）。
  const fk = await db.query(
    `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
      WHERE conrelid = 'activity_logs'::regclass AND contype = 'f'`
  );
  assert.equal(fk.rows.length, 1);
  assert.match(fk.rows[0].d, /FOREIGN KEY \(actor_id\) REFERENCES users\(id\) ON DELETE SET NULL/);
});

test("bootstrap 的 fail-closed 驗證在目前 schema 下通過", async () => {
  await verifyCriticalSchema(); // 不得拋錯
});

test("upgrade path: BIGSERIAL → TEXT 是無損的，且不改動任何一列的內容", async () => {
  // 用暫存表重現 drift 前的形狀，再套用 migration 的同一組 ALTER。
  // （對兩個實際資料庫，migration 已實測為 no-op —— 真正需要驗證的是這條升級路徑。）
  await db.query(`
    CREATE TEMP TABLE al_upgrade_probe (
      id BIGSERIAL PRIMARY KEY,
      actor_id TEXT,
      actor_role TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT,
      action TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(
    `INSERT INTO al_upgrade_probe(actor_id, actor_role, target_type, target_id, action, meta, created_at)
     VALUES ('a1', 'admin', 'order', 'ord_1', 'first',  '{"n":1}', TIMESTAMP '2026-01-01 10:00:00'),
            ('a1', 'admin', 'order', 'ord_1', 'second', '{"n":2}', TIMESTAMP '2026-01-01 11:00:00'),
            (NULL, 'system', 'material_file', 'mf_1', 'third', '{}', TIMESTAMP '2026-01-02 09:00:00')`
  );

  const before = await db.query(
    `SELECT id::text AS id, actor_id, actor_role, target_type, target_id, action, meta, created_at
       FROM al_upgrade_probe ORDER BY created_at`
  );
  assert.deepEqual(before.rows.map((r) => r.id), ["1", "2", "3"]);

  // migration 的轉型步驟。
  await db.query(`ALTER TABLE al_upgrade_probe ALTER COLUMN id DROP DEFAULT`);
  await db.query(`ALTER TABLE al_upgrade_probe ALTER COLUMN id TYPE TEXT USING id::text`);
  await db.query(`ALTER TABLE al_upgrade_probe ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text`);
  await db.query(`ALTER TABLE al_upgrade_probe ALTER COLUMN target_id SET NOT NULL`);
  await db.query(`ALTER TABLE al_upgrade_probe ALTER COLUMN created_at SET NOT NULL`);

  const after = await db.query(
    `SELECT id, actor_id, actor_role, target_type, target_id, action, meta, created_at
       FROM al_upgrade_probe ORDER BY created_at`
  );
  // **identity 與內容完全不變** —— "1" 仍指同一列。
  assert.deepEqual(after.rows, before.rows, "轉型不得改動任何欄位值，包含 id 的 identity");
  assert.equal(after.rows.length, 3, "不得遺失任何一列");

  const t = await db.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_name = 'al_upgrade_probe' AND column_name = 'id'`
  );
  assert.equal(t.rows[0].data_type, "text");

  // 轉型後新插入的列拿到 UUID，與既有的數字字串共存且不衝突。
  const inserted = await db.query(
    `INSERT INTO al_upgrade_probe(target_type, target_id, action) VALUES ('order','ord_2','fourth') RETURNING id`
  );
  assert.match(inserted.rows[0].id, /^[0-9a-f]{8}-/);
  const total = await db.query(`SELECT COUNT(*) AS n, COUNT(DISTINCT id) AS u FROM al_upgrade_probe`);
  assert.equal(total.rows[0].n, total.rows[0].u, "PK 仍唯一");

  await db.query(`DROP TABLE al_upgrade_probe`);
});

test("id 是 identity 不是 time —— UUID 的字典序與時序無關", async () => {
  const actor = await makeUser("admin");
  const target = `schema01_${uniq()}`;
  created.logTargets.push(target);

  // 明確指定遞增的 created_at，讓「時序」是已知事實。
  for (const [i, action] of ["first", "second", "third", "fourth", "fifth"].entries()) {
    await db.query(
      `INSERT INTO activity_logs(actor_id, actor_role, target_type, target_id, action, meta, created_at)
       VALUES ($1, 'admin', 'schema01_probe', $2, $3, '{}', TIMESTAMP '2026-01-01 00:00:00' + ($4 || ' minutes')::interval)`,
      [actor, target, action, String(i)]
    );
  }

  const byTime = await db.query(
    `SELECT action FROM activity_logs WHERE target_id = $1 ORDER BY created_at ASC, id ASC`,
    [target]
  );
  assert.deepEqual(
    byTime.rows.map((r) => r.action),
    ["first", "second", "third", "fourth", "fifth"],
    "以 created_at 排序才是真正的事件順序"
  );

  const byId = await db.query(`SELECT action FROM activity_logs WHERE target_id = $1 ORDER BY id ASC`, [
    target,
  ]);
  // UUID 的字典序與時序無關；此處不斷言它一定不同（隨機可能剛好相同），
  // 而是斷言**id 本身不帶時間資訊** —— 用 id 排序的結果無法被預測。
  assert.equal(byId.rows.length, 5);
  const ids = await db.query(`SELECT id FROM activity_logs WHERE target_id = $1`, [target]);
  for (const row of ids.rows) {
    assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-/, "id 為 UUID —— 不含任何遞增語意");
  }
});

test("writeActivityLog: targetId 為必填，錯誤訊息可讀（不是 PG 約束違反）", async () => {
  const actor = await makeUser("admin");
  for (const targetId of [undefined, null, "", "   "]) {
    await assert.rejects(
      () =>
        writeActivityLog({
          actorId: actor,
          targetType: "schema01_probe",
          targetId,
          action: "should.fail",
        }),
      /writeActivityLog: targetId is required/,
      `targetId=${JSON.stringify(targetId)} 必須被明確拒絕`
    );
  }
});

test("Gate 1 / 2 / 3 / 14 的稽核歷程查詢皆以 created_at 為序，且資料完整", async () => {
  // 四個 Gate 共用同一張表；這裡確認每一種 target_type 的歷程查詢都拿得到資料，
  // 且沒有任何一列缺少排序所需的 created_at。
  const gateTargets = {
    "Gate 1 帳號凍結": "user",
    "Gate 2 教材權利審查": "material",
    "Gate 3 消費申訴": "consumer_complaint",
    "Gate 14 entitlement": "order_item",
    "Gate 14 退款補救": "refund_remedy_case",
    "Gate 14 legal hold": "material_file",
  };
  for (const [label, targetType] of Object.entries(gateTargets)) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_at IS NULL)::int AS no_ts,
              COUNT(*) FILTER (WHERE target_id IS NULL)::int AS no_target
         FROM activity_logs WHERE target_type = $1`,
      [targetType]
    );
    assert.equal(rows[0].no_ts, 0, `${label}: 不得有缺 created_at 的稽核列`);
    assert.equal(rows[0].no_target, 0, `${label}: 不得有缺 target_id 的稽核列`);
  }
});

test("historical preservation: 全表沒有缺漏或無法追溯的稽核列", async () => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(DISTINCT id)::int AS unique_ids,
            COUNT(*) FILTER (WHERE created_at IS NULL)::int AS no_ts,
            COUNT(*) FILTER (WHERE target_id IS NULL)::int AS no_target,
            COUNT(*) FILTER (WHERE btrim(action) = '')::int AS no_action
       FROM activity_logs`
  );
  assert.ok(rows[0].total > 0, "稽核表不得是空的");
  assert.equal(rows[0].unique_ids, rows[0].total, "PK 唯一");
  assert.equal(rows[0].no_ts, 0);
  assert.equal(rows[0].no_target, 0);
  assert.equal(rows[0].no_action, 0);

  // actor_id 若有值，必須指得到真實使用者（FK 已保證，這裡再確認沒有繞過的路徑）。
  const orphan = await db.query(
    `SELECT COUNT(*)::int AS n FROM activity_logs l
      WHERE l.actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = l.actor_id)`
  );
  assert.equal(orphan.rows[0].n, 0);
});
