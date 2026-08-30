/**
 * 履約版本快照寫入路徑的資料庫測試（P1-09 Wave 2 #1 — Gate 7 / PRE-04.1）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是七條不變條件：
 *
 *   1. 付款核准時會保存履約版本，且與**當下** `materials.approved_file_id` 一致。
 *   2. Creator 後續換版**不得改寫**既有履約快照 —— 那是歷史事實。
 *   3. 一張訂單多個品項時，各自對應各自教材的版本。
 *   4. 教材沒有已核准檔案時**不產生虛假快照**（保持 NULL）。
 *   5. 重複執行不覆寫（只寫一次）。
 *   6. transaction rollback 不留下半完成的履約狀態。
 *   7. `entitlement_status`、`orders.status`、`paid_at` 皆未被本流程改動。
 *
 * 第 2 條是本輪的核心：目前下載路徑仍動態解析最新 `approved_file_id`
 * （那是 `PRE-04.7` / `L-10` 的待決政策），
 * 但**「當初交付了什麼」必須先被記下來**，否則日後無論政策怎麼定都無從還原。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { recordFulfillmentSnapshot } = require("../services/orderService");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], materials: [], orders: [], files: [] };

async function makeUser(role = "buyer") {
  const id = `usr_fs_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_fs_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, 'published', NULL)`,
    [id, `履約快照測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

/** 建立一個已核准的檔案版本並指定為該教材的 approved_file_id。 */
async function attachApprovedFile(materialId, uploadedBy) {
  const fileId = `mf_fs_${uniqueSuffix()}`;
  // 順序與正式 promotion 一致：**先**把舊 approved 降級為 superseded，
  // 再插入新的 approved —— schema 有 `uq_material_files_one_approved`
  // 保證一份教材同時只有一個 approved 檔。
  await db.query(
    `UPDATE material_files SET status = 'superseded'
      WHERE material_id = $1 AND status = 'approved'`,
    [materialId]
  );
  await db.query(
    `INSERT INTO material_files(id, material_id, storage_key, original_filename, mime_type,
                                size_bytes, status, uploaded_by, approved_at)
     VALUES ($1, $2, $3, '教材.pdf', 'application/pdf', 1024, 'approved', $4, NOW())`,
    [fileId, materialId, `material-files/${fileId}`, uploadedBy]
  );
  created.files.push(fileId);
  await db.query(`UPDATE materials SET approved_file_id = $2 WHERE id = $1`, [materialId, fileId]);
  return fileId;
}

/** 建立一筆待付款訂單（可含多個品項）。 */
async function makePendingOrder(buyerId, materialIds) {
  const orderId = `ord_fs_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 100, 100, 0)`,
    [orderId, buyerId]
  );
  created.orders.push(orderId);
  for (const materialId of materialIds) {
    await db.query(
      `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, subtotal)
       VALUES ($1, $2, $3, 'fixture', 100, 1, 100)`,
      [`oi_fs_${uniqueSuffix()}`, orderId, materialId]
    );
  }
  return orderId;
}

/** 模擬付款核准交易：核准訂單 ＋ 記錄履約快照（與正式流程同一個 transaction）。 */
async function approveOrder(orderId, { fail = false } = {}) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE orders SET status = 'approved', paid_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending_payment'`,
      [orderId]
    );
    const result = await recordFulfillmentSnapshot(client, orderId);
    if (fail) {
      await client.query("ROLLBACK");
      return { rolledBack: true, ...result };
    }
    await client.query("COMMIT");
    return { rolledBack: false, ...result };
  } finally {
    client.release();
  }
}

async function itemsOf(orderId) {
  const { rows } = await db.query(
    `SELECT material_id, fulfilled_material_version_id, fulfilled_at, entitlement_status
       FROM order_items WHERE order_id = $1 ORDER BY material_id`,
    [orderId]
  );
  return rows;
}

