/**
 * 教材上架審核 workflow 的資料庫測試（Material Review MVP Phase 1）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 * 每個 case 自己建立 fixture、自己清掉，不依賴既有資料。
 *
 * 這裡鎖的是**狀態機與不變條件**，不是 HTTP 層：
 *   - 合法／非法轉移（含繞過正式流程的三條禁止路徑）
 *   - 退回原因與說明的驗證
 *   - review snapshot 與 published_at 的語意（首次公開只寫一次）
 *   - 每一次狀態變更都留下對應的 activity log
 *   - 擁有者邊界（創作者不得重送別人的教材）
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
const workflow = require("../utils/materialWorkflow");
const materialReview = require("../services/materialReview.service");

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

const created = { materials: [], users: [], files: [] };

async function makeUser(role) {
  const id = `usr_mrv_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`,
    [id, `${id}@example.test`, role]
  );
  created.users.push(id);
  return { userId: id, role };
}

/**
 * 建立一份教材。
 *
 * 預設**帶一個候選檔** —— 因為核准上架本來就要求教材有可交付的檔案
 * （見 materialFile.service.promoteCandidate）。想測「沒有檔案會怎樣」的案例
 * 明確傳 `withCandidateFile: false`。
 *
 * 這裡直接寫 `material_files` 列而不走上傳端點：本檔測的是狀態機與指標，
 * 不是儲存後端，因此不需要真的有位元組落在磁碟上。
 */
async function makeMaterial(teacherId, status = "pending_review", { withCandidateFile = true } = {}) {
  const id = `mat_mrv_${uniqueSuffix()}`;
  await db.query(
    `INSERT INTO materials(id, title, price, teacher_id, status, file_key)
     VALUES ($1, $2, 100, $3, $4, 'files/test.pdf')`,
    [id, `審核測試教材 ${id}`, teacherId, status]
  );
  created.materials.push(id);
  if (withCandidateFile) await makeCandidateFile(id, teacherId);
  return id;
}

async function makeCandidateFile(materialId, uploadedBy) {
  const { rows } = await db.query(
    `INSERT INTO material_files
       (material_id, storage_key, original_filename, mime_type, size_bytes, status, uploaded_by)
     VALUES ($1, $2, '教材.pdf', 'application/pdf', 1024, 'candidate', $3)
     RETURNING id`,
    [materialId, `material-files/${crypto.randomUUID()}`, uploadedBy]
  );
  created.files.push(rows[0].id);
  await db.query(`UPDATE materials SET pending_file_id = $2 WHERE id = $1`, [materialId, rows[0].id]);
  return rows[0].id;
}

async function readMaterial(id) {
  const { rows } = await db.query(`SELECT * FROM materials WHERE id = $1`, [id]);
  return rows[0];
}

async function actionsFor(materialId) {
  const { rows } = await db.query(
    `SELECT action, meta FROM activity_logs
      WHERE target_type = 'material' AND target_id = $1
      ORDER BY created_at ASC, id ASC`,
    [materialId]
  );
  return rows;
}

