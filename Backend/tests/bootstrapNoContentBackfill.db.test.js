/**
 * `SEC-04` —— 真的跑一次 bootstrap，確認沒有封面的教材**維持 NULL**，既有合法封面**不被改動**。
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 * 每個 case 自己建立 fixture、自己清掉。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { ensureCoreTables } = require("../models/bootstrapModel");

const suffix = crypto.randomBytes(4).toString("hex");
const TEACHER_ID = `sec04_teacher_${suffix}`;
const NO_COVER_ID = `sec04_mat_nocover_${suffix}`;
const EMPTY_COVER_ID = `sec04_mat_emptycover_${suffix}`;
const OWN_COVER_ID = `sec04_mat_owncover_${suffix}`;
const OWN_COVER_URL = "https://example.org/own-cover.png";

test.before(async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB, "只允許在 security test 資料庫執行");
  await db.query(
    "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'x', 'teacher')",
    [TEACHER_ID, `${TEACHER_ID}@example.test`]
  );
  const insert = `INSERT INTO materials (id, title, price, teacher_id, status, cover_image_url)
                  VALUES ($1, $2, 100, $3, 'pending_review', $4)`;
  await db.query(insert, [NO_COVER_ID, "SEC-04 no cover", TEACHER_ID, null]);
  await db.query(insert, [EMPTY_COVER_ID, "SEC-04 empty cover", TEACHER_ID, ""]);
  await db.query(insert, [OWN_COVER_ID, "SEC-04 own cover", TEACHER_ID, OWN_COVER_URL]);
});

test.after(async () => {
  await db.query("DELETE FROM materials WHERE id = ANY($1)", [[NO_COVER_ID, EMPTY_COVER_ID, OWN_COVER_ID]]);
  await db.query("DELETE FROM users WHERE id = $1", [TEACHER_ID]);
  await db.pool.end();
});

test("bootstrap leaves missing covers untouched and preserves existing covers", async () => {
  await ensureCoreTables();
  const { rows } = await db.query(
    "SELECT id, cover_image_url FROM materials WHERE id = ANY($1)",
    [[NO_COVER_ID, EMPTY_COVER_ID, OWN_COVER_ID]]
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.cover_image_url]));
  assert.equal(byId[NO_COVER_ID], null, "NULL 封面必須維持 NULL");
  assert.equal(byId[EMPTY_COVER_ID], "", "空字串封面不得被補值");
  assert.equal(byId[OWN_COVER_ID], OWN_COVER_URL, "既有封面必須原封不動");
  for (const value of Object.values(byId)) {
    assert.equal(String(value ?? "").includes("picsum.photos"), false);
  }
});
