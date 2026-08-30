/**
 * 申訴證據交付的資料庫／授權測試（P1-09 Wave 2 #13 — Gate 4 / `N3`）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * Wave 2 #13 之前，證據是 **write-only**：`POST /me/complaints/:id/evidence` 寫得進去、
 * `listEvidence()` 列得出檔名，但**沒有任何路徑能把位元組取回來**。
 * 對付款爭議而言那等於沒有證據 —— Admin 裁決時只剩平台自己的紀錄可看，
 * 正是 `R7`（「限以企業經營者所保存之電子交易資料為認定依據」）要被 `N3` 打破的狀態。
 *
 * 本檔測的不變條件：
 *
 *   1. **Ownership 來自 `consumer_complaints.buyer_id`**，不是 `orders.user_id`
 *      —— 申訴可以完全沒有 `order_id`（帳號遭冒用），那種案件的證據仍必須讀得到。
 *   2. **IDOR 綁定**：`evidence.complaint_id` 必須等於路由上的 complaintId。
 *      光靠 evidence id 猜不到別人的證據，Admin 身分也不豁免這條綁定。
 *   3. **`storage_key` / `checksum_sha256` 永遠不外流** —— 新增 retrieval 不得成為洩漏管道。
 *   4. 有紀錄但沒有位元組的兩種情況，回**不同且確定性**的錯誤：
 *      純文字外部參照 → 409（重試無用）／實體檔案不見 → 503（基礎設施問題）。
 *   5. 畸形 storage key **不得** crash、不得洩漏檔案系統路徑。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const complaints = require("../services/consumerComplaint.service");
const { getPrivateFileStorage } = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], complaints: [], keys: [] };

// 1×1 PNG —— 與 upload 路徑的 magic-byte 驗證一致的真實位元組。
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

async function makeUser(role = "buyer") {
  const id = `usr_ced_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function openComplaint(buyerId) {
  // 刻意**不帶 orderId** —— 這正是 ownership 不能靠訂單的情境。
  const r = await complaints.createComplaint({
    buyerId,
    complaintType: "payment",
    subject: "匯款未入帳",
    statement: "已於 8/26 匯款，附銀行證明。",
    actorId: buyerId,
  });
  assert.ok(r.ok, `createComplaint failed: ${r.code}`);
  created.complaints.push(r.complaint.id);
  return r.complaint;
}

/** 寫入一份真的有位元組的證據（走 storage.put，key 由 storage 產生）。 */
async function addFileEvidence(complaintId, uploadedBy, filename = "匯款證明.png") {
  const storage = getPrivateFileStorage();
  const stored = await storage.put(Readable.from(PNG), {
    namespace: NAMESPACES.COMPLAINT_EVIDENCE,
  });
  created.keys.push(stored.storageKey);
  const r = await complaints.addEvidence({
    complaintId,
    uploadedBy,
    file: {
      storageKey: stored.storageKey,
      originalFilename: filename,
      mimeType: "image/png",
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
    },
    actorRole: "buyer",
  });
  assert.ok(r.ok, `addEvidence failed: ${r.code}`);
  return { evidence: r.evidence, storageKey: stored.storageKey, checksum: stored.checksumSha256 };
}

const asBuyer = (id) => ({ userId: id, role: "buyer" });
const asAdmin = (id) => ({ userId: id, role: "admin" });