test.after(async () => {
  try {
    if (created.orders.length) {
      await db.query(
        `UPDATE order_items SET fulfilled_material_version_id = NULL WHERE order_id = ANY($1)`,
        [created.orders]
      );
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.materials.length) {
      await db.query(`UPDATE materials SET approved_file_id = NULL WHERE id = ANY($1)`, [created.materials]);
      await db.query(`DELETE FROM material_files WHERE material_id = ANY($1)`, [created.materials]);
      await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM material_files WHERE uploaded_by = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("snapshot: 核准時保存履約版本，且與當下 approved_file_id 一致", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  const v1 = await attachApprovedFile(materialId, teacher);
  const orderId = await makePendingOrder(buyer, [materialId]);

  const before = await itemsOf(orderId);
  assert.equal(before[0].fulfilled_material_version_id, null, "核准前不得有履約版本");

  const result = await approveOrder(orderId);
  assert.equal(result.snapshotted, 1);

  const after = await itemsOf(orderId);
  assert.equal(after[0].fulfilled_material_version_id, v1, "必須等於核准當下的 approved_file_id");
  assert.ok(after[0].fulfilled_at);
  assert.equal(after[0].entitlement_status, "active", "entitlement_status 不得被本流程改動");
});

test("immutability: Creator 後續換版不得改寫既有履約快照", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  const v1 = await attachApprovedFile(materialId, teacher);
  const orderId = await makePendingOrder(buyer, [materialId]);
  await approveOrder(orderId);

  // Creator 上傳新版並經核准 —— 教材的 approved_file_id 換了。
  const v2 = await attachApprovedFile(materialId, teacher);
  assert.notEqual(v1, v2);
  const { rows: m } = await db.query(`SELECT approved_file_id FROM materials WHERE id = $1`, [materialId]);
  assert.equal(m[0].approved_file_id, v2, "教材已指向新版");

  const after = await itemsOf(orderId);
  assert.equal(
    after[0].fulfilled_material_version_id,
    v1,
    "履約快照是歷史事實 —— 不得因教材換版而被改寫"
  );

  // 再次執行也不覆寫（只寫一次）。
  const again = await approveOrder(orderId);
  assert.equal(again.snapshotted, 0, "已有快照的品項不得被重寫");
  assert.equal((await itemsOf(orderId))[0].fulfilled_material_version_id, v1);
});

test("multi-item: 一張訂單多個品項各自對應各自教材的版本", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const matA = await makeMaterial(teacher);
  const matB = await makeMaterial(teacher);
  const fileA = await attachApprovedFile(matA, teacher);
  const fileB = await attachApprovedFile(matB, teacher);
  const orderId = await makePendingOrder(buyer, [matA, matB]);

  const result = await approveOrder(orderId);
  assert.equal(result.snapshotted, 2);

  const rows = await itemsOf(orderId);
  const byMaterial = Object.fromEntries(rows.map((r) => [r.material_id, r.fulfilled_material_version_id]));
  assert.equal(byMaterial[matA], fileA);
  assert.equal(byMaterial[matB], fileB);
  assert.notEqual(byMaterial[matA], byMaterial[matB]);
});

test("no approved file: 不產生虛假快照，保持 NULL", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  // legacy 情境：教材 published 但沒有 approved_file_id。
  const materialId = await makeMaterial(teacher);
  const orderId = await makePendingOrder(buyer, [materialId]);

  const result = await approveOrder(orderId);
  assert.equal(result.snapshotted, 0, "沒有已核准檔案就不寫入");

  const rows = await itemsOf(orderId);
  assert.equal(
    rows[0].fulfilled_material_version_id,
    null,
    "猜一個版本等於製造假的履約證據 —— 未知就是未知"
  );
  assert.equal(rows[0].fulfilled_at, null);

  // 訂單本身仍然核准成功（不因無檔而擋下既有流程）。
  const { rows: o } = await db.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
  assert.equal(o[0].status, "approved");
});

test("rollback: transaction 失敗不留下半完成的履約狀態", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  await attachApprovedFile(materialId, teacher);
  const orderId = await makePendingOrder(buyer, [materialId]);

  const result = await approveOrder(orderId, { fail: true });
  assert.equal(result.rolledBack, true);

  const rows = await itemsOf(orderId);
  assert.equal(rows[0].fulfilled_material_version_id, null, "rollback 後不得留下履約版本");
  const { rows: o } = await db.query(`SELECT status, paid_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(o[0].status, "pending_payment", "rollback 後訂單狀態必須回到原狀");
  assert.equal(o[0].paid_at, null, "rollback 後不得留下 paid_at");
});

test("non-regression: 履約快照不改動 orders.status / paid_at 的既有語意", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  await attachApprovedFile(materialId, teacher);
  const orderId = await makePendingOrder(buyer, [materialId]);

  await approveOrder(orderId);

  const { rows } = await db.query(
    `SELECT status, paid_at IS NOT NULL AS has_paid_at, payment_received_at
       FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.equal(rows[0].status, "approved");
  assert.equal(rows[0].has_paid_at, true, "paid_at 仍由核准流程寫入（語意未變）");
  assert.equal(rows[0].payment_received_at, null, "未提供入帳時間時仍保持 NULL");
});

test("legacy: 履約快照只可能來自真正的核准流程，不可能是 backfill", async () => {
  /*
   * 全表不變條件。**不能**斷言「除了本測試的 fixture 外全表都沒有履約版本」——
   * smoke 與其他測試會透過**真正的核准流程**合法寫入，那不是 backfill。
   *
   * 真正永遠成立的是下面三條：快照必成對、只出現在已核准訂單、
   * 且必定指向真實存在的檔案版本。
   * 任何 backfill（例如「把教材目前的 approved_file_id 塞進歷史訂單」）
   * 都會違反其中至少一條。
   *
   * 「migration 當下沒有寫入任何一列」已於套用時驗證（0 列）。
   */
  const orphanTimestamp = await db.query(
    `SELECT COUNT(*) AS n FROM order_items
      WHERE fulfilled_material_version_id IS NOT NULL AND fulfilled_at IS NULL`
  );
  assert.equal(Number(orphanTimestamp.rows[0].n), 0, "有版本卻沒有履約時間 —— 不可能來自核准流程");

  const notApproved = await db.query(
    `SELECT COUNT(*) AS n
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.fulfilled_material_version_id IS NOT NULL AND o.status <> 'approved'`
  );
  assert.equal(Number(notApproved.rows[0].n), 0, "未核准的訂單不可能有履約版本");

  const danglingFile = await db.query(
    `SELECT COUNT(*) AS n
       FROM order_items oi
       LEFT JOIN material_files f ON f.id = oi.fulfilled_material_version_id
      WHERE oi.fulfilled_material_version_id IS NOT NULL AND f.id IS NULL`
  );
  assert.equal(Number(danglingFile.rows[0].n), 0, "履約版本必定指向真實存在的檔案");
});