test.after(async () => {
  if (created.materials.length > 0) {
    // 先清 materials 的指標，否則 material_files 會被 FK 擋住。
    await db.query(
      `UPDATE materials SET approved_file_id = NULL, pending_file_id = NULL WHERE id = ANY($1)`,
      [created.materials]
    );
    await db.query(`DELETE FROM material_files WHERE material_id = ANY($1)`, [created.materials]);
    await db.query(`DELETE FROM activity_logs WHERE target_type = 'material' AND target_id = ANY($1)`, [
      created.materials,
    ]);
    await db.query(`DELETE FROM materials WHERE id = ANY($1)`, [created.materials]);
  }
  if (created.users.length > 0) {
    await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [created.users]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  /*
   * 通知信是 fire-and-forget（`void send…`）。測試環境沒有 SMTP，它一定會失敗並
   * 嘗試寫一筆 `order_email_failed` —— 若在那之前就關掉連線池，會噴出一串
   * 「Cannot use a pool after calling end」的誤導性錯誤。等它落地再收線。
   */
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.pool.end();
});

/* ---------------------------------------------------------------- *
 * 狀態機（純函式，不碰資料庫）
 * ---------------------------------------------------------------- */

test("workflow: allowed transitions", () => {
  assert.equal(workflow.canTransition("pending_review", "published"), true);
  assert.equal(workflow.canTransition("pending_review", "changes_requested"), true);
  assert.equal(workflow.canTransition("changes_requested", "pending_review"), true);
  assert.equal(workflow.canTransition("unpublished", "pending_review"), true);
  assert.equal(workflow.canTransition("published", "unpublished"), true);
});

test("workflow: transitions that would bypass review are rejected", () => {
  assert.equal(workflow.canTransition("changes_requested", "published"), false);
  assert.equal(workflow.canTransition("unpublished", "published"), false);
  assert.equal(workflow.canTransition("published", "changes_requested"), false);
  // 自我轉移不是轉移
  assert.equal(workflow.canTransition("published", "published"), false);
  assert.equal(workflow.canTransition("nonsense", "published"), false);
});

test("workflow: changes_requested is not admin backlog", () => {
  assert.deepEqual([...workflow.ADMIN_BACKLOG_STATUSES], ["pending_review"]);
  assert.equal(workflow.ADMIN_BACKLOG_STATUSES.includes("changes_requested"), false);
  assert.equal(workflow.canResubmit("changes_requested"), true);
  assert.equal(workflow.canResubmit("unpublished"), true);
  assert.equal(workflow.canResubmit("published"), false);
});

test("workflow: request-changes validation", () => {
  assert.equal(workflow.validateRequestChanges({ reasonCode: "nope", note: "夠長的說明文字內容" }).valid, false);
  assert.equal(workflow.validateRequestChanges({ note: "夠長的說明文字內容" }).valid, false);
  assert.equal(workflow.validateRequestChanges({ reasonCode: "other", note: "" }).valid, false);
  assert.equal(workflow.validateRequestChanges({ reasonCode: "other", note: "   " }).valid, false);
  // 9 個字 → 不足
  assert.equal(workflow.validateRequestChanges({ reasonCode: "other", note: "一二三四五六七八九" }).valid, false);
  // 10 個字 → 通過（以 code point 計，中文一個字算一個）
  const ok = workflow.validateRequestChanges({ reasonCode: "other", note: "一二三四五六七八九十" });
  assert.equal(ok.valid, true);
  assert.equal(ok.reasonCode, "other");
});

/* ---------------------------------------------------------------- *
 * Approve
 * ---------------------------------------------------------------- */

test("approve: pending_review → published, writes snapshot and first published_at", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  const result = await materialReview.approveMaterial(id, admin);
  assert.equal(result.ok, true);
  assert.equal(result.firstPublish, true);

  const row = await readMaterial(id);
  assert.equal(row.status, "published");
  assert.equal(row.reviewed_by, admin.userId);
  assert.ok(row.reviewed_at instanceof Date);
  assert.ok(row.published_at instanceof Date);
  // 核准會清掉上一次的退回理由 —— 已上架的教材不該還掛著「需修改原因」
  assert.equal(row.review_reason_code, null);
  assert.equal(row.review_note, null);

  const actions = await actionsFor(id);
  const published = actions.filter((a) => a.action === "material.published");
  assert.equal(published.length, 1);
  assert.equal(published[0].meta.oldStatus, "pending_review");
  assert.equal(published[0].meta.newStatus, "published");
  assert.equal(published[0].meta.firstPublish, true);
});

test("approve: repeated approve is a 409-style invalid transition", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  assert.equal((await materialReview.approveMaterial(id, admin)).ok, true);
  const second = await materialReview.approveMaterial(id, admin);
  assert.equal(second.ok, false);
  assert.equal(second.code, "invalid_transition");
  assert.equal(materialReview.ERROR_STATUS[second.code], 409);
});

test("approve: rejects changes_requested and unpublished sources", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const blocked = await makeMaterial(creator.userId, "changes_requested");
  const down = await makeMaterial(creator.userId, "unpublished");

  assert.equal((await materialReview.approveMaterial(blocked, admin)).code, "invalid_transition");
  assert.equal((await materialReview.approveMaterial(down, admin)).code, "invalid_transition");
  assert.equal((await readMaterial(blocked)).status, "changes_requested");
  assert.equal((await readMaterial(down)).status, "unpublished");
});

test("approve: material not found", async () => {
  const admin = await makeUser("admin");
  const missing = await materialReview.approveMaterial("mat_does_not_exist", admin);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "not_found");
});

/* ---------------------------------------------------------------- *
 * Request changes
 * ---------------------------------------------------------------- */

test("request-changes: writes reason snapshot and audit event", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  const result = await materialReview.requestChanges(id, admin, {
    reasonCode: "incomplete_info",
    note: "活動步驟只寫了一句，請補充完整流程。",
  });
  assert.equal(result.ok, true);

  const row = await readMaterial(id);
  assert.equal(row.status, "changes_requested");
  assert.equal(row.review_reason_code, "incomplete_info");
  assert.match(row.review_note, /活動步驟/);
  assert.equal(row.reviewed_by, admin.userId);
  assert.ok(row.reviewed_at instanceof Date);
  assert.equal(row.published_at, null);

  const actions = await actionsFor(id);
  const event = actions.find((a) => a.action === "material.changes_requested");
  assert.ok(event, "material.changes_requested must be logged");
  assert.equal(event.meta.reasonCode, "incomplete_info");
  assert.equal(event.meta.oldStatus, "pending_review");
  assert.equal(event.meta.newStatus, "changes_requested");
});

test("request-changes: invalid reason code and short note are rejected before any write", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  const badReason = await materialReview.requestChanges(id, admin, {
    reasonCode: "not_a_reason",
    note: "這段說明長度是足夠的沒問題",
  });
  assert.equal(badReason.code, "invalid_input");

  const shortNote = await materialReview.requestChanges(id, admin, {
    reasonCode: "other",
    note: "太短",
  });
  assert.equal(shortNote.code, "invalid_input");

  const blankNote = await materialReview.requestChanges(id, admin, {
    reasonCode: "other",
    note: "   ",
  });
  assert.equal(blankNote.code, "invalid_input");

  assert.equal((await readMaterial(id)).status, "pending_review");
});

