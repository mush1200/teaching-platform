/**
 * Buyer `order_progress_state` 的資料庫整合測試（`COR-01`）。
 *
 *   PGDATABASE=teaching_platform_security_test node --test tests/buyerOrderProgress.db.test.js
 *   npm run test:db --prefix Backend      （已內含 PGDATABASE 設定）
 *
 * ⚠️ 這支測試會寫入資料。它**只允許**跑在 `teaching_platform_security_test`：
 *    下方有硬性 assertion，指向其他資料庫會直接中止。
 *
 * 所有 fixture id 都帶 `tp_bopstest_` 前綴，測試前後各清一次，因此可重複執行。
 *
 * 這支測試要鎖住的事：
 *   1. Buyer 的進度取決於**最新一筆憑證**，不是「歷史上曾經出現過某種憑證」
 *   2. 舊 rejected ＋ 新 pending → `reviewing`（`COR-01` 的核心 regression）
 *   3. 已核准的訂單不會因為 supersede 出來的 rejected 憑證而倒退
 *   4. `uploaded_at IS NULL` 的憑證仍能被正確判定為最新（COALESCE fallback）
 *   5. 相同 effective timestamp 時由 `id DESC` 穩定決定最新
 *   6. list 與 detail 回傳同一個 `order_progress_state`
 *   7. Admin `operational_status` 與 Buyer `order_progress_state` 對同一生命週期語意一致
 *   8. progress 完全不依賴檔案層資訊（`SEC-01` 的私有儲存欄位）
 *   9. `cancelled` 訂單不由憑證推導進度（`COR-03`）
 *  10. 退件備註只在 `rejected` 時才進 buyer payload（`COR-02`）
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
const { ORDER_PROGRESS_STATES, listBuyerOrders, getBuyerOrder } = require("../services/buyerOrders.service");
const { listOrders: listAdminOrders } = require("../services/adminOrders.service");

const PREFIX = "tp_bopstest_";
const BUYER_ID = `${PREFIX}buyer`;
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
    [BUYER_ID, `${PREFIX}buyer@example.test`]
  );
}

async function insertOrder(name, { status, paidAt = null }) {
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, paid_at)
     VALUES($1, $2, $3, 'manual_transfer', 300, 300, $4::timestamp)`,
    [oid(name), BUYER_ID, status, paidAt]
  );
}

/**
 * `uploadedAt = null` 是刻意可設的：資料庫中存在 `uploaded_at IS NULL` 的舊憑證，
 * latest-proof 排序必須靠 `COALESCE(uploaded_at, created_at)` 才不會把它們排到最後。
 *
 * `storageStatus` 也刻意可設：progress 判定**不得**看檔案層欄位（`SEC-01`）。
 */
async function insertProof(
  orderName,
  proofName,
  { reviewStatus, uploadedAt = null, createdAt, note = null, reviewedAt = null, storageStatus = "private" }
) {
  // `mpp_private_requires_storage_key`（SEC-01）：storage_status='private' 必須帶 storage_key。
  const storageKey = storageStatus === "private" ? `payment-proofs/${PREFIX}${proofName}.bin` : null;
  const proofUrl = storageStatus === "legacy_external" ? `https://example.test/${proofName}.jpg` : null;
  await db.query(
    `INSERT INTO manual_payment_proofs(
       id, order_id, review_status, uploaded_at, created_at, note, reviewed_at,
       storage_status, storage_key, proof_url
     ) VALUES($1, $2, $3, $4::timestamp, $5::timestamp, $6, $7::timestamp, $8, $9, $10)`,
    [
      `${PREFIX}${proofName}`,
      oid(orderName),
      reviewStatus,
      uploadedAt,
      createdAt,
      note,
      reviewedAt,
      storageStatus,
      storageKey,
      proofUrl,
    ]
  );
}

/**
 * Fixtures —— 每一筆對應 §41 的一個 Completion Criteria。
 *
 * `caseD_reupload` 是本輪最重要的 regression：憑證被退回、買家**已經**重新上傳後，
 * 買家看到的必須是「審核中」。舊版對全部歷史憑證做 `EXISTS rejected` 且排在
 * `EXISTS pending` 之前，於是買家永遠停在「審核未通過，請重新上傳」。
 */
