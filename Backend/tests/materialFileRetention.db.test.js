/**
 * 教材檔案保存安全的資料庫測試（P1-09 Wave 2 #4 — Gate 14）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 本輪要鎖的是一件事：**實體刪除路徑不得在無法證明安全時動手。**
 *
 * 特別鎖住兩個舊行為：
 *
 *   1. 舊 `cleanupOrphans()` 的資格判斷**完全不看** legal hold、entitlement、履約快照。
 *   2. 舊 `cleanupOrphans()` **先刪實體再刪列**，因此
 *      `order_items.fulfilled_material_version_id` 的 `ON DELETE RESTRICT`
 *      只保護得了 DB 列 —— 列刪不掉時位元組已經沒了，而且救不回來。
 *
 * `revoked_final` 的測試（第 7 條）是本輪最重要的一條：
 * 授權終結**不等於**可以刪掉當初交付的東西。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

// 儲存根目錄必須在載入 service 之前設定好（config 只讀一次）。
const STORAGE_ROOT =
  process.env.PRIVATE_FILE_STORAGE_PATH ||
  fs.mkdtempSync(path.join(os.tmpdir(), "mfr-test-"));
process.env.PRIVATE_FILE_STORAGE_PATH = STORAGE_ROOT;

const db = require("../config/db");
const retention = require("../services/materialFileRetention.service");
const materialFileService = require("../services/materialFile.service");
const entitlementService = require("../services/entitlement.service");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;

const created = { users: [], materials: [], files: [], orders: [], items: [], keys: [] };

async function makeUser(role = "buyer") {
  const id = `usr_mfr_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_mfr_${uniq()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status) VALUES ($1, $2, 100, $3, 'published')`,
    [id, `保存測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

/** 建立一列 `material_files` 並在磁碟上放一個真實物件（好驗證位元組有沒有消失）。 */
async function makeFile({ materialId = null, status = "unattached", uploadedBy, ageHours = 48 }) {
  // storage key 必須是 `<namespace>/<uuid>`（`storage/privateFileStorage.js` 會驗證）。
  const key = `material-files/${crypto.randomUUID()}`;
  const abs = path.join(STORAGE_ROOT, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "test-bytes");
  created.keys.push(key);

  const { rows } = await db.query(
    `INSERT INTO material_files(material_id, storage_key, original_filename, mime_type,
                                size_bytes, status, uploaded_by, uploaded_at)
     VALUES ($1, $2, 'fixture.pdf', 'application/pdf', 10, $3, $4, NOW() - ($5 || ' hours')::interval)
     RETURNING *`,
    [materialId, key, status, uploadedBy, String(ageHours)]
  );
  created.files.push(rows[0].id);
  return rows[0];
}

async function makeApprovedOrder(buyerId, materialId, { fulfilledFileId = null } = {}) {
  const orderId = `ord_mfr_${uniq()}`;
  const itemId = `oi_mfr_${uniq()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount, paid_at)
     VALUES ($1, $2, 'approved', 'manual_transfer', 100, 100, 0, NOW())`,
    [orderId, buyerId]
  );
  await db.query(
    `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, quantity,
                             subtotal, fulfilled_material_version_id, fulfilled_at)
     VALUES ($1, $2, $3, 'fixture', 100, 1, 100, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE NOW() END)`,
    [itemId, orderId, materialId, fulfilledFileId]
  );
  created.orders.push(orderId);
  created.items.push(itemId);
  return { orderId, itemId };
}

const exists = (key) => fs.existsSync(path.join(STORAGE_ROOT, key));

