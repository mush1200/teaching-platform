/**
 * Admin Orders operational-state 篩選的資料庫整合測試。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/adminOrdersFilter.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * 所有 fixture id 都帶 `tp_aoftest_` 前綴，測試前後各清一次，因此可重複執行。
 *
 * 這支測試要鎖住的四件事：
 *   1. 「待付款」只含**尚未上傳憑證**的訂單 —— 不再把待審與被退回的一起收進來
 *   2. 「待審核」由 `manual_payment_proofs.review_status = 'pending'` 衍生，
 *      **不是** `orders.status`（更不是 dead status `paid`）
 *   3. **重新上傳**（舊 rejected + 新 pending）必須分類為 `pending_review`
 *   4. 五個 operational bucket 是 orders 的一個 partition（互斥且涵蓋全部）
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const test = require("node:test");
const assert = require("node:assert/strict");

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  throw new Error(
    `ABORT: this test writes fixtures and must run against ${EXPECTED_DB}. ` +
      `PGDATABASE is currently ${JSON.stringify(process.env.PGDATABASE)}. ` +
      "Run it via `npm run test:db --prefix Backend`."
  );
}

const db = require("../config/db");
const {
  OPERATIONAL_STATUSES,
  parseOperationalStatusQuery,
  listOrders,
} = require("../services/adminOrders.service");

const PREFIX = "tp_aoftest_";
const oid = (name) => `${PREFIX}${name}`;

async function cleanup() {
  await db.query(`DELETE FROM manual_payment_proofs WHERE order_id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM orders WHERE id LIKE $1`, [`${PREFIX}%`]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [`${PREFIX}%`]);
}

async function insertUser() {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role)
     VALUES($1, $2, 'x', 'buyer')`,
    [`${PREFIX}buyer`, `${PREFIX}buyer@example.test`]
  );
}

async function insertOrder(name, { status, paidAt = null }) {
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, paid_at)
     VALUES($1, $2, $3, 'manual_transfer', 300, 300, $4::timestamp)`,
    [oid(name), `${PREFIX}buyer`, status, paidAt]
  );
}

/**
 * `uploadedAt = null` 是刻意可設的：資料庫中存在 `uploaded_at IS NULL` 的舊憑證，
 * latest-proof 排序必須靠 `COALESCE(uploaded_at, created_at)` 才不會把它們排到最後。
 */
async function insertProof(orderName, proofName, { reviewStatus, uploadedAt = null, createdAt, note = null }) {
  await db.query(
    `INSERT INTO manual_payment_proofs(id, order_id, proof_url, review_status, uploaded_at, created_at, note)
     VALUES($1, $2, $3, $4, $5::timestamp, $6::timestamp, $7)`,
    [
      `${PREFIX}${proofName}`,
      oid(orderName),
      `https://example.test/${proofName}.jpg`,
      reviewStatus,
      uploadedAt,
      createdAt,
      note,
    ]
  );
}

/**
 * Fixtures —— 每一筆對應一個 operational state，外加重新上傳與 supersession 兩個關鍵組合。
 *
 * `case4_reupload` 是本輪最重要的 regression：舊憑證被退回、買家重新上傳後，
 * 訂單必須回到「待審核」佇列。若 CASE 的分支順序寫反（payment_rejected 先於
 * pending_review），這筆會被歸到「付款被退回」，admin 就再也看不到它。
 */