test("request-changes: only from pending_review", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const live = await makeMaterial(creator.userId, "published");

  const result = await materialReview.requestChanges(live, admin, {
    reasonCode: "ip_concern",
    note: "已上架的教材必須走檢舉流程處理",
  });
  assert.equal(result.code, "invalid_transition");
  assert.equal((await readMaterial(live)).status, "published");
});

/* ---------------------------------------------------------------- *
 * Resubmit
 * ---------------------------------------------------------------- */

test("resubmit: changes_requested → pending_review keeps the same material and reason snapshot", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  await materialReview.requestChanges(id, admin, {
    reasonCode: "media_quality",
    note: "封面圖片解析度不足，請重新上傳。",
  });
  const result = await materialReview.resubmitMaterial(id, creator);
  assert.equal(result.ok, true);

  const row = await readMaterial(id);
  assert.equal(row.id, id, "resubmit must not create a new material");
  assert.equal(row.status, "pending_review");
  // 等待審核期間，創作者仍應看得到上一次的退回原因
  assert.equal(row.review_reason_code, "media_quality");

  const event = (await actionsFor(id)).find((a) => a.action === "material.resubmitted");
  assert.ok(event, "material.resubmitted must be logged");
  assert.equal(event.meta.oldStatus, "changes_requested");
  assert.equal(event.meta.newStatus, "pending_review");
  assert.equal(event.meta.previousReviewReasonCode, "media_quality");
});

test("resubmit: unpublished → pending_review (report take-down can be fixed and re-reviewed)", async () => {
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "unpublished");

  const result = await materialReview.resubmitMaterial(id, creator);
  assert.equal(result.ok, true);
  assert.equal((await readMaterial(id)).status, "pending_review");
});

test("resubmit: published material cannot be resubmitted", async () => {
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "published");

  const result = await materialReview.resubmitMaterial(id, creator);
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_transition");
});

test("resubmit: another creator cannot resubmit someone else's material (404, not 403)", async () => {
  const owner = await makeUser("teacher");
  const stranger = await makeUser("teacher");
  const id = await makeMaterial(owner.userId, "changes_requested");

  const result = await materialReview.resubmitMaterial(id, stranger);
  assert.equal(result.ok, false);
  assert.equal(result.code, "not_found");
  assert.equal((await readMaterial(id)).status, "changes_requested");
});

/* ---------------------------------------------------------------- *
 * published_at 語意：首次公開只寫一次
 * ---------------------------------------------------------------- */

test("published_at: is first publish time and is never overwritten", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  await materialReview.approveMaterial(id, admin);
  const firstPublishedAt = (await readMaterial(id)).published_at;
  assert.ok(firstPublishedAt instanceof Date);

  // 模擬檢舉下架（那條路徑由 reportAdmin.service 負責，這裡只還原狀態）
  await db.query(`UPDATE materials SET status = 'unpublished' WHERE id = $1`, [id]);
  const second = await materialReview.resubmitMaterial(id, creator);
  assert.equal(second.ok, true);

  const republish = await materialReview.approveMaterial(id, admin);
  assert.equal(republish.ok, true);
  assert.equal(republish.firstPublish, false, "second publish must not count as first");

  const row = await readMaterial(id);
  assert.equal(
    row.published_at.getTime(),
    firstPublishedAt.getTime(),
    "published_at must keep the first publish time"
  );

  // 第二次公開的時間仍然查得到 —— 它在 activity_logs 裡
  const publishEvents = (await actionsFor(id)).filter((a) => a.action === "material.published");
  assert.equal(publishEvents.length, 2);
  assert.equal(publishEvents[1].meta.firstPublish, false);
});

/* ---------------------------------------------------------------- *
 * 完整閉環
 * ---------------------------------------------------------------- */

test("full loop: submit → request changes → resubmit → approve", async () => {
  const admin = await makeUser("admin");
  const creator = await makeUser("teacher");
  const id = await makeMaterial(creator.userId, "pending_review");

  assert.equal(
    (
      await materialReview.requestChanges(id, admin, {
        reasonCode: "features_mismatch",
        note: "標註了桌遊玩法，但內容裡沒有相關步驟。",
      })
    ).ok,
    true
  );
  assert.equal((await materialReview.resubmitMaterial(id, creator)).ok, true);
  assert.equal((await materialReview.approveMaterial(id, admin)).ok, true);

  const row = await readMaterial(id);
  assert.equal(row.status, "published");
  assert.equal(row.review_reason_code, null);

  const actions = (await actionsFor(id)).map((a) => a.action);
  assert.deepEqual(actions, [
    "material.changes_requested",
    "material.resubmitted",
    "material.published",
    // 檔案升級是獨立的稽核事實：「這份教材從這一刻起交付的是這個檔案」。
    "material.file_approved",
  ]);
});
