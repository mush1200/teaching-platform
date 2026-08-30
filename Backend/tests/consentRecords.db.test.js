/**
 * 同意證據基礎設施的資料庫測試（P1-09 Wave 1 #3 foundation — Gate 5）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是六條不變條件：
 *
 *   1. 同一份文件的不同版本可以區分，同一使用者可以分別留下記錄。
 *   2. 訂單層與教材層的 context 都能保存，且 context 與關聯 id 必須一致。
 *   3. **`accepted_at` 等既有事實不得被改寫**（H-VERSION）。
 *   4. 更正必須採 supersede（寫新記錄 ＋ 舊列指向它），不是改舊列。
 *   5. **沒有版本的「同意」不被接受** —— 不得預設、不得編造。
 *   6. **legacy 的 `materials.ip_declaration_*` 沒有被 backfill 進來。**
 *
 * 第 6 條特別重要：既有教材的聲明**沒有版本**（而且其值在建立時被寫死為 true），
 * 硬把它塞進本表並編一個 `v1` 會製造假的同意證據 —— 比沒有記錄更糟。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const consent = require("../services/consent.service");

/** 這些測試會寫入資料；跑錯資料庫是不可接受的。 */
test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], orders: [], materials: [], consents: [] };

async function makeUser(role = "buyer") {
  const id = `usr_cr_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_cr_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, 'published', NULL)`,
    [id, `同意測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

async function makeOrder(userId) {
  const id = `ord_cr_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 100, 100, 0)`,
    [id, userId]
  );
  created.orders.push(id);
  return id;
}

async function record(input) {
  const result = await consent.recordConsent(input);
  if (result.ok) created.consents.push(result.consent.id);
  return result;
}

test.after(async () => {
  try {
    // consent_records 對 users / orders / materials 都是 ON DELETE RESTRICT，
    // 所以必須先清同意記錄 —— 那正是「刪除前必須先做決定」的設計意圖。
    if (created.consents.length) {
      await db.query(`UPDATE consent_records SET superseded_by_id = NULL WHERE id = ANY($1)`, [
        created.consents,
      ]);
      await db.query(`DELETE FROM consent_records WHERE id = ANY($1)`, [created.consents]);
    }
    if (created.orders.length) {
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.materials.length) {
      await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("version: 同一份文件的不同版本可以分別留下記錄且可區分", async () => {
  const userId = await makeUser();

  const v1 = await record({
    userId,
    documentType: "terms_of_service",
    documentVersion: "1.0",
    contextType: "registration",
  });
  const v2 = await record({
    userId,
    documentType: "terms_of_service",
    documentVersion: "2.0",
    contextType: "reconsent",
  });
  assert.equal(v1.ok, true, JSON.stringify(v1));
  assert.equal(v2.ok, true, JSON.stringify(v2));

  const all = await consent.findConsents({ userId, documentType: "terms_of_service" });
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((r) => r.document_version).sort(),
    ["1.0", "2.0"],
    "必須能回答『使用者當時同意的是哪一版』"
  );

  const onlyV1 = await consent.findConsents({ userId, documentType: "terms_of_service", documentVersion: "1.0" });
  assert.equal(onlyV1.length, 1);
});

test("context: 訂單層與教材層的同意都能保存，且 context 與關聯必須一致", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  const orderId = await makeOrder(buyer);

  const material = await record({
    userId: teacher,
    documentType: "material_rights_declaration",
    documentVersion: "1.0",
    contextType: "material_declaration",
    materialId,
  });
  assert.equal(material.ok, true, JSON.stringify(material));
  assert.equal(material.consent.material_id, materialId);

  // Gate 13 未來要問的正是這個：這筆訂單有沒有取得該版本的解除權告知同意。
  const rescission = await record({
    userId: buyer,
    documentType: "digital_content_rescission_notice",
    documentVersion: "1.0",
    contextType: "checkout_rescission_notice",
    orderId,
  });
  assert.equal(rescission.ok, true, JSON.stringify(rescission));

  const byOrder = await consent.findConsents({ orderId });
  assert.equal(byOrder.length, 1);
  assert.equal(byOrder[0].context_type, "checkout_rescission_notice");
  assert.equal(byOrder[0].document_version, "1.0");

  // 教材層的同意沒有帶 materialId → service 先擋下。
  const missingLink = await consent.recordConsent({
    userId: teacher,
    documentType: "material_rights_declaration",
    documentVersion: "1.0",
    contextType: "material_declaration",
  });
  assert.equal(missingLink.ok, false);
  assert.equal(missingLink.code, "material_required");

  // 即使繞過 service，DB 的 CHECK 仍然擋得住。
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO consent_records(user_id, document_type, document_version, context_type)
         VALUES ($1, 'x', '1.0', 'material_declaration')`,
        [teacher]
      ),
    /consent_records_context_link_check/
  );
});

