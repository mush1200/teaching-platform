/**
 * `order_items` 獨立授權狀態與履約版本快照的資料庫測試（P1-09 Wave 1 foundation）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 * 每個 case 自己建立 fixture、自己清掉。
 *
 * 這裡鎖的是四條不變條件：
 *
 *   1. `entitlement_status` 是**與 `orders.status` 正交**的維度 ——
 *      訂單仍是 `approved`，但品項被暫停時，下載授權必須消失。
 *   2. 既有列的預設是 `active` —— 這次 migration **不得**改變任何既有買家的下載權。
 *   3. `entitlement_status` 只接受四個值。
 *   4. `fulfilled_material_version_id` 指向的檔案**不得**被實體刪除
 *      （ENTITLEMENT-RETENTION-INVARIANT 的 DB 層表達）。
 *
 * 為什麼要在「還沒有任何寫入端會設非 active」的時候就測：
 * 因為授權查詢是安全關鍵路徑。先證明機制成立，Wave 2 建立撤銷能力時
 * 就只需新增寫入端，不必再回頭改這條查詢。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const TEST_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "order-entitlement-dbtest-"));
process.env.MATERIAL_FILE_STORAGE_PATH = TEST_STORAGE_ROOT;

const db = require("../config/db");
const materialFile = require("../services/materialFile.service");

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

const created = { materials: [], users: [], orders: [], items: [] };

async function makeUser(role) {
  const id = `usr_oie_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_oie_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, 'published', NULL)`,
    [id, `授權測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

/** 建立一張已核准的訂單，含一個品項。回傳 `{ orderId, itemId }`。 */
async function makeApprovedOrder(buyerId, materialId) {
  const orderId = `ord_oie_${uniqueSuffix()}`;
  const itemId = `oi_oie_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'approved', 'manual_transfer', 100, 100, 0)`,
    [orderId, buyerId]
  );
  await db.query(
    `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, subtotal)
     VALUES ($1, $2, $3, 'fixture', 100, 1, 100)`,
    [itemId, orderId, materialId]
  );
  created.orders.push(orderId);
  created.items.push(itemId);
  return { orderId, itemId };
}

/**
 * 上傳並附加到教材、置於 `approved` —— 也就是「買家實際會拿到的那個版本」的狀態。
 * 保存期限的不變條件要在這個狀態下驗證才有意義。
 */