test.after(async () => {
  try {
    if (created.files.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'material_file' AND target_id = ANY($1)`,
        [created.files]
      );
    }
    if (created.orders.length) {
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'order_item' AND target_id = ANY($1)`,
        [created.items]
      );
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.files.length) {
      await db.query(`UPDATE materials SET approved_file_id = NULL, pending_file_id = NULL
                       WHERE approved_file_id = ANY($1) OR pending_file_id = ANY($1)`, [created.files]);
      await db.query(`DELETE FROM material_download_tokens WHERE file_id = ANY($1)`, [created.files]);
      await db.query(`DELETE FROM material_files WHERE id = ANY($1)`, [created.files]);
    }
    if (created.materials.length) {
      await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    for (const key of created.keys) {
      fs.rmSync(path.join(STORAGE_ROOT, key), { force: true });
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("legal hold: set / release 有理由、actor 與時間，且解除保留稽核軌跡", async () => {
  const admin = await makeUser("admin");
  const teacher = await makeUser("teacher");
  const file = await makeFile({ uploadedBy: teacher });

  assert.equal((await retention.setLegalHold({ fileId: file.id, actorId: admin })).code, "reason_required");
  assert.equal(
    (await retention.setLegalHold({ fileId: file.id, reason: "   ", actorId: admin })).code,
    "reason_required"
  );
  assert.equal(
    (await retention.setLegalHold({ fileId: "mf_does_not_exist", reason: "x", actorId: admin })).code,
    "file_not_found"
  );

  const set = await retention.setLegalHold({
    fileId: file.id,
    reason: "IP 爭議調查中",
    actorId: admin,
    actorRole: "admin",
  });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(set.file.legal_hold, true);
  assert.equal(set.file.hold_reason, "IP 爭議調查中");
  assert.equal(set.file.hold_set_by, admin);
  assert.ok(set.file.hold_set_at);

  assert.equal(
    (await retention.releaseLegalHold({ fileId: file.id, actorId: admin })).code,
    "reason_required"
  );

  const rel = await retention.releaseLegalHold({
    fileId: file.id,
    reason: "調查結束",
    actorId: admin,
    actorRole: "admin",
  });
  assert.equal(rel.ok, true);
  assert.equal(rel.file.legal_hold, false);
  assert.ok(rel.file.hold_released_at);
  assert.equal(rel.file.hold_released_by, admin);
  // 稽核軌跡不得被解除動作抹掉。
  assert.equal(rel.file.hold_reason, "IP 爭議調查中");
  assert.equal(rel.file.hold_set_by, admin);

  assert.equal((await retention.releaseLegalHold({ fileId: file.id, reason: "again", actorId: admin })).code, "not_on_hold");

  const history = await retention.listHoldHistory(file.id);
  assert.deepEqual(
    history.map((h) => h.action),
    ["material_file.legal_hold_released", "material_file.legal_hold_set"]
  );
});

test("legal hold: DB CHECK 擋住「無理由的 hold」與「憑空的解除紀錄」", async () => {
  const teacher = await makeUser("teacher");
  const file = await makeFile({ uploadedBy: teacher });

  await assert.rejects(
    () => db.query(`UPDATE material_files SET legal_hold = TRUE WHERE id = $1`, [file.id]),
    /material_files_hold_requires_reason/
  );
  await assert.rejects(
    () => db.query(`UPDATE material_files SET hold_released_at = NOW() WHERE id = $1`, [file.id]),
    /material_files_hold_release_requires_set/
  );
});

test("predicate: 沒有任何依賴的孤兒可刪；被 hold 的永遠不可刪", async () => {
  const admin = await makeUser("admin");
  const teacher = await makeUser("teacher");
  const clean = await makeFile({ uploadedBy: teacher });

  const before = await retention.canPhysicallyDeleteMaterialFile(clean.id);
  assert.equal(before.deletable, true, JSON.stringify(before));
  assert.deepEqual(before.reasons, []);

  await retention.setLegalHold({ fileId: clean.id, reason: "訴訟保全", actorId: admin });
  const held = await retention.canPhysicallyDeleteMaterialFile(clean.id);
  assert.equal(held.deletable, false);
  assert.ok(held.reasons.includes(retention.BLOCK_REASONS.LEGAL_HOLD));

  await retention.releaseLegalHold({ fileId: clean.id, reason: "結案", actorId: admin });
  assert.equal((await retention.canPhysicallyDeleteMaterialFile(clean.id)).deletable, true);
});

test("predicate: 不存在的檔案與空 id 一律 false（unknown → KEEP）", async () => {
  for (const id of [null, undefined, "", "mf_nope"]) {
    const v = await retention.canPhysicallyDeleteMaterialFile(id);
    assert.equal(v.deletable, false, `${id} 必須不可刪`);
    assert.ok(v.reasons.includes(retention.BLOCK_REASONS.NOT_FOUND));
  }
});

test("predicate: active / suspended / revoked_pending 授權都阻止刪除", async () => {
  const admin = await makeUser("admin");
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  // 附加到教材才可能有授權依賴；狀態設為 superseded（不是 live 指標）。
  const file = await makeFile({ materialId, status: "superseded", uploadedBy: teacher });
  const { itemId } = await makeApprovedOrder(buyer, materialId);

  for (const status of ["active", "suspended", "revoked_pending"]) {
    if (status !== "active") {
      const to = status === "suspended" ? "suspended" : "revoked_pending";
      const r = await entitlementService.changeStatus({
        orderItemId: itemId,
        toStatus: to,
        reason: "測試依賴",
        actorId: admin,
      });
      assert.equal(r.ok, true, JSON.stringify(r));
    }
    const v = await retention.canPhysicallyDeleteMaterialFile(file.id);
    assert.equal(v.deletable, false, `${status} 必須阻止刪除`);
    assert.ok(
      v.reasons.includes(retention.BLOCK_REASONS.ENTITLEMENT),
      `${status} 必須被認定為授權依賴，實際 reasons = ${v.reasons.join(",")}`
    );
    assert.equal(v.checks.restorableEntitlements, 1);
  }
});

test("predicate: revoked_final 不會單憑狀態就允許刪除 —— 履約快照仍然擋住", async () => {
  const admin = await makeUser("admin");
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);
  const file = await makeFile({ materialId, status: "superseded", uploadedBy: teacher });
  const { itemId } = await makeApprovedOrder(buyer, materialId, { fulfilledFileId: file.id });

  for (const to of ["revoked_pending", "revoked_final"]) {
    const r = await entitlementService.changeStatus({
      orderItemId: itemId,
      toStatus: to,
      reason: "測試終態",
      actorId: admin,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
  }

  const v = await retention.canPhysicallyDeleteMaterialFile(file.id);
  assert.equal(v.deletable, false, "授權終結 ≠ 可以刪掉當初交付的東西");
  assert.equal(v.checks.restorableEntitlements, 0, "revoked_final 確實不再是「可恢復的授權依賴」");
  assert.ok(
    v.reasons.includes(retention.BLOCK_REASONS.FULFILLMENT_SNAPSHOT),
    `必須由履約快照接手擋住，實際 reasons = ${v.reasons.join(",")}`
  );
});

test("predicate: 仍被 materials 指標引用、或有未使用的下載票，都阻止刪除", async () => {
  const teacher = await makeUser("teacher");
  const materialId = await makeMaterial(teacher);
  const buyer = await makeUser();

  const live = await makeFile({ materialId, status: "approved", uploadedBy: teacher });
  await db.query(`UPDATE materials SET approved_file_id = $2 WHERE id = $1`, [materialId, live.id]);
  const v1 = await retention.canPhysicallyDeleteMaterialFile(live.id);
  assert.equal(v1.deletable, false);
  assert.ok(v1.reasons.includes(retention.BLOCK_REASONS.LIVE_POINTER));

  const orphan = await makeFile({ uploadedBy: teacher });
  await db.query(
    `INSERT INTO material_download_tokens(token_hash, user_id, material_id, file_id, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + interval '10 minutes')`,
    [`hash_${uniq()}`, buyer, materialId, orphan.id]
  );
  const v2 = await retention.canPhysicallyDeleteMaterialFile(orphan.id);
  assert.equal(v2.deletable, false);
  assert.ok(v2.reasons.includes(retention.BLOCK_REASONS.DOWNLOAD_TOKEN));
});

test("fail-closed: dependency 查詢失敗時不得被當成「沒有依賴」", async () => {
  const teacher = await makeUser("teacher");
  const file = await makeFile({ uploadedBy: teacher });
  assert.equal((await retention.canPhysicallyDeleteMaterialFile(file.id)).deletable, true);

  // 模擬 DB 故障：所有依賴查詢都拋錯。
  const broken = {
    query: async () => {
      throw new Error("simulated connection failure");
    },
  };
  const v = await retention.canPhysicallyDeleteMaterialFile(file.id, { client: broken });
  assert.equal(v.deletable, false, "查詢壞掉時必須 KEEP，不得 DELETE");
  assert.deepEqual(v.reasons, [retention.BLOCK_REASONS.LOOKUP_FAILED]);

  // 只有部分查詢壞掉時也一樣。
  let calls = 0;
  const flaky = {
    query: async (...args) => {
      calls += 1;
      if (calls > 2) throw new Error("simulated mid-flight failure");
      return db.query(...args);
    },
  };
  const v2 = await retention.canPhysicallyDeleteMaterialFile(file.id, { client: flaky });
  assert.equal(v2.deletable, false);
  assert.ok(v2.reasons.includes(retention.BLOCK_REASONS.LOOKUP_FAILED));
});

test("cleanup: 被 hold 與有依賴的檔案不會被刪，且位元組仍在磁碟上", async () => {
  const admin = await makeUser("admin");
  const teacher = await makeUser("teacher");
  const buyer = await makeUser();
  const materialId = await makeMaterial(teacher);

  const held = await makeFile({ uploadedBy: teacher });
  await retention.setLegalHold({ fileId: held.id, reason: "檢舉調查", actorId: admin });

  // 這個檔案的 status 是 unattached（會被舊版掃到），但同時是某筆訂單的履約版本
  // —— 正是舊版「先刪實體」會造成不可逆損失的形狀。
  const snapshotted = await makeFile({ uploadedBy: teacher });
  await makeApprovedOrder(buyer, materialId, { fulfilledFileId: snapshotted.id });

  const fresh = await makeFile({ uploadedBy: teacher, ageHours: 0 }); // 未過 TTL

  const result = await materialFileService.cleanupOrphans({ olderThanHours: 24 });

  const skippedIds = result.skipped.map((s) => s.id);
  assert.ok(skippedIds.includes(held.id), "被 hold 的檔案必須被跳過");
  assert.ok(skippedIds.includes(snapshotted.id), "有履約快照的檔案必須被跳過");
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures));

  // 三個檔案的列與位元組都必須完好。
  for (const f of [held, snapshotted, fresh]) {
    const { rows } = await db.query(`SELECT id FROM material_files WHERE id = $1`, [f.id]);
    assert.equal(rows.length, 1, `${f.id} 的列不得被刪`);
    assert.equal(exists(f.storage_key), true, `${f.id} 的實體檔案不得被刪`);
  }

  // 稽核：兩種跳過理由分別留下 action。
  const logs = await db.query(
    `SELECT target_id, action, meta FROM activity_logs
      WHERE target_type = 'material_file' AND target_id = ANY($1)
        AND action LIKE 'material_file.cleanup_skipped%'`,
    [[held.id, snapshotted.id]]
  );
  const byId = Object.fromEntries(logs.rows.map((r) => [r.target_id, r]));
  assert.equal(byId[held.id].action, "material_file.cleanup_skipped_due_to_hold");
  assert.equal(byId[snapshotted.id].action, "material_file.cleanup_skipped_due_to_dependency");
  assert.ok(byId[snapshotted.id].meta.reasons.includes(retention.BLOCK_REASONS.FULFILLMENT_SNAPSHOT));
});

test("cleanup: 真正無依賴的孤兒會被刪掉（列與位元組同時消失）並留下稽核", async () => {
  const teacher = await makeUser("teacher");
  const orphan = await makeFile({ uploadedBy: teacher });
  assert.equal(exists(orphan.storage_key), true);

  // dry-run 走同一個 predicate，且什麼都不刪。
  const dry = await materialFileService.cleanupOrphans({ olderThanHours: 24, dryRun: true });
  assert.ok(dry.skipped.some((s) => s.id === orphan.id && s.reasons.includes("dry_run")));
  assert.equal(dry.deletedRows, 0);
  assert.equal(exists(orphan.storage_key), true, "dry-run 不得刪任何東西");

  const result = await materialFileService.cleanupOrphans({ olderThanHours: 24 });
  assert.ok(result.deletedRows >= 1);
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures));

  const { rows } = await db.query(`SELECT id FROM material_files WHERE id = $1`, [orphan.id]);
  assert.equal(rows.length, 0, "列應被刪除");
  assert.equal(exists(orphan.storage_key), false, "實體檔案應被刪除");

  const log = await db.query(
    `SELECT action FROM activity_logs
      WHERE target_type = 'material_file' AND target_id = $1 AND action = 'material_file.physically_deleted'`,
    [orphan.id]
  );
  assert.equal(log.rows.length, 1);
});

test("non-regression: 買家授權與履約快照不受清理影響；hold 未擴散", async () => {
  // 全表沒有任何 hold 被誤設（fixture 都已解除或本就沒設）。
  const stray = await db.query(
    `SELECT COUNT(*)::int AS n FROM material_files
      WHERE legal_hold = TRUE AND id <> ALL($1::text[])`,
    [created.files.length ? created.files : [""]]
  );
  assert.equal(stray.rows[0].n, 0, "不得對 fixture 以外的檔案設 hold —— 沒有 backfill");

  // 履約快照必須仍指向真實存在的檔案列（清理沒有打斷這條線）。
  const dangling = await db.query(
    `SELECT COUNT(*)::int AS n FROM order_items oi
      WHERE oi.fulfilled_material_version_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM material_files mf WHERE mf.id = oi.fulfilled_material_version_id)`
  );
  assert.equal(dangling.rows[0].n, 0, "清理不得留下懸空的履約快照");

  // 仍在交付中的 approved 檔案一個都沒少。
  const live = await db.query(
    `SELECT COUNT(*)::int AS n FROM materials m
      WHERE m.approved_file_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM material_files mf WHERE mf.id = m.approved_file_id)`
  );
  assert.equal(live.rows[0].n, 0, "清理不得刪掉任何仍被指標引用的檔案");
});