test("H-VERSION: 既有的同意事實不得被改寫", async () => {
  const userId = await makeUser();
  const r = await record({
    userId,
    documentType: "privacy_policy",
    documentVersion: "1.0",
    contextType: "registration",
  });
  assert.equal(r.ok, true);
  const id = r.consent.id;

  for (const [column, value] of [
    ["accepted_at", "TIMESTAMP '2020-01-01 00:00:00'"],
    ["document_version", "'9.9'"],
    ["document_type", "'something_else'"],
    ["context_type", "'reconsent'"],
  ]) {
    await assert.rejects(
      () => db.query(`UPDATE consent_records SET ${column} = ${value} WHERE id = $1`, [id]),
      /append-only/,
      `${column} 不得被改寫`
    );
  }

  // 原始事實完好無損。
  const { rows } = await db.query(`SELECT document_version, document_type FROM consent_records WHERE id = $1`, [id]);
  assert.equal(rows[0].document_version, "1.0");
  assert.equal(rows[0].document_type, "privacy_policy");
});

test("supersede: 更正是寫新記錄並讓舊列指向它，不是改舊列", async () => {
  const userId = await makeUser();
  const first = await record({
    userId,
    documentType: "creator_agreement",
    documentVersion: "1.0",
    contextType: "creator_agreement",
  });
  assert.equal(first.ok, true);

  const second = await consent.supersede(first.consent.id, {
    userId,
    documentType: "creator_agreement",
    documentVersion: "1.1",
    contextType: "reconsent",
  });
  assert.equal(second.ok, true, JSON.stringify(second));
  created.consents.push(second.consent.id);

  // 舊列的事實沒有被改動，只是多了一個指標。
  const { rows } = await db.query(
    `SELECT document_version, superseded_by_id FROM consent_records WHERE id = $1`,
    [first.consent.id]
  );
  assert.equal(rows[0].document_version, "1.0", "被取代不代表當初同意的內容被改掉");
  assert.equal(rows[0].superseded_by_id, second.consent.id);

  // 預設只回目前有效的那一筆；要完整歷程才傳 activeOnly: false。
  const active = await consent.findConsents({ userId, contextType: "creator_agreement" });
  assert.equal(active.length, 0, "已被取代的記錄不應出現在『目前有效』的查詢中");

  const history = await consent.findConsents({ userId, activeOnly: false });
  assert.equal(history.length, 2, "完整歷程必須看得到兩筆");

  // 同一筆不得被取代兩次。
  const again = await consent.supersede(first.consent.id, {
    userId,
    documentType: "creator_agreement",
    documentVersion: "1.2",
    contextType: "reconsent",
  });
  assert.equal(again.ok, false);
  assert.equal(again.code, "supersede_target_unavailable");
});

test("version: 沒有版本的同意不被接受 —— 不預設、不編造", async () => {
  const userId = await makeUser();

  for (const bad of [undefined, null, "", "   "]) {
    const r = await consent.recordConsent({
      userId,
      documentType: "terms_of_service",
      documentVersion: bad,
      contextType: "registration",
    });
    assert.equal(r.ok, false, `documentVersion=${JSON.stringify(bad)} 必須被拒絕`);
    assert.equal(r.code, "document_version_required");
  }

  // 即使繞過 service，DB 也擋得住空白版本。
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO consent_records(user_id, document_type, document_version, context_type)
         VALUES ($1, 'terms_of_service', '   ', 'registration')`,
        [userId]
      ),
    /consent_records_version_not_blank_check/
  );
});

test("legacy: 既有教材的 ip_declaration 沒有被 backfill 成假的同意記錄", async () => {
  // 全表檢查，不限本測試的 fixture。
  const { rows: legacy } = await db.query(
    `SELECT COUNT(*) AS n FROM materials WHERE ip_declaration_accepted = TRUE`
  );
  const { rows: migrated } = await db.query(
    `SELECT COUNT(*) AS n FROM consent_records WHERE context_type = 'material_declaration'
       AND material_id IN (SELECT id FROM materials WHERE ip_declaration_accepted = TRUE)
       AND id <> ALL($1::text[])`,
    [created.consents.length ? created.consents : [""]]
  );
  assert.ok(Number(legacy.rows === undefined ? legacy[0].n : legacy[0].n) >= 0);
  assert.equal(
    Number(migrated[0].n),
    0,
    "legacy 的無版本聲明不得被搬進 consent_records 並編造版本 —— 未知的版本就是未知"
  );

  // 且 legacy 欄位本身原地保留。
  const { rows: cols } = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'materials' AND column_name IN ('ip_declaration_accepted', 'ip_declaration_at')
      ORDER BY column_name`
  );
  assert.deepEqual(cols.map((c) => c.column_name), ["ip_declaration_accepted", "ip_declaration_at"]);
});

test("retention: 同意證據可以被刪除（保存期限屆滿），但不得被改寫", async () => {
  const userId = await makeUser();
  const r = await record({
    userId,
    documentType: "terms_of_service",
    documentVersion: "1.0",
    contextType: "registration",
  });
  assert.equal(r.ok, true);

  // 「不得改寫歷史」是 H-VERSION 的要求；「永不刪除」不是 ——
  // RETENTION-MATRIX RM-13 明訂同意證據有保存期限，期滿應刪除。
  const del = await db.query(`DELETE FROM consent_records WHERE id = $1 RETURNING id`, [r.consent.id]);
  assert.equal(del.rows.length, 1, "DELETE 必須是可行的，否則等於替尚未拍板的保存期限做了永久保存的決定");
  created.consents = created.consents.filter((x) => x !== r.consent.id);
});