async function seed() {
  await insertUser();

  // Case 1：成立但尚未上傳憑證 → awaiting_payment
  await insertOrder("case1_no_proof", { status: "pending_payment" });

  // Case 2：已上傳、待審 → pending_review
  await insertOrder("case2_pending", { status: "pending_payment" });
  await insertProof("case2_pending", "p2", {
    reviewStatus: "pending",
    uploadedAt: "2026-08-01 10:00:00",
    createdAt: "2026-08-01 10:00:00",
  });

  // Case 3：憑證被退回、尚未重新上傳 → payment_rejected
  await insertOrder("case3_rejected", { status: "pending_payment" });
  await insertProof("case3_rejected", "p3", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-02 10:00:00",
    createdAt: "2026-08-02 10:00:00",
    note: "影像模糊",
  });

  /*
   * Case 4（critical）：舊 rejected + 新 pending。
   * 新憑證刻意 `uploaded_at IS NULL`，同時驗證 latest-proof 的 COALESCE fallback ——
   * 只用 `uploaded_at` 排序的話，latest 會錯誤地指向舊的 rejected 憑證。
   */
  await insertOrder("case4_reupload", { status: "pending_payment" });
  await insertProof("case4_reupload", "p4a_old_rejected", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-03 09:00:00",
    createdAt: "2026-08-03 09:00:00",
    note: "金額不符",
  });
  await insertProof("case4_reupload", "p4b_new_pending", {
    reviewStatus: "pending",
    uploadedAt: null,
    createdAt: "2026-08-03 18:00:00",
  });

  // Case 5：已核准，且帶著 approve 當下被 supersede 成 rejected 的兄弟憑證 → approved
  await insertOrder("case5_approved", { status: "approved", paidAt: "2026-08-04 12:00:00" });
  await insertProof("case5_approved", "p5a_superseded", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-04 10:00:00",
    createdAt: "2026-08-04 10:00:00",
    note: "superseded by approved proof",
  });
  await insertProof("case5_approved", "p5b_approved", {
    reviewStatus: "approved",
    uploadedAt: "2026-08-04 11:00:00",
    createdAt: "2026-08-04 11:00:00",
  });

  // Case 6：legacy 歷史列 → cancelled
  await insertOrder("case6_cancelled", { status: "cancelled" });
}

const FIXTURE_IDS = [
  "case1_no_proof",
  "case2_pending",
  "case3_rejected",
  "case4_reupload",
  "case5_approved",
  "case6_cancelled",
].map(oid);

/** 只取 fixture 的 id，避免斷言被資料庫既有資料干擾。 */
function fixtureIds(rows) {
  return rows.map((r) => r.id).filter((id) => id.startsWith(PREFIX));
}

async function idsFor(status) {
  return fixtureIds(await listOrders({ status }));
}

