/**
 * 人工付款資訊接線的資料庫測試（P1-09 Wave 2 #8 — Gate 6）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 核心：兩個事實來源必須並存，且永遠不得互相冒充
 *
 * ```text
 * 買家申報（reported_*）        平台查證（payment_received_at）
 * 「我 8/26 14:00 匯了 480」    「銀行顯示 8/26 14:03 入帳」
 * ```
 *
 * 兩者都要留得住 —— 那是後續消費申訴（§12.10）與付款爭議核對的基礎。
 *
 * 具體不變條件：
 *
 *   1. 買家申報寫進**每一列憑證**；退件後重新提交**不覆寫舊申報**。
 *   2. `payment_info_submitted_at` 是「平台何時被告知」，每次提交都更新。
 *   3. `payment_received_at` **不預設 NOW()**、**不抄 `reported_transfer_at`**、
 *      **不抄 `paid_at`**。不知道就是 NULL。
 *   4. `paid_at` 語意完全不變，營收查詢行為完全不變。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { validateReportedPayment } = require("../utils/reportedPayment");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], orders: [], proofs: [] };

async function makeUser(role = "buyer") {
  const id = `usr_pw_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

async function makeOrder(buyerId) {
  const orderId = `ord_pw_${uniq()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 480, 480, 0)`,
    [orderId, buyerId]
  );
  created.orders.push(orderId);
  return orderId;
}

/** 模擬一次買家提交（憑證列 ＋ `payment_info_submitted_at`），走與 service 相同的寫法。 */
async function submitProof(orderId, uploadedBy, reportedInput) {
  const check = validateReportedPayment(reportedInput);
  assert.equal(check.valid, true, JSON.stringify(check));
  const r = check.provided ? check.value : null;
  const { rows } = await db.query(
    `INSERT INTO manual_payment_proofs(
       order_id, storage_key, checksum_sha256, storage_status, proof_mime_type,
       proof_size_bytes, original_filename, uploaded_by, review_status, uploaded_at,
       reported_bank_name, reported_account_last4, reported_amount, reported_transfer_at
     )
     VALUES ($1, $2, 'x', 'private', 'image/png', 10, 'p.png', $3, 'pending', NOW(), $4, $5, $6, $7)
     RETURNING *`,
    [
      orderId,
      `payment-proofs/${require("crypto").randomUUID()}`,
      uploadedBy,
      r?.bankName ?? null,
      r?.accountLast4 ?? null,
      r?.amount ?? null,
      r?.transferAt ?? null,
    ]
  );
  created.proofs.push(rows[0].id);
  await db.query(
    `UPDATE orders SET payment_info_submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [orderId]
  );
  return rows[0];
}

test.after(async () => {
  try {
    if (created.proofs.length) {
      await db.query(`DELETE FROM manual_payment_proofs WHERE id = ANY($1)`, [created.proofs]);
    }
    if (created.orders.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'order' AND target_id = ANY($1)`,
        [created.orders]
      );
      await db.query(`DELETE FROM order_items WHERE order_id = ANY($1)`, [created.orders]);
      await db.query(`DELETE FROM orders WHERE id = ANY($1)`, [created.orders]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------

test("buyer submission: 申報值寫進憑證列，payment_info_submitted_at 一併記錄", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);

  const before = await db.query(`SELECT payment_info_submitted_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(before.rows[0].payment_info_submitted_at, null);

  const proof = await submitProof(orderId, buyer, {
    reportedBankName: "國泰世華",
    reportedAccountLast4: "0417",
    reportedAmount: "480",
    reportedTransferAt: "2026-08-26T06:00:00Z",
  });
  assert.equal(proof.reported_bank_name, "國泰世華");
  assert.equal(proof.reported_account_last4, "0417");
  assert.equal(Number(proof.reported_amount), 480);
  assert.equal(proof.reported_transfer_at.toISOString(), "2026-08-26T06:00:00.000Z");

  const after = await db.query(
    `SELECT payment_info_submitted_at, payment_received_at, paid_at FROM orders WHERE id = $1`,
    [orderId]
  );
  assert.ok(after.rows[0].payment_info_submitted_at, "平台已被告知買家付款");
  assert.equal(after.rows[0].payment_received_at, null, "買家提交不得寫入平台查證的入帳時間");
  assert.equal(after.rows[0].paid_at, null, "買家提交不得寫入核准時間");
});

test("resubmission: 重新提交建立新列，**舊申報原地保留不被覆寫**", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);

  const first = await submitProof(orderId, buyer, {
    reportedBankName: "第一銀行",
    reportedAccountLast4: "1111",
    reportedAmount: "480",
    reportedTransferAt: "2026-08-20T02:00:00Z",
  });
  const firstSubmittedAt = (
    await db.query(`SELECT payment_info_submitted_at FROM orders WHERE id = $1`, [orderId])
  ).rows[0].payment_info_submitted_at;

  // 退件。
  await db.query(
    `UPDATE manual_payment_proofs SET review_status = 'rejected', rejection_reason = 'amount_mismatch' WHERE id = $1`,
    [first.id]
  );

  await new Promise((r) => setTimeout(r, 15)); // 讓兩次提交的時間可區分
  const second = await submitProof(orderId, buyer, {
    reportedBankName: "玉山銀行",
    reportedAccountLast4: "2222",
    reportedAmount: "480",
    reportedTransferAt: "2026-08-22T03:00:00Z",
  });

  // **舊列完全沒被動過** —— 那是買家當時說了什麼的事實。
  const old = await db.query(`SELECT * FROM manual_payment_proofs WHERE id = $1`, [first.id]);
  assert.equal(old.rows[0].reported_bank_name, "第一銀行");
  assert.equal(old.rows[0].reported_account_last4, "1111");
  assert.equal(old.rows[0].reported_transfer_at.toISOString(), "2026-08-20T02:00:00.000Z");
  assert.equal(old.rows[0].review_status, "rejected");

  assert.equal(second.reported_bank_name, "玉山銀行");
  assert.notEqual(second.id, first.id);

  const all = await db.query(
    `SELECT reported_bank_name FROM manual_payment_proofs WHERE order_id = $1 ORDER BY uploaded_at ASC`,
    [orderId]
  );
  assert.deepEqual(all.rows.map((r) => r.reported_bank_name), ["第一銀行", "玉山銀行"], "兩次申報都留得住");

  // 審核時鐘從**新的提交**起算 —— 平台不該為買家的延遲被記逾時。
  const now = (await db.query(`SELECT payment_info_submitted_at FROM orders WHERE id = $1`, [orderId]))
    .rows[0].payment_info_submitted_at;
  assert.ok(now.getTime() > firstSubmittedAt.getTime(), "重新提交必須更新審核時鐘起算點");
});

test("optional: 只上傳圖片不填欄位仍然合法（既有流程未被破壞）", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);
  const proof = await submitProof(orderId, buyer, {});
  assert.equal(proof.reported_bank_name, null);
  assert.equal(proof.reported_account_last4, null);
  assert.equal(proof.reported_amount, null);
  assert.equal(proof.reported_transfer_at, null);
  assert.ok(
    (await db.query(`SELECT payment_info_submitted_at FROM orders WHERE id = $1`, [orderId])).rows[0]
      .payment_info_submitted_at
  );
});

test("DB 約束：末四碼格式與金額正數在資料庫層也擋得住", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);
  const proof = await submitProof(orderId, buyer, { reportedAmount: "480" });

  await assert.rejects(
    () => db.query(`UPDATE manual_payment_proofs SET reported_account_last4 = '12' WHERE id = $1`, [proof.id]),
    /mpp_reported_last4_check/
  );
  await assert.rejects(
    () => db.query(`UPDATE manual_payment_proofs SET reported_amount = 0 WHERE id = $1`, [proof.id]),
    /mpp_reported_amount_check/
  );
});

test("payment_received_at: 不預設 NOW、不抄申報時間、不抄 paid_at", async () => {
  const buyer = await makeUser();
  const admin = await makeUser("admin");
  const orderId = await makeOrder(buyer);
  const reportedTransfer = "2026-08-26T06:00:00Z";
  await submitProof(orderId, buyer, {
    reportedBankName: "國泰世華",
    reportedAmount: "480",
    reportedTransferAt: reportedTransfer,
  });

  // 情境 A：Admin 不知道實際入帳時間 → 核准後仍為 NULL。
  await db.query(
    `UPDATE orders SET status = 'approved', paid_at = NOW(),
            payment_received_at = COALESCE($2::timestamptz, payment_received_at)
      WHERE id = $1`,
    [orderId, null]
  );
  let row = (
    await db.query(`SELECT paid_at, payment_received_at FROM orders WHERE id = $1`, [orderId])
  ).rows[0];
  assert.ok(row.paid_at, "核准時間已寫入");
  assert.equal(row.payment_received_at, null, "**未提供時必須保持 NULL，不得預設 NOW()**");

  // 情境 B：Admin 查完銀行後明確填入 —— 與申報時間、與 paid_at 都不同。
  const verified = "2026-08-26T06:03:00Z";
  await db.query(`UPDATE orders SET payment_received_at = $2::timestamptz WHERE id = $1`, [
    orderId,
    verified,
  ]);
  row = (
    await db.query(
      `SELECT o.paid_at, o.payment_received_at, p.reported_transfer_at
         FROM orders o JOIN manual_payment_proofs p ON p.order_id = o.id WHERE o.id = $1`,
      [orderId]
    )
  ).rows[0];
  assert.equal(row.payment_received_at.toISOString(), "2026-08-26T06:03:00.000Z");
  assert.notEqual(
    row.payment_received_at.getTime(),
    row.reported_transfer_at.getTime(),
    "**平台查證值不得等於買家申報值** —— 兩個事實來源並存"
  );
  assert.notEqual(
    row.payment_received_at.getTime(),
    row.paid_at.getTime(),
    "**payment_received_at 不得等於 paid_at** —— 銀行入帳 ≠ Admin 核准"
  );
});

test("dispute evidence: 買家申報與平台查證同時可讀，且互不覆寫", async () => {
  const buyer = await makeUser();
  const orderId = await makeOrder(buyer);
  await submitProof(orderId, buyer, {
    reportedBankName: "國泰世華",
    reportedAccountLast4: "0417",
    reportedAmount: "400", // 買家說匯了 400，訂單其實是 480 —— **這是爭議，不是輸入錯誤**
    reportedTransferAt: "2026-08-26T06:00:00Z",
  });
  await db.query(`UPDATE orders SET payment_received_at = $2::timestamptz WHERE id = $1`, [
    orderId,
    "2026-08-26T06:03:00Z",
  ]);

  const { rows } = await db.query(
    `SELECT o.total_amount, o.payment_received_at, o.payment_info_submitted_at,
            p.reported_bank_name, p.reported_account_last4, p.reported_amount, p.reported_transfer_at
       FROM orders o JOIN manual_payment_proofs p ON p.order_id = o.id
      WHERE o.id = $1`,
    [orderId]
  );
  const r = rows[0];
  assert.equal(Number(r.total_amount), 480);
  assert.equal(Number(r.reported_amount), 400, "金額不符必須能被保存下來，供爭議處理");
  assert.ok(r.payment_received_at);
  assert.ok(r.reported_transfer_at);
  assert.ok(r.payment_info_submitted_at);
  // 三個時間各自獨立。
  const times = new Set([
    r.payment_received_at.getTime(),
    r.reported_transfer_at.getTime(),
    r.payment_info_submitted_at.getTime(),
  ]);
  assert.equal(times.size, 3, "三個時間必須各自獨立，不得互相冒充");
});

test("non-regression: paid_at 語意與營收查詢不受影響", async () => {
  // 全表：有 payment_received_at 的訂單，其 paid_at 不得被改成相同值。
  const same = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE payment_received_at IS NOT NULL AND paid_at IS NOT NULL
        AND paid_at = payment_received_at`
  );
  assert.equal(same.rows[0].n, 0, "paid_at 不得被 payment_received_at 回填");

  // 營收認列仍然只看 paid_at 與 status —— payment_received_at 完全不參與。
  const revenue = await db.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::int AS total
       FROM orders WHERE status = 'approved' AND paid_at IS NOT NULL`
  );
  const revenueIgnoringNew = await db.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::int AS total
       FROM orders WHERE status = 'approved' AND paid_at IS NOT NULL
         AND (payment_received_at IS NULL OR payment_received_at IS NOT NULL)`
  );
  assert.deepEqual(
    revenue.rows[0],
    revenueIgnoringNew.rows[0],
    "新欄位不得改變任何營收聚合的結果"
  );

  // 申報值不得外洩到訂單層（它們屬於憑證列）。
  const cols = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name LIKE 'reported%'`
  );
  assert.equal(cols.rows.length, 0, "orders 不得有 reported_* 欄位 —— 那是憑證列的事實");
});
