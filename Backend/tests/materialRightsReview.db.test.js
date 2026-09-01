/**
 * 教材權利審查記錄的資料庫測試（P1-09 Wave 1 #5 foundation — Gate 2 / D5）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 這裡鎖的是七條不變條件：
 *
 *   1. 一份教材可以累積**多次**審查歷程，且新審查不覆寫舊的。
 *   2. `reviewed_by` / `reviewed_at` 可稽核。
 *   3. `risk_flags` 可同時保存多個風險，且只接受允許集合。
 *   4. `declaration_version` 未知時保持 NULL —— **不預設、不編造**。
 *   5. **Creator 聲明與 Platform 審查不混為同一欄位** ——
 *      `materials.ip_declaration_accepted` 為 true **不代表**存在權利審查記錄。
 *   6. **既有教材不被假造審查記錄**（不 backfill）。
 *   7. 審查記錄 **append-only**，不得事後改寫。
 *
 * 第 5、6 條是本輪的核心：在 Platform-as-Seller 模式下，平台自身的交付行為
 * 不受 ISP 免責事由保護，權利審查是平台自己的防線。
 * 一筆「看起來像盡職紀錄、實際什麼都沒審」的記錄，比沒有記錄更糟。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const rights = require("../services/materialRightsReview.service");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

const created = { users: [], materials: [] };

async function makeUser(role = "admin") {
  const id = `usr_mrr_${uniqueSuffix()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeMaterial(teacherId) {
  const id = `mat_mrr_${uniqueSuffix()}`;
  // 走與正式建立流程相同的寫法：ip_declaration_accepted 被寫死為 true。
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key, ip_declaration_accepted, ip_declaration_at)
     VALUES ($1, $2, 100, $3, 'pending_review', NULL, TRUE, NOW())`,
    [id, `權利審查測試教材 ${id}`, teacherId]
  );
  created.materials.push(id);
  return id;
}

test.after(async () => {
  try {
    if (created.materials.length) {
      // material_rights_reviews 為 ON DELETE CASCADE，隨教材一起清掉。
      await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM material_rights_reviews WHERE reviewed_by = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM materials WHERE teacher_id = ANY($1)`, [created.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("history: 一份教材可以累積多次審查，新審查不覆寫舊的", async () => {
  const teacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);

  const first = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "needs_evidence",
    riskFlags: ["famous_character", "font_license"],
    notes: "請提供角色使用授權與字型商用授權證明",
  });
  assert.equal(first.ok, true, JSON.stringify(first));

  const second = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "approved",
    riskFlags: ["font_license"],
    notes: "已取得字型商用授權；角色素材已移除",
    evidenceReference: "license-doc-2026-0826",
  });
  assert.equal(second.ok, true, JSON.stringify(second));

  const history = await rights.listReviewHistory(materialId);
  assert.equal(history.length, 2, "兩次審查都必須保留");
  assert.equal(history[0].review_result, "approved", "最新在前");
  assert.equal(history[1].review_result, "needs_evidence", "舊的結論不得被覆寫");

  const latest = await rights.getLatestReview(materialId);
  assert.equal(latest.id, second.review.id);
  assert.equal(latest.evidence_reference, "license-doc-2026-0826");
});

test("audit: reviewed_by / reviewed_at 可稽核", async () => {
  const teacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);

  const before = Date.now() - 1000;
  const r = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "approved",
  });
  assert.equal(r.ok, true);
  assert.equal(r.review.reviewed_by, admin);
  assert.ok(new Date(r.review.reviewed_at).getTime() >= before);
});

test("risk_flags: 可保存多個風險，且只接受允許集合", async () => {
  const teacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);

  const ok = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "rejected",
    riskFlags: ["trademark_logo", "scanned_book", "child_identity"],
    notes: "掃描書籍且含可識別兒少身分資訊",
  });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(
    [...ok.review.risk_flags].sort(),
    ["child_identity", "scanned_book", "trademark_logo"]
  );

  const bad = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "rejected",
    riskFlags: ["definitely_not_a_flag"],
    notes: "x",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "invalid_risk_flags");

  // 即使繞過 service，DB CHECK 仍然擋得住。
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO material_rights_reviews(material_id, reviewed_by, review_result, risk_flags)
         VALUES ($1, $2, 'approved', ARRAY['nope']::text[])`,
        [materialId, admin]
      ),
    /mrr_risk_flags_check/
  );
});

test("needs_evidence: 必須說明需要什麼，否則對 Creator 無法行動", async () => {
  const teacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);

  const noNotes = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "needs_evidence",
  });
  assert.equal(noNotes.ok, false);
  assert.equal(noNotes.code, "notes_required");

  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO material_rights_reviews(material_id, reviewed_by, review_result)
         VALUES ($1, $2, 'needs_evidence')`,
        [materialId, admin]
      ),
    /mrr_needs_evidence_requires_notes/
  );
});

test("declaration_version: 未知時保持 NULL —— 不預設、不編造", async () => {
  const teacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);

  const r = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "approved",
  });
  assert.equal(r.ok, true);
  assert.equal(r.review.declaration_version, null, "目前沒有經核可的聲明版本，未知就是未知");
  assert.equal(r.review.declaration_consent_id, null, "consent_records 尚未接線，必為 NULL");
});

test("separation: Creator 聲明與 Platform 審查是兩件事，不得互相代表", async () => {
  const teacher = await makeUser("teacher");
  const materialId = await makeMaterial(teacher);

  // 教材建立時 ip_declaration_accepted 被寫死為 true。
  const { rows } = await db.query(
    `SELECT ip_declaration_accepted, ip_declaration_at FROM materials WHERE id = $1`,
    [materialId]
  );
  assert.equal(rows[0].ip_declaration_accepted, true);
  assert.ok(rows[0].ip_declaration_at);

  // 但那**不代表**平台做過任何權利審查。
  const latest = await rights.getLatestReview(materialId);
  assert.equal(
    latest,
    null,
    "Creator 勾了聲明 ≠ Platform 完成權利審查 —— 兩者不得互相代表"
  );
});

test("legacy: 既有教材沒有被假造權利審查記錄", async () => {
  // 全表檢查：所有 ip_declaration_accepted = true 的教材中，
  // 有權利審查記錄的必須只有本測試自己建立的那些。
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT m.id) AS n
       FROM materials m
       JOIN material_rights_reviews r ON r.material_id = m.id
      WHERE m.ip_declaration_accepted = TRUE
        AND m.id <> ALL($1::text[])`,
    [created.materials.length ? created.materials : [""]]
  );
  assert.equal(
    Number(rows[0].n),
    0,
    "既有教材不得被 backfill 成『已審查』—— 假的盡職證據比沒有記錄更糟"
  );
});

test("append-only: 審查記錄不得事後改寫", async () => {
  const teacher = await makeUser("teacher");
  const admin = await makeUser("admin");
  const materialId = await makeMaterial(teacher);

  const r = await rights.recordReview({
    materialId,
    reviewedBy: admin,
    reviewResult: "rejected",
    riskFlags: ["stock_image"],
    notes: "圖庫素材無商用授權",
  });
  assert.equal(r.ok, true);

  for (const [col, val] of [
    ["review_result", "'approved'"],
    ["notes", "'改口'"],
    ["risk_flags", "ARRAY[]::text[]"],
    ["reviewed_at", "TIMESTAMP '2020-01-01 00:00:00'"],
  ]) {
    await assert.rejects(
      () => db.query(`UPDATE material_rights_reviews SET ${col} = ${val} WHERE id = $1`, [r.review.id]),
      /append-only/,
      `${col} 不得被改寫`
    );
  }

  const { rows } = await db.query(
    `SELECT review_result, notes FROM material_rights_reviews WHERE id = $1`,
    [r.review.id]
  );
  assert.equal(rows[0].review_result, "rejected");
  assert.equal(rows[0].notes, "圖庫素材無商用授權", "當時審查者寫了什麼，本身就是盡職證據");
});
