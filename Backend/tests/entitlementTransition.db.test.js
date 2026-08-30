/**
 * 授權狀態變更能力的資料庫測試（P1-09 Wave 2 #2 — Gate 14）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是八條不變條件：
 *
 *   1. `active → suspended → active` 可行，且下載授權隨之關閉與恢復。
 *   2. **訂單仍是 `approved`、`paid_at` 不變** —— 這是 Gate 14 的核心 invariant。
 *   3. 非法轉移被拒絕；`revoked_final` 是終態。
 *   4. 未附理由的變更被拒絕。
 *   5. **所有 A 類 entitlement consumer 一致**：下載、我的教材、評價資格。
 *   6. **B 類 revenue / reporting 不受影響** —— 「曾經買過」的事實不因授權暫停而消失。
 *   7. 狀態變更**不刪除**履約快照，也不刪除 `material_files`。
 *   8. 每次轉移留下 `activity_logs` 稽核。
 *
 * 第 2、6 條特別重要：把「現在是否有有效使用權」與「曾經買過／營收認列」
 * 混為一談，會同時破壞訂單狀態機與財務報表。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const entitlement = require("../services/entitlement.service");
const materialFile = require("../services/materialFile.service");
const reviewRepo = require("../repositories/review.repository");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], materials: [], orders: [], items: [] };

async function makeUser(role = "buyer") {
  const id = `usr_et_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_et_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, 'published', NULL)`,
    [id, `授權轉移測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

async function attachApprovedFile(materialId, uploadedBy) {
  const fileId = `mf_et_${uniqueSuffix()}`;
  await db.query(
    `UPDATE material_files SET status = 'superseded' WHERE material_id = $1 AND status = 'approved'`,
    [materialId]
  );
  await db.query(
    `INSERT INTO material_files(id, material_id, storage_key, original_filename, mime_type,
                                size_bytes, status, uploaded_by, approved_at)
     VALUES ($1, $2, $3, '教材.pdf', 'application/pdf', 1024, 'approved', $4, NOW())`,
    [fileId, materialId, `material-files/${fileId}`, uploadedBy]
  );
  await db.query(`UPDATE materials SET approved_file_id = $2 WHERE id = $1`, [materialId, fileId]);
  return fileId;
}

/** 建立一筆已核准訂單（含履約快照），回傳 `{ orderId, itemId, buyerId, materialId }`。 */
async function makeFulfilledOrder(teacher) {
  const buyerId = await makeUser();
  const materialId = await makeMaterial(teacher);
  await attachApprovedFile(materialId, teacher);
  const orderId = `ord_et_${uniqueSuffix()}`;
  const itemId = `oi_et_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount, paid_at)
     VALUES ($1, $2, 'approved', 'manual_transfer', 100, 100, 0, NOW())`,
    [orderId, buyerId]
  );
  await db.query(
    `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity, subtotal)
     VALUES ($1, $2, $3, 'fixture', 100, 1, 100)`,
    [itemId, orderId, materialId]
  );
  const { recordFulfillmentSnapshot } = require("../services/orderService");
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await recordFulfillmentSnapshot(client, orderId);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  created.orders.push(orderId);
  created.items.push(itemId);
  return { orderId, itemId, buyerId, materialId };
}

const ADMIN = { id: null };