async function seed() {
  await insertUser();

  // A：訂單成立、尚未上傳任何憑證 → pending
  await insertOrder("caseA_no_proof", { status: "pending_payment" });

  // B：第一次上傳、待審 → reviewing
  await insertOrder("caseB_pending", { status: "pending_payment" });
  await insertProof("caseB_pending", "pB", {
    reviewStatus: "pending",
    uploadedAt: "2026-08-01 10:00:00",
    createdAt: "2026-08-01 10:00:00",
  });

  // C：憑證被退回、尚未重新上傳 → rejected
  await insertOrder("caseC_rejected", { status: "pending_payment" });
  await insertProof("caseC_rejected", "pC", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-02 10:00:00",
    createdAt: "2026-08-02 10:00:00",
    reviewedAt: "2026-08-02 11:00:00",
    note: "影像模糊",
  });

  /*
   * D（critical）：舊 rejected ＋ 新 pending。
   * 兩筆的 storage_status 刻意不同，證明 progress 與檔案層狀態無關。
   */
  await insertOrder("caseD_reupload", { status: "pending_payment" });
  await insertProof("caseD_reupload", "pD_a_old_rejected", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-03 09:00:00",
    createdAt: "2026-08-03 09:00:00",
    reviewedAt: "2026-08-03 10:00:00",
    note: "金額不符",
    storageStatus: "legacy_external",
  });
  await insertProof("caseD_reupload", "pD_b_new_pending", {
    reviewStatus: "pending",
    uploadedAt: "2026-08-03 18:00:00",
    createdAt: "2026-08-03 18:00:00",
    storageStatus: "private",
  });

  /*
   * E：已核准，且**最新一筆**憑證是 approve 當下被 supersede 成 rejected 的兄弟憑證。
   * `orders.status = 'approved'` 必須最先短路，否則已完成的訂單會倒退成 rejected。
   */
  await insertOrder("caseE_approved", { status: "approved", paidAt: "2026-08-04 12:00:00" });
  await insertProof("caseE_approved", "pE_a_approved", {
    reviewStatus: "approved",
    uploadedAt: "2026-08-04 10:00:00",
    createdAt: "2026-08-04 10:00:00",
    reviewedAt: "2026-08-04 12:00:00",
  });
  await insertProof("caseE_approved", "pE_b_superseded", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-04 11:00:00",
    createdAt: "2026-08-04 11:00:00",
    reviewedAt: "2026-08-04 12:00:00",
    note: "superseded by approved proof",
  });

  /*
   * F：新憑證的 `uploaded_at IS NULL`，只有 `created_at` 比較新。
   * 單用 `uploaded_at DESC` 排序會讓 latest 錯誤地指向舊的 rejected 憑證。
   */
  await insertOrder("caseF_null_uploaded_at", { status: "pending_payment" });
  await insertProof("caseF_null_uploaded_at", "pF_a_old_rejected", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-05 09:00:00",
    createdAt: "2026-08-05 09:00:00",
    reviewedAt: "2026-08-05 10:00:00",
    note: "查無款項",
  });
  await insertProof("caseF_null_uploaded_at", "pF_b_new_pending", {
    reviewStatus: "pending",
    uploadedAt: null,
    createdAt: "2026-08-05 18:00:00",
  });

  /*
   * G：兩筆憑證的 effective timestamp 完全相同 → 由 `id DESC` 決定。
   * id 是 `tp_bopstest_pG_a_rejected` / `tp_bopstest_pG_b_pending`，
   * 因此 latest 必然是 `pG_b_pending`，與 SQL 的 incidental ordering 無關。
   */
  await insertOrder("caseG_tie_break", { status: "pending_payment" });
  await insertProof("caseG_tie_break", "pG_a_rejected", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-06 12:00:00",
    createdAt: "2026-08-06 12:00:00",
    reviewedAt: "2026-08-06 13:00:00",
  });
  await insertProof("caseG_tie_break", "pG_b_pending", {
    reviewStatus: "pending",
    uploadedAt: "2026-08-06 12:00:00",
    createdAt: "2026-08-06 12:00:00",
  });

  /*
   * H：憑證已核准但訂單尚未核准（審核交易之間的過渡）。
   * 既有 vocabulary 是 `proof_uploaded`，本輪不改名、不新增狀態。
   */
  await insertOrder("caseH_proof_approved", { status: "pending_payment" });
  await insertProof("caseH_proof_approved", "pH", {
    reviewStatus: "approved",
    uploadedAt: "2026-08-07 10:00:00",
    createdAt: "2026-08-07 10:00:00",
    reviewedAt: "2026-08-07 11:00:00",
  });

  /*
   * I：更長的歷史 —— pending → rejected → pending。
   * 「把兩個 EXISTS 對調」修得了 D，修不了這一筆：中間那次退件仍在歷史裡，
   * 但最新一筆是 pending，所以必須是 reviewing。
   */
  await insertOrder("caseI_long_history", { status: "pending_payment" });
  await insertProof("caseI_long_history", "pI_a_pending", {
    reviewStatus: "pending",
    uploadedAt: "2026-08-08 09:00:00",
    createdAt: "2026-08-08 09:00:00",
  });
  await insertProof("caseI_long_history", "pI_b_rejected", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-08 12:00:00",
    createdAt: "2026-08-08 12:00:00",
    reviewedAt: "2026-08-08 13:00:00",
    note: "憑證無效",
  });
  await insertProof("caseI_long_history", "pI_c_pending", {
    reviewStatus: "pending",
    uploadedAt: "2026-08-08 20:00:00",
    createdAt: "2026-08-08 20:00:00",
  });

  /*
   * J（`COR-03`）：已取消、且**完全沒有憑證**。
   * 舊版沒有 cancelled 分支，於是落到 `ELSE 'pending'` → 徽章顯示「待付款」，
   * 但同一張卡片已被列表歸進「歷史訂單」。cancelled 是 read-only 終態，
   * 沒有任何付款動作可做，進度必須是 `cancelled`。
   */
  await insertOrder("caseJ_cancelled_no_proof", { status: "cancelled" });

  /*
   * K（`COR-03`）：已取消，但歷史上留有一筆被退回的憑證。
   * 證明 cancelled 的短路**先於**憑證判斷 —— 否則這一筆會顯示「審核未通過，請重新上傳」。
   */
  await insertOrder("caseK_cancelled_with_proof", { status: "cancelled" });
  await insertProof("caseK_cancelled_with_proof", "pK_rejected", {
    reviewStatus: "rejected",
    uploadedAt: "2026-08-09 10:00:00",
    createdAt: "2026-08-09 10:00:00",
    reviewedAt: "2026-08-09 11:00:00",
    note: "金額不符",
  });
}