async function uploadApprovedFile(uploadedBy, materialId) {
  const bytes = Buffer.from(`%PDF-1.7\n% entitlement test ${uniqueSuffix()}\n%%EOF\n`, "latin1");
  const result = await materialFile.storeUpload({
    readable: Readable.from([bytes]),
    originalFilename: "教材.pdf",
    declaredMimeType: "application/pdf",
    uploadedBy,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  await db.query(
    `UPDATE material_files SET material_id = $2, status = 'approved', approved_at = NOW() WHERE id = $1`,
    [result.file.id, materialId]
  );
  return result.file.id;
}

test.after(async () => {
  try {
    if (created.orders.length) {
      // 先解開 fulfilled 指標，否則 ON DELETE RESTRICT 會擋住檔案清理 ——
      // 那正是本測試要驗證的行為。
      await db.query(
        `UPDATE order_items SET fulfilled_material_version_id = NULL WHERE order_id = ANY($1)`,
        [created.orders]
      );
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.materials.length) {
      await db.query(`DELETE FROM material_files WHERE material_id = ANY($1)`, [created.materials]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM material_files WHERE uploaded_by = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    if (created.materials.length) {
      await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
    }
  } finally {
    fs.rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("migration: 新建的訂單品項預設為 active —— 既有買家的下載權不受影響", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(teacher);
  const { itemId } = await makeApprovedOrder(buyer, materialId);

  const { rows } = await db.query(
    `SELECT entitlement_status, access_suspended_at, fulfilled_material_version_id, fulfilled_at
       FROM order_items WHERE id = $1`,
    [itemId]
  );
  assert.equal(rows[0].entitlement_status, "active");
  assert.equal(rows[0].access_suspended_at, null);
  assert.equal(rows[0].fulfilled_material_version_id, null, "既有／新列不回填猜測的履約版本");
  assert.equal(rows[0].fulfilled_at, null);

  const entitlement = await materialFile.hasPurchaseEntitlement(buyer, materialId);
  assert.equal(entitlement.entitled, true, "active 品項必須維持既有的下載授權");
});

test("entitlement: 訂單仍是 approved，但品項被暫停時下載授權必須消失", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(teacher);
  const { orderId, itemId } = await makeApprovedOrder(buyer, materialId);

  assert.equal((await materialFile.hasPurchaseEntitlement(buyer, materialId)).entitled, true);

  for (const status of ["suspended", "revoked_pending", "revoked_final"]) {
    await db.query(
      `UPDATE order_items
          SET entitlement_status = $2, access_suspended_at = NOW(), access_suspension_reason = 'db test'
        WHERE id = $1`,
      [itemId, status]
    );

    const entitlement = await materialFile.hasPurchaseEntitlement(buyer, materialId);
    assert.equal(entitlement.entitled, false, `${status} 不得保有下載授權`);

    // 訂單狀態機**完全沒有被動到** —— 這正是 Gate 14 要求的正交性。
    const { rows } = await db.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
    assert.equal(rows[0].status, "approved", "撤銷授權不得改動 orders.status");
  }

  // 恢復後授權必須回來（revoke 是「暫停交付」，不是刪除授權紀錄）。
  await db.query(
    `UPDATE order_items SET entitlement_status = 'active', access_restored_at = NOW() WHERE id = $1`,
    [itemId]
  );
  assert.equal(
    (await materialFile.hasPurchaseEntitlement(buyer, materialId)).entitled,
    true,
    "restore 後授權必須回復"
  );
});

test("entitlement: 只接受四個合法狀態值", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(teacher);
  const { itemId } = await makeApprovedOrder(buyer, materialId);

  await assert.rejects(
    () => db.query(`UPDATE order_items SET entitlement_status = 'deleted' WHERE id = $1`, [itemId]),
    /order_items_entitlement_status_check/,
    "非法狀態值必須被 CHECK 擋下"
  );
});

test("quantity: 不得為 0 或負數", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(teacher);
  const { itemId } = await makeApprovedOrder(buyer, materialId);

  await assert.rejects(
    () => db.query(`UPDATE order_items SET quantity = 0 WHERE id = $1`, [itemId]),
    /order_items_quantity_positive_check/
  );
});

test("retention: 被訂單品項引用的教材版本不得被實體刪除", async () => {
  const teacher = await makeUser("teacher");
  const buyer = await makeUser("buyer");
  const materialId = await makeMaterial(teacher);
  const { itemId } = await makeApprovedOrder(buyer, materialId);
  const fileId = await uploadApprovedFile(teacher, materialId);

  await db.query(
    `UPDATE order_items SET fulfilled_material_version_id = $2, fulfilled_at = NOW() WHERE id = $1`,
    [itemId, fileId]
  );

  await assert.rejects(
    () => db.query(`DELETE FROM material_files WHERE id = $1`, [fileId]),
    /order_items_fulfilled_version_fkey|violates foreign key constraint/,
    "ENTITLEMENT-RETENTION-INVARIANT：仍被履約紀錄引用的版本不得回收"
  );

  // 正確的「停止提供」做法是改狀態，不是刪列 —— 而且它不受 RESTRICT 影響。
  await db.query(`UPDATE material_files SET status = 'revoked' WHERE id = $1`, [fileId]);
  const { rows } = await db.query(`SELECT status FROM material_files WHERE id = $1`, [fileId]);
  assert.equal(rows[0].status, "revoked");
});