test("admin orders operational filter", async (t) => {
  const dbNameRes = await db.query("SELECT current_database() AS d");
  assert.equal(dbNameRes.rows[0].d, EXPECTED_DB, "connected to the wrong database");

  await cleanup();
  await seed();
  t.after(cleanup);

  await t.test("Case 1 — pending_payment 無憑證 → awaiting_payment", async () => {
    const awaiting = await idsFor("awaiting_payment");
    assert.ok(awaiting.includes(oid("case1_no_proof")), "應出現在待付款");

    const pendingReview = await idsFor("pending_review");
    assert.ok(!pendingReview.includes(oid("case1_no_proof")), "不得出現在待審核");
  });

  await t.test("Case 2 — pending_payment + pending proof → pending_review", async () => {
    const pendingReview = await idsFor("pending_review");
    assert.ok(pendingReview.includes(oid("case2_pending")), "應出現在待審核");

    /*
     * 這一行就是本輪修正的核心：舊版「待付款」= `orders.status='pending_payment'`，
     * 會把這筆一起收進來，真正要處理的訂單因此被淹沒在待付款清單裡。
     */
    const awaiting = await idsFor("awaiting_payment");
    assert.ok(!awaiting.includes(oid("case2_pending")), "不得出現在待付款");
  });

  await t.test("Case 3 — pending_payment + rejected proof → payment_rejected", async () => {
    const rejected = await idsFor("payment_rejected");
    assert.ok(rejected.includes(oid("case3_rejected")), "應出現在付款被退回");

    const awaiting = await idsFor("awaiting_payment");
    assert.ok(!awaiting.includes(oid("case3_rejected")), "不得出現在待付款");

    const pendingReview = await idsFor("pending_review");
    assert.ok(!pendingReview.includes(oid("case3_rejected")), "不得出現在待審核");
  });

  await t.test("Case 4 (critical) — 舊 rejected + 新 pending → pending_review", async () => {
    const pendingReview = await idsFor("pending_review");
    assert.ok(pendingReview.includes(oid("case4_reupload")), "重新上傳後必須回到待審核佇列");

    const rejected = await idsFor("payment_rejected");
    assert.ok(!rejected.includes(oid("case4_reupload")), "不得停留在付款被退回");

    // latest proof 必須靠 COALESCE(uploaded_at, created_at) 才會指向 uploaded_at 為 NULL 的新憑證。
    const [row] = (await listOrders({ status: "pending_review" })).filter((r) => r.id === oid("case4_reupload"));
    assert.equal(row.payment_proof_latest_status, "pending", "latest proof 應為新上傳的 pending 憑證");
    assert.equal(row.payment_proof_pending_review_count, 1);
  });

  await t.test("Case 5 — approved（含 superseded rejected proof）→ approved", async () => {
    const approved = await idsFor("approved");
    assert.ok(approved.includes(oid("case5_approved")), "應出現在已核准");

    for (const bucket of ["awaiting_payment", "pending_review", "payment_rejected"]) {
      const ids = await idsFor(bucket);
      assert.ok(!ids.includes(oid("case5_approved")), `不得出現在 ${bucket}`);
    }
  });

  await t.test("Case 6 — cancelled legacy 列仍可查閱", async () => {
    const cancelled = await idsFor("cancelled");
    assert.ok(cancelled.includes(oid("case6_cancelled")), "已取消歷史列必須仍看得到");
  });

  await t.test("Case 7 — 非法 status 被拒絕（route 據此回 400）", () => {
    assert.equal(parseOperationalStatusQuery("banana").valid, false);
    // dead / legacy status 不得再被當成合法 token 接受。
    for (const dead of ["paid", "completed", "pending_payment", "rejected"]) {
      assert.equal(parseOperationalStatusQuery(dead).valid, false, `${dead} 不應是合法的 operational status`);
    }
    for (const ok of OPERATIONAL_STATUSES) {
      assert.deepEqual(parseOperationalStatusQuery(ok), { valid: true, status: ok });
    }
    // 未帶或空字串 → 不篩選
    assert.deepEqual(parseOperationalStatusQuery(undefined), { valid: true, status: null });
    assert.deepEqual(parseOperationalStatusQuery("  "), { valid: true, status: null });
  });

  await t.test("Case 8 — 未帶 status 回傳全部 fixture", async () => {
    const all = await idsFor(null);
    for (const id of FIXTURE_IDS) {
      assert.ok(all.includes(id), `${id} 應出現在未篩選的清單`);
    }
  });

  await t.test("五個 bucket 是 orders 的一個 partition（互斥且涵蓋全部）", async () => {
    const totalRes = await db.query(`SELECT COUNT(*)::int AS c FROM orders`);
    const total = totalRes.rows[0].c;

    const perBucket = {};
    const seen = new Map();
    let sum = 0;
    for (const bucket of OPERATIONAL_STATUSES) {
      const rows = await listOrders({ status: bucket });
      perBucket[bucket] = rows.length;
      sum += rows.length;
      for (const row of rows) {
        const previous = seen.get(row.id);
        assert.equal(previous, undefined, `${row.id} 同時落在 ${previous} 與 ${bucket}`);
        seen.set(row.id, bucket);
        assert.equal(row.operational_status, bucket, "回傳的 operational_status 必須與篩選條件一致");
      }
    }

    assert.equal(sum, total, `bucket 總和 ${sum} 應等於訂單總數 ${total}：${JSON.stringify(perBucket)}`);
    assert.equal(seen.size, total, "每筆訂單必須恰好出現在一個 bucket");
  });

  await t.test("reconciliation — pending proof 的 distinct order 數 = 待審核訂單數", async () => {
    const distinctRes = await db.query(
      `SELECT COUNT(DISTINCT order_id)::int AS c FROM manual_payment_proofs WHERE review_status = 'pending'`
    );
    const proofCountRes = await db.query(
      `SELECT COUNT(*)::int AS c FROM manual_payment_proofs WHERE review_status = 'pending'`
    );
    const pendingReviewOrders = (await listOrders({ status: "pending_review" })).length;

    assert.equal(
      pendingReviewOrders,
      distinctRes.rows[0].c,
      "差異只可能來自「pending 憑證掛在已核准／已取消訂單上」——那本身就是需要修的資料異常"
    );

    /*
     * Dashboard 的 `pendingProofsCount` 是**憑證**數，不是訂單數：一張訂單可以同時有
     * 多張 pending 憑證。因此只能斷言 >=，不得要求兩者永遠相等。
     * （要不要改成 COUNT(DISTINCT order_id) 是獨立的產品決策，本輪不動。）
     */
    assert.ok(
      proofCountRes.rows[0].c >= pendingReviewOrders,
      "pendingProofsCount（憑證數）必須 >= 待審核訂單數"
    );
  });
});