/** 每一筆 fixture 的期望值；list / detail / partition 三個測試共用同一份表。 */
const EXPECTED = Object.freeze({
  caseA_no_proof: "pending",
  caseB_pending: "reviewing",
  caseC_rejected: "rejected",
  caseD_reupload: "reviewing",
  caseE_approved: "approved",
  caseF_null_uploaded_at: "reviewing",
  caseG_tie_break: "reviewing",
  caseH_proof_approved: "proof_uploaded",
  caseI_long_history: "reviewing",
  caseJ_cancelled_no_proof: "cancelled",
  caseK_cancelled_with_proof: "cancelled",
});

async function listByName() {
  const rows = await listBuyerOrders(BUYER_ID);
  const byName = new Map();
  for (const row of rows) {
    if (String(row.id).startsWith(PREFIX)) byName.set(String(row.id).slice(PREFIX.length), row);
  }
  return byName;
}

test("buyer order progress state", async (t) => {
  const dbNameRes = await db.query("SELECT current_database() AS d");
  assert.equal(dbNameRes.rows[0].d, EXPECTED_DB, "connected to the wrong database");

  await cleanup();
  await seed();
  t.after(cleanup);

  const list = await listByName();

  await t.test("Case A — pending_payment 無憑證 → pending", () => {
    assert.equal(list.get("caseA_no_proof").order_progress_state, "pending");
    assert.equal(list.get("caseA_no_proof").payment_proof_latest_status, null);
    assert.equal(list.get("caseA_no_proof").payment_proof_uploaded_count, 0);
  });

  await t.test("Case B — pending_payment + pending proof → reviewing", () => {
    const row = list.get("caseB_pending");
    assert.equal(row.order_progress_state, "reviewing");
    assert.equal(row.payment_proof_latest_status, "pending");
  });

  await t.test("Case C — pending_payment + 最新憑證 rejected → rejected", () => {
    const row = list.get("caseC_rejected");
    assert.equal(row.order_progress_state, "rejected");
    assert.equal(row.payment_proof_latest_status, "rejected");
  });

  await t.test("Case D (critical) — 舊 rejected + 新 pending → reviewing", () => {
    const row = list.get("caseD_reupload");
    assert.equal(row.order_progress_state, "reviewing", "重新上傳後必須顯示審核中");
    assert.notEqual(row.order_progress_state, "rejected", "歷史 rejected 不得覆蓋目前 active pending");
    assert.equal(row.payment_proof_latest_status, "pending");
    assert.equal(row.payment_proof_uploaded_count, 2, "歷史憑證仍在，只是不再決定進度");
  });

  await t.test("Case E — approved 訂單即使最新憑證是 rejected 也不倒退", () => {
    const row = list.get("caseE_approved");
    assert.equal(row.order_progress_state, "approved");
    // 最新一筆確實是 supersede 出來的 rejected —— 短路的必要性由這一行證明。
    assert.equal(row.payment_proof_latest_status, "rejected");
  });

  await t.test("Case F — uploaded_at IS NULL 但 created_at 較新 → 仍取到新憑證", () => {
    const row = list.get("caseF_null_uploaded_at");
    assert.equal(row.order_progress_state, "reviewing");
    assert.equal(row.payment_proof_latest_status, "pending");
  });

  await t.test("Case G — effective timestamp 相同時由 id DESC 穩定決定", () => {
    const row = list.get("caseG_tie_break");
    assert.equal(row.payment_proof_latest_status, "pending", "id 較大的 pG_b_pending 才是最新");
    assert.equal(row.order_progress_state, "reviewing");
  });

  await t.test("Case H — 憑證已核准但訂單未核准 → proof_uploaded（既有 vocabulary）", () => {
    assert.equal(list.get("caseH_proof_approved").order_progress_state, "proof_uploaded");
  });

  await t.test("Case I — pending → rejected → pending 仍是 reviewing", () => {
    const row = list.get("caseI_long_history");
    assert.equal(row.order_progress_state, "reviewing", "只有最新一筆憑證決定進度");
    assert.equal(row.payment_proof_uploaded_count, 3);
  });

  await t.test("Case J (COR-03) — cancelled 且無憑證 → cancelled，不是 pending", () => {
    const row = list.get("caseJ_cancelled_no_proof");
    assert.equal(row.order_progress_state, "cancelled");
    assert.notEqual(
      row.order_progress_state,
      "pending",
      "已取消的訂單不得顯示待付款：列表同時把它歸進歷史訂單，兩者會互相矛盾"
    );
    assert.equal(row.payment_proof_uploaded_count, 0);
  });

  await t.test("Case K (COR-03) — cancelled 的短路先於憑證判斷", () => {
    const row = list.get("caseK_cancelled_with_proof");
    assert.equal(row.order_progress_state, "cancelled");
    assert.notEqual(
      row.order_progress_state,
      "rejected",
      "已取消的訂單不得叫買家重新上傳憑證"
    );
    assert.equal(row.payment_proof_latest_status, "rejected", "歷史憑證仍在，只是不再決定進度");
  });

  await t.test("COR-02 — 退件備註只在 rejected 時進 buyer payload", async () => {
    // 真的被退件：note 與 reason 必須照常回傳，否則買家不知道為什麼要重傳。
    const rejected = await getBuyerOrder(oid("caseC_rejected"));
    assert.equal(rejected.order_progress_state, "rejected");
    assert.equal(rejected.payment_proof_rejected_note, "影像模糊");

    /*
     * 已核准：approve 當下 supersede 出來的兄弟憑證帶著營運字串
     * `superseded by approved proof`。那是寫給營運看的，不是給買家的退件理由 ——
     * payload 不得夾帶它（`COR-02`）。
     */
    const approved = await getBuyerOrder(oid("caseE_approved"));
    assert.equal(approved.order_progress_state, "approved");
    assert.equal(
      approved.payment_proof_rejected_note,
      null,
      "已核准訂單的 payload 不得帶內部備註 superseded by approved proof"
    );
    assert.equal(approved.payment_proof_rejected_reason, null);

    // 已取消：同樣沒有可行動的退件理由。
    const cancelled = await getBuyerOrder(oid("caseK_cancelled_with_proof"));
    assert.equal(cancelled.order_progress_state, "cancelled");
    assert.equal(cancelled.payment_proof_rejected_note, null);
    assert.equal(cancelled.payment_proof_rejected_reason, null);

    // 進度中的訂單也不得看到歷史退件備註。
    const reuploaded = await getBuyerOrder(oid("caseD_reupload"));
    assert.equal(reuploaded.order_progress_state, "reviewing");
    assert.equal(
      reuploaded.payment_proof_rejected_note,
      null,
      "已重新上傳、正在審核中時不得再顯示上一次的退件備註"
    );
  });

  await t.test("list 與 detail 的 order_progress_state 完全一致", async () => {
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const listed = list.get(name);
      assert.ok(listed, `${name} 應出現在 /me/orders`);
      assert.equal(listed.order_progress_state, expected, `${name} 的 list 進度`);

      const detail = await getBuyerOrder(oid(name));
      assert.ok(detail, `${name} 應可讀取 detail`);
      assert.equal(detail.order_progress_state, expected, `${name} 的 detail 進度`);
      assert.equal(
        detail.order_progress_state,
        listed.order_progress_state,
        `${name}：列表與詳情不得給出不同答案`
      );
      assert.equal(detail.payment_proof_latest_status, listed.payment_proof_latest_status);
    }
  });

  await t.test("order_progress_state 永遠落在既有 vocabulary 內", () => {
    for (const row of list.values()) {
      assert.ok(
        ORDER_PROGRESS_STATES.includes(row.order_progress_state),
        `未預期的 progress state: ${row.order_progress_state}`
      );
    }
  });

  await t.test("Admin operational_status 與 Buyer order_progress_state 語意一致", async () => {
    /*
     * `listOrders()` 自 `IA-06` 起回傳 `{ items, pagination }` 並且**有分頁**。
     * 用 `q = PREFIX` 把結果收斂到本檔的 fixture，既不受資料庫既有資料影響，
     * 也不會因為 fixture 掉到第二頁而讓這支語意一致性測試假性失敗。
     */
    const { items: adminRows } = await listAdminOrders({ q: PREFIX, limit: 100 });
    const adminByName = new Map(
      adminRows
        .filter((r) => String(r.id).startsWith(PREFIX))
        .map((r) => [String(r.id).slice(PREFIX.length), r])
    );

    // 重新上傳：Admin 要處理它（待審核），Buyer 看到的是審核中。字不同，語意相同。
    assert.equal(adminByName.get("caseD_reupload").operational_status, "pending_review");
    assert.equal(list.get("caseD_reupload").order_progress_state, "reviewing");

    // 尚未重新上傳：Admin 是「付款被退回」，Buyer 是「審核未通過」。
    assert.equal(adminByName.get("caseC_rejected").operational_status, "payment_rejected");
    assert.equal(list.get("caseC_rejected").order_progress_state, "rejected");

    // 已核准：兩邊都不因 supersede 出來的 rejected 憑證倒退。
    assert.equal(adminByName.get("caseE_approved").operational_status, "approved");
    assert.equal(list.get("caseE_approved").order_progress_state, "approved");

    // 尚未上傳：Admin 待付款、Buyer 待付款。
    assert.equal(adminByName.get("caseA_no_proof").operational_status, "awaiting_payment");
    assert.equal(list.get("caseA_no_proof").order_progress_state, "pending");

    // 兩邊必須指向同一筆最新憑證。
    for (const name of Object.keys(EXPECTED)) {
      assert.equal(
        adminByName.get(name).payment_proof_latest_status ?? null,
        list.get(name).payment_proof_latest_status ?? null,
        `${name}：Admin 與 Buyer 的最新憑證不一致`
      );
    }
  });

  await t.test("progress 不依賴檔案層資訊，回應也不得洩漏私有儲存欄位（SEC-01）", async () => {
    // caseD 的兩筆憑證 storage_status 不同（legacy_external / private），進度仍由 review_status 決定。
    assert.equal(list.get("caseD_reupload").order_progress_state, "reviewing");

    const leaky = ["storage_key", "checksum_sha256", "uploaded_by", "storage_status", "proof_url"];
    for (const row of list.values()) {
      for (const key of leaky) {
        assert.ok(!(key in row), `/me/orders 不得回傳 ${key}`);
      }
    }
    const detail = await getBuyerOrder(oid("caseD_reupload"));
    for (const key of leaky) {
      assert.ok(!(key in detail), `/me/orders/:orderId 不得回傳 ${key}`);
    }
  });
});