test.after(async () => {
  try {
    if (created.items.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'order_item' AND target_id = ANY($1)`,
        [created.items]
      );
    }
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
      await db.query(
        `UPDATE order_items SET access_suspended_by = NULL, access_restored_by = NULL
          WHERE access_suspended_by = ANY($1) OR access_restored_by = ANY($1)`,
        [created.users]
      );
      await db.query(`DELETE FROM material_files WHERE uploaded_by = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("transition: active → suspended → active，下載授權隨之關閉與恢復", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { itemId, buyerId, materialId } = await makeFulfilledOrder(teacher);

  assert.equal((await materialFile.hasPurchaseEntitlement(buyerId, materialId)).entitled, true);

  const suspend = await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "suspended",
    reason: "爭議處理中",
    actorId: ADMIN.id,
    actorRole: "admin",
  });
  assert.equal(suspend.ok, true, JSON.stringify(suspend));
  assert.equal(suspend.from, "active");
  assert.equal(
    (await materialFile.hasPurchaseEntitlement(buyerId, materialId)).entitled,
    false,
    "暫停後下載授權必須關閉"
  );

  const restore = await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "active",
    reason: "爭議已解決",
    actorId: ADMIN.id,
    actorRole: "admin",
  });
  assert.equal(restore.ok, true, JSON.stringify(restore));
  assert.equal(
    (await materialFile.hasPurchaseEntitlement(buyerId, materialId)).entitled,
    true,
    "恢復後下載授權必須回來"
  );

  // 恢復不得抹去「曾經被暫停」的事實。
  const cur = await entitlement.getEntitlement(itemId);
  assert.ok(cur.access_suspended_at);
  assert.equal(cur.access_suspension_reason, "爭議處理中");
  assert.ok(cur.access_restored_at);
});