test.after(async () => {
  const storage = getPrivateFileStorage();
  try {
    for (const key of created.keys) await storage.delete(key).catch(() => {});
    if (created.complaints.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'consumer_complaint' AND target_id = ANY($1)`,
        [created.complaints]
      );
      await db.query(`DELETE FROM consumer_complaints WHERE id = ANY($1)`, [created.complaints]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("買家可讀自己申訴的證據 —— 且 ownership 來自 buyer_id 而非訂單", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);
  assert.equal(c.order_id, null, "本案刻意沒有 order_id");

  const { evidence } = await addFileEvidence(c.id, buyer);
  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: evidence.id,
    user: asBuyer(buyer),
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.isOwner, true);
  assert.equal(resolved.isAdmin, false);

  const opened = await complaints.openEvidenceForDelivery(resolved.evidence);
  assert.equal(opened.ok, true);
  assert.equal(opened.sizeBytes, PNG.length, "交付長度必須等於原始位元組長度");

  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), PNG, "取回的位元組必須與上傳的完全相同");
});

test("Admin 可讀任何申訴的證據", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const c = await openComplaint(buyer);
  const { evidence } = await addFileEvidence(c.id, buyer);

  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: evidence.id,
    user: asAdmin(admin),
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.isAdmin, true);
  assert.equal(resolved.isOwner, false, "Admin 不是擁有者，但仍獲授權");
});

test("其他買家不得讀取 —— 403 forbidden", async () => {
  const buyer = await makeUser();
  const stranger = await makeUser();
  const c = await openComplaint(buyer);
  const { evidence } = await addFileEvidence(c.id, buyer);

  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: evidence.id,
    user: asBuyer(stranger),
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "forbidden");
  assert.equal(complaints.statusForEvidenceCode(resolved.code), 403);
  assert.equal(resolved.evidence, undefined, "被拒絕時不得回傳任何證據資料");
});

test("未帶身分（anonymous）不得讀取", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);
  const { evidence } = await addFileEvidence(c.id, buyer);

  for (const user of [undefined, null, {}, { userId: null, role: null }]) {
    const resolved = await complaints.resolveEvidenceForAccess({
      complaintId: c.id,
      evidenceId: evidence.id,
      user,
    });
    assert.equal(resolved.ok, false, `user=${JSON.stringify(user)} 不得通過`);
    assert.equal(resolved.code, "forbidden");
  }
});

test("**IDOR**：帶著 A 申訴的路由 + B 申訴的證據 id → 拒絕（Admin 也一樣）", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const a = await openComplaint(buyer);
  const b = await openComplaint(buyer);
  const evB = (await addFileEvidence(b.id, buyer)).evidence;

  // 同一個買家、兩件都是自己的申訴 —— 授權會過，但**資源綁定必須擋下來**。
  const asOwner = await complaints.resolveEvidenceForAccess({
    complaintId: a.id,
    evidenceId: evB.id,
    user: asBuyer(buyer),
  });
  assert.equal(asOwner.ok, false);
  assert.equal(asOwner.code, "evidence_not_found");
  assert.equal(complaints.statusForEvidenceCode(asOwner.code), 404);

  // Admin 身分**不豁免**綁定。
  const asAdminUser = await complaints.resolveEvidenceForAccess({
    complaintId: a.id,
    evidenceId: evB.id,
    user: asAdmin(admin),
  });
  assert.equal(asAdminUser.ok, false);
  assert.equal(asAdminUser.code, "evidence_not_found");
});

test("不存在的申訴 → 404 complaint_not_found；不存在的證據 → 404 evidence_not_found", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);

  const noComplaint = await complaints.resolveEvidenceForAccess({
    complaintId: "cmp_does_not_exist",
    evidenceId: "evd_whatever",
    user: asBuyer(buyer),
  });
  assert.equal(noComplaint.code, "complaint_not_found");
  assert.equal(complaints.statusForEvidenceCode(noComplaint.code), 404);

  const noEvidence = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: "evd_does_not_exist",
    user: asBuyer(buyer),
  });
  assert.equal(noEvidence.code, "evidence_not_found");
});

test("純文字外部參照沒有位元組 → 409（確定性，且不回退到任何公開路徑）", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);
  const r = await complaints.addEvidence({
    complaintId: c.id,
    uploadedBy: buyer,
    externalReference: "已向台北市消費者服務中心申訴，案號 2026-0827-001",
    actorRole: "buyer",
  });
  assert.ok(r.ok);

  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: r.evidence.id,
    user: asBuyer(buyer),
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "evidence_file_unavailable");
  assert.equal(complaints.statusForEvidenceCode(resolved.code), 409);
  assert.ok(!/private-storage|[A-Za-z]:\\|\/var\//.test(resolved.message), "訊息不得洩漏路徑");
});

test("DB 有列、實體檔案不見 → 503（不是 404），且不洩漏路徑", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);
  const { evidence, storageKey } = await addFileEvidence(c.id, buyer);

  // 模擬儲存後端出事：只刪實體，保留 DB 列。
  await getPrivateFileStorage().delete(storageKey);

  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: evidence.id,
    user: asBuyer(buyer),
  });
  assert.equal(resolved.ok, true, "resolve 仍成功 —— 資料是對的");

  const opened = await complaints.openEvidenceForDelivery(resolved.evidence);
  assert.equal(opened.ok, false);
  assert.equal(opened.code, "evidence_object_missing");
  assert.equal(complaints.statusForEvidenceCode(opened.code), 503, "資料正確、基礎設施壞了 → 503");
  assert.ok(!/private-storage|[A-Za-z]:\\|\/var\//.test(opened.message), "訊息不得洩漏路徑");
});

test("畸形 / 越界 storage key 不得 crash，且不得逃出 storage root", async () => {
  for (const key of [
    "../../../../etc/passwd",
    "complaint-evidence/../../payment-proofs/x",
    "not-a-namespace/abc",
    "",
    "complaint-evidence/not-a-uuid",
  ]) {
    const opened = await complaints.openEvidenceForDelivery({ storage_key: key });
    assert.equal(opened.ok, false, `key=${key} 不得成功`);
    assert.equal(opened.code, "evidence_object_missing");
    assert.ok(!/passwd|[A-Za-z]:\\|\/etc\//.test(opened.message), `key=${key} 訊息不得洩漏路徑`);
  }
});

test("`storage_key` / `checksum_sha256` 不出現在任何回給 client 的形狀", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);
  const { evidence } = await addFileEvidence(c.id, buyer);

  // 1) addEvidence 的回傳（201 body）
  assert.equal("storage_key" in evidence, false);
  assert.equal("checksum_sha256" in evidence, false);

  // 2) listEvidence（Buyer 與 Admin 詳情頁共用）
  const listed = await complaints.listEvidence(c.id);
  assert.ok(listed.length >= 1);
  for (const row of listed) {
    assert.equal("storage_key" in row, false, "listEvidence 不得含 storage_key");
    assert.equal("checksum_sha256" in row, false, "listEvidence 不得含 checksum");
    assert.equal(row.has_file, true, "改以 has_file 表達「有沒有檔案」");
  }
  assert.ok(!JSON.stringify(listed).includes("complaint-evidence/"), "序列化後也不得出現 key");
});

test("resolve 內部拿得到 storage_key（供串流用），但那是 service 內部形狀", async () => {
  const buyer = await makeUser();
  const c = await openComplaint(buyer);
  const { evidence, storageKey } = await addFileEvidence(c.id, buyer);

  const resolved = await complaints.resolveEvidenceForAccess({
    complaintId: c.id,
    evidenceId: evidence.id,
    user: asBuyer(buyer),
  });
  assert.equal(resolved.evidence.storage_key, storageKey, "串流需要它");
  // 但路由交出去的只有 mime_type / original_filename（見 routes 的 sendFileDownload 呼叫）。
  assert.equal(resolved.evidence.checksum_sha256, undefined, "checksum 連 resolve 都不取");
});

test("MIME 政策未被本輪擴張 —— 仍只有 JPEG / PNG / WebP，沒有 PDF", () => {
  const policy = require("../utils/paymentProofPolicy");
  assert.deepEqual(
    [...policy.ALLOWED_MIME_TYPES].sort(),
    ["image/jpeg", "image/png", "image/webp"],
    "Wave 2 #13 不得順手開放新型別"
  );
  assert.equal(
    policy.ALLOWED_MIME_TYPES.includes("application/pdf"),
    false,
    "PDF 是獨立的產品／安全決策，不在本輪 scope"
  );

  // 上傳路徑確實用的是這一份 allowlist，而不是自己另寫一套。
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "complaints.js"), "utf8");
  assert.ok(src.includes('require("../utils/paymentProofPolicy")'), "證據上傳沿用同一份型別政策");
});

test("兩條交付路由共用同一個 resolver，且都綁 complaintId", () => {
  const buyerSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "complaints.js"), "utf8");
  const adminSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "admin.js"), "utf8");

  for (const [name, src] of [["complaints.js", buyerSrc], ["admin.js", adminSrc]]) {
    assert.ok(
      src.includes("resolveEvidenceForAccess"),
      `${name} 必須使用共用 resolver，不得自行查 DB`
    );
    assert.ok(
      src.includes("openEvidenceForDelivery") && src.includes("sendFileDownload"),
      `${name} 必須沿用既有 private-file 交付 helper`
    );
    assert.ok(
      !/FROM consumer_complaint_evidence/.test(src),
      `${name} 不得自己下 evidence 查詢（會繞過 IDOR 綁定）`
    );
  }
});

test("稽核只在明示下載時寫入 —— inline 預覽不得灌爆 activity log", () => {
  const buyerSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "complaints.js"), "utf8");
  const adminSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "admin.js"), "utf8");

  for (const [name, src] of [["complaints.js", buyerSrc], ["admin.js", adminSrc]]) {
    const idx = src.indexOf("complaint_evidence_downloaded");
    assert.ok(idx > 0, `${name} 缺少下載稽核 action`);
    // 稽核呼叫必須包在 `asDownload` 判斷內。
    const before = src.slice(Math.max(0, idx - 800), idx);
    assert.ok(before.includes("asDownload"), `${name} 的稽核必須以 ?download=1 為條件`);
    // storage key 不得進稽核 meta。
    const after = src.slice(idx, idx + 400);
    assert.ok(!after.includes("storage_key"), `${name} 稽核 meta 不得含 storage_key`);
  }
});