test("invariant: 訂單仍是 approved、paid_at 不變 —— 不得以訂單狀態代替授權撤銷", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { orderId, itemId } = await makeFulfilledOrder(teacher);

  const before = await db.query(`SELECT status, paid_at FROM orders WHERE id = $1`, [orderId]);

  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_pending",
    reason: "退款流程進行中",
    actorId: ADMIN.id,
    actorRole: "admin",
  });

  const after = await db.query(`SELECT status, paid_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(after.rows[0].status, "approved", "訂單狀態不得被動到");
  assert.deepEqual(after.rows[0].paid_at, before.rows[0].paid_at, "paid_at 不得被動到");
});

test("state machine: 非法轉移被拒絕，revoked_final 是終態", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { itemId } = await makeFulfilledOrder(teacher);

  // active → revoked_final 不是合法的一步。
  const jump = await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_final",
    reason: "x",
    actorId: ADMIN.id,
  });
  assert.equal(jump.ok, false);
  assert.equal(jump.code, "invalid_transition");

  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_pending",
    reason: "退款流程",
    actorId: ADMIN.id,
  });
  const final = await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_final",
    reason: "流程已完結",
    actorId: ADMIN.id,
  });
  assert.equal(final.ok, true, JSON.stringify(final));

  // 終態沒有出口。
  for (const to of ["active", "suspended", "revoked_pending"]) {
    const out = await entitlement.changeStatus({
      orderItemId: itemId,
      toStatus: to,
      reason: "試圖離開終態",
      actorId: ADMIN.id,
    });
    assert.equal(out.ok, false, `revoked_final → ${to} 必須被拒絕`);
    assert.equal(out.code, "invalid_transition");
  }

  // 相同狀態亦拒絕。
  const same = await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_final",
    reason: "重複",
    actorId: ADMIN.id,
  });
  assert.equal(same.code, "already_in_state");
});

test("reason: 未附理由的變更被拒絕", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { itemId } = await makeFulfilledOrder(teacher);

  for (const reason of [undefined, null, "", "   "]) {
    const r = await entitlement.changeStatus({
      orderItemId: itemId,
      toStatus: "suspended",
      reason,
      actorId: ADMIN.id,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "reason_required");
  }
});

test("consumers: 下載／我的教材／評價資格三者一致", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { itemId, buyerId, materialId } = await makeFulfilledOrder(teacher);

  const myMaterials = async () => {
    const { rows } = await db.query(
      `SELECT BOOL_OR(oi.entitlement_status = 'active') AS active
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id AND o.status = 'approved'
        WHERE o.user_id = $1 AND oi.material_id = $2
        GROUP BY oi.material_id`,
      [buyerId, materialId]
    );
    return rows[0] ?? null;
  };

  // active：三者皆為可用。
  assert.equal((await materialFile.hasPurchaseEntitlement(buyerId, materialId)).entitled, true);
  assert.equal((await myMaterials()).active, true);
  assert.equal(await reviewRepo.hasApprovedOrderForMaterial(buyerId, materialId), true);

  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "suspended",
    reason: "一致性測試",
    actorId: ADMIN.id,
  });

  // suspended：三者皆反映不可用，但**教材仍留在列表中**（購買事實不消失）。
  assert.equal((await materialFile.hasPurchaseEntitlement(buyerId, materialId)).entitled, false);
  const row = await myMaterials();
  assert.ok(row, "教材必須仍出現在『我的教材』—— 授權暫停不代表購買事實消失");
  assert.equal(row.active, false, "但必須標示為目前不可用");
  assert.equal(
    await reviewRepo.hasApprovedOrderForMaterial(buyerId, materialId),
    false,
    "授權暫停期間不得發表新評價"
  );
});

test("non-regression: 營收與成交報表不因授權暫停而改變", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { orderId, itemId } = await makeFulfilledOrder(teacher);

  // adminDashboard / adminTrends / teacherSales 使用的同一種條件。
  const revenue = async () => {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS amount
         FROM orders WHERE id = $1 AND status = 'approved' AND paid_at IS NOT NULL`,
      [orderId]
    );
    return Number(rows[0].amount);
  };
  const creatorSales = async () => {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS n
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.seller_id IS NOT DISTINCT FROM oi.seller_id
          AND oi.id = $1 AND o.status = 'approved' AND o.paid_at IS NOT NULL`,
      [itemId]
    );
    return Number(rows[0].n);
  };

  const revenueBefore = await revenue();
  const salesBefore = await creatorSales();

  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_pending",
    reason: "報表非回歸測試",
    actorId: ADMIN.id,
  });

  assert.equal(await revenue(), revenueBefore, "營收認列不得因授權撤銷而改變");
  assert.equal(await creatorSales(), salesBefore, "創作者成交紀錄不得因授權撤銷而消失");
});

test("retention: 狀態變更不刪除履約快照，也不刪除教材檔案", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { itemId } = await makeFulfilledOrder(teacher);

  const before = await entitlement.getEntitlement(itemId);
  assert.ok(before.fulfilled_material_version_id, "前提：履約快照存在");

  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "suspended",
    reason: "保存測試",
    actorId: ADMIN.id,
  });
  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "revoked_pending",
    reason: "保存測試",
    actorId: ADMIN.id,
  });

  const after = await entitlement.getEntitlement(itemId);
  assert.equal(
    after.fulfilled_material_version_id,
    before.fulfilled_material_version_id,
    "履約事實不因授權狀態變更而改變"
  );
  const { rows } = await db.query(`SELECT id FROM material_files WHERE id = $1`, [
    before.fulfilled_material_version_id,
  ]);
  assert.equal(rows.length, 1, "教材檔案不得被連帶刪除");
});

test("audit: 每次轉移都留下 activity_logs", async () => {
  const teacher = await makeUser("teacher");
  ADMIN.id = ADMIN.id || (await makeUser("admin"));
  const { itemId } = await makeFulfilledOrder(teacher);

  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "suspended",
    reason: "稽核測試 A",
    actorId: ADMIN.id,
    actorRole: "admin",
  });
  await entitlement.changeStatus({
    orderItemId: itemId,
    toStatus: "active",
    reason: "稽核測試 B",
    actorId: ADMIN.id,
    actorRole: "admin",
  });

  const history = await entitlement.listStatusHistory(itemId);
  assert.equal(history.length, 2, "兩次轉移都必須留下軌跡");
  assert.equal(history[0].meta.from, "suspended");
  assert.equal(history[0].meta.to, "active");
  assert.equal(history[0].meta.reason, "稽核測試 B");
  assert.equal(history[1].meta.from, "active");
  assert.equal(history[1].meta.to, "suspended");
  assert.equal(history[0].actor_id, ADMIN.id);
});
