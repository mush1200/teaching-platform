/**
 * `PRE-18` Batch 3 —— **完整生命週期的非 production 證明**。
 *
 * 前面兩支 DB 測試各自證明零件正確；這一支證明**整條路走得通**，
 * 而且走完之後帳still 平。三個劇本：
 *
 *   1. 付款訂單 → earning → 切片 → 退款窗口 → 部分 hold → 解除 → ageing →
 *      未達門檻結轉 → 門檻撥付 → payout item → allocation → 標記已付 → 稽核 → 通知
 *   2. 創作者過失退款 → 分類 → 負向調整 → 未來收益沖抵
 *   3. `seller_id IS NULL` → 懸記 → 日後可靠歸屬 → 對帳分錄（含 80／20 拆分）→ 應付
 *
 * **不開 production 旗標**：只在本 process 的 `process.env` 暫時開啟寫入，
 * 結束即還原，不碰任何檔案或部署設定。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { applySettlementSchema } = require("../models/settlementSchema");
const ledger = require("../services/creatorLedger.service");
const holds = require("../services/settlementHold.service");
const fault = require("../services/creatorFault.service");
const settlement = require("../services/settlement.service");
const payout = require("../services/payout.service");
const reconciliation = require("../services/settlementReconciliation.service");
const reporting = require("../services/settlementReporting.service");
const { runInvariantChecks } = require("../utils/settlementInvariants");
const { refundWindowEndAt } = require("../utils/settlementPolicy");

const PREFIX = "e2e18_";
const FAR_PAST = "2020-01-01T00:00:00.000Z";

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS name");
  assert.equal(rows[0].name, EXPECTED_DB);
  await applySettlementSchema(db);
});

const GUARDS = [
  ["creator_ledger_entries", "pre18_ledger_append_only_trg"],
  ["creator_payable_slices", "pre18_slice_write_once_trg"],
  ["settlement_hold_allocations", "pre18_hold_allocation_append_only_trg"],
  ["payout_allocations", "pre18_payout_allocation_append_only_trg"],
  ["creator_cycle_statements", "pre18_statement_immutable_trg"],
  ["reconciliation_dispositions", "pre18_disposition_append_only_trg"],
];

async function cleanup() {
  for (const [t, g] of GUARDS) await db.query(`ALTER TABLE ${t} DISABLE TRIGGER ${g}`);
  try {
    const like = `${PREFIX}%`;
    await db.query(`DELETE FROM payout_allocations WHERE payout_item_id IN (SELECT id FROM payout_items WHERE creator_id LIKE $1)`, [like]);
    await db.query(`DELETE FROM payout_items WHERE creator_id LIKE $1`, [like]);
    await db.query(`DELETE FROM creator_cycle_statements WHERE creator_id LIKE $1`, [like]);
    await db.query(`DELETE FROM settlement_hold_allocations WHERE hold_id IN (SELECT id FROM settlement_holds WHERE order_id LIKE $1)`, [like]);
    await db.query(`DELETE FROM settlement_holds WHERE order_id LIKE $1`, [like]);
    await db.query(`DELETE FROM unattributed_suspense_entries WHERE order_id LIKE $1`, [like]);
    await db.query(`DELETE FROM creator_payable_slices WHERE ledger_entry_id IN (SELECT id FROM creator_ledger_entries WHERE creator_id LIKE $1)`, [like]);
    await db.query(`DELETE FROM creator_ledger_entries WHERE creator_id LIKE $1`, [like]);
    await db.query(`DELETE FROM creator_fault_classifications WHERE creator_id LIKE $1 OR source_id LIKE $1`, [like]);
    // 處置的 `decided_by` 是 RESTRICT（稽核紀錄不得失去操作者），
    // 因此必須在刪 users 之前先清掉 fixture 處置。
    await db.query(
      `DELETE FROM reconciliation_dispositions
        WHERE decided_by LIKE $1 OR target_id LIKE $1`,
      [like]
    );
    await db.query(`DELETE FROM reconciliation_runs WHERE run_scope LIKE $1`, [like]);
    await db.query(`DELETE FROM activity_logs WHERE target_id LIKE $1`, [like]);
    await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [like]);
    await db.query(`DELETE FROM orders WHERE id LIKE $1`, [like]);
    await db.query(`DELETE FROM materials WHERE id LIKE $1`, [like]);
    await db.query(`DELETE FROM users WHERE id LIKE $1`, [like]);
    await db.query(`DELETE FROM payout_allocations WHERE payout_item_id IN (SELECT id FROM payout_items WHERE cycle_id LIKE '2097-%')`);
    await db.query(`DELETE FROM payout_items WHERE cycle_id LIKE '2097-%'`);
    await db.query(`DELETE FROM creator_cycle_statements WHERE cycle_id LIKE '2097-%'`);
    await db.query(`UPDATE creator_payable_slices SET settlement_cycle_id = NULL WHERE settlement_cycle_id LIKE '2097-%'`);
    await db.query(`UPDATE creator_payable_slices SET split_in_cycle_id = NULL WHERE split_in_cycle_id LIKE '2097-%'`);
    await db.query(`DELETE FROM payout_cycles WHERE id LIKE '2097-%'`);
  } finally {
    for (const [t, g] of GUARDS) await db.query(`ALTER TABLE ${t} ENABLE TRIGGER ${g}`);
  }
}

async function inTx(fn) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function withWritesEnabled(fn) {
  const previous = process.env.SETTLEMENT_WRITE_ENABLED;
  process.env.SETTLEMENT_WRITE_ENABLED = "true";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.SETTLEMENT_WRITE_ENABLED;
    else process.env.SETTLEMENT_WRITE_ENABLED = previous;
  }
}

async function makeUser(id, role) {
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x',$3)
     ON CONFLICT (id) DO NOTHING`,
    [id, `${id}@example.test`, role]
  );
}

async function makePaidOrder(tag, { items, discount = 0, paidAt = FAR_PAST }) {
  const orderId = `${PREFIX}o_${tag}`;
  await makeUser(`${PREFIX}buyer_${tag}`, "buyer");
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  await db.query(
    `INSERT INTO orders(id, user_id, status, total_amount, discount_amount, paid_at, refund_window_end)
     VALUES($1,$2,'approved',$3,$4,$5,$6)`,
    [orderId, `${PREFIX}buyer_${tag}`, subtotal - discount, discount, paidAt, refundWindowEndAt(paidAt)]
  );
  for (const item of items) {
    if (item.sellerId) await makeUser(item.sellerId, "teacher");
    const materialId = `${PREFIX}m_${tag}_${item.id}`;
    await db.query(
      `INSERT INTO materials(id, title, teacher_id, status, file_key, price)
       VALUES($1,$2,$3,'published',$4,100) ON CONFLICT (id) DO NOTHING`,
      [materialId, `fixture ${materialId}`, item.sellerId ?? null, `files/${materialId}.pdf`]
    );
    await db.query(
      `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, seller_id, subtotal)
       VALUES($1,$2,$3,$4,$5,$6,$5)`,
      [`${PREFIX}oi_${tag}_${item.id}`, orderId, materialId, `fixture ${item.id}`, item.subtotal, item.sellerId ?? null]
    );
  }
  return orderId;
}

const stmt = (rows, creatorId) => rows.find((r) => r.creator_id === creatorId);

// =========================================================================
// Scenario 1 — the full happy lifecycle
// =========================================================================

test("E2E 1: paid order -> earning -> slices -> hold -> release -> carry -> payout -> audit", async (t) => {
  t.after(cleanup);
  await cleanup();
  const creator = `${PREFIX}c1`;
  await makeUser(`${PREFIX}admin`, "admin");

  // 兩個品項各 125 → payable 各 100，合計 200（低於 NT$300 門檻）。
  const orderId = await makePaidOrder("life", {
    items: [
      { id: "a", subtotal: 125, sellerId: creator },
      { id: "b", subtotal: 125, sellerId: creator },
    ],
  });

  // --- earning ＋ slices ---
  const { entries } = await inTx((c) => ledger.recordOrderEarnings(c, { orderId }));
  assert.equal(entries.length, 1, "DEC-31: one entry per creator per order");
  assert.equal(Number(entries[0].creator_net_sales), 250);
  assert.equal(Number(entries[0].amount), 200);
  assert.equal(Number(entries[0].platform_commission), 50);

  const { rows: slices } = await db.query(
    `SELECT amount FROM creator_payable_slices WHERE ledger_entry_id = $1 ORDER BY amount`,
    [entries[0].id]
  );
  assert.deepEqual(slices.map((s) => Number(s.amount)), [100, 100]);

  // --- 部分 hold（買方金額 50 → payable 40，正好整數）---
  const held = await inTx((c) =>
    holds.openHold(c, {
      orderId,
      orderItemId: `${PREFIX}oi_life_a`,
      requestedAmount: 50,
      sourceType: "refund_remedy_case",
      sourceId: `${PREFIX}rrc`,
      reason: "partial refund under review",
      actorId: `${PREFIX}admin`,
    })
  );
  assert.equal(held.degradedToFullItem, false);
  assert.equal(Number(held.allocations[0].held_amount), 40);

  await withWritesEnabled(async () => {
    // --- 期間 1：被 hold 的 40 不 eligible，其餘 160 結轉（未達門檻）---
    const c1 = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-01", actorId: `${PREFIX}admin` }));
    const s1 = stmt(c1.statements, creator);
    assert.equal(Number(s1.held_amount), 40);
    assert.equal(Number(s1.eligible_balance), 160);
    assert.equal(s1.payout_triggered_reason, "none", "below NT$300 carries forward");
    assert.equal(c1.payoutItems.filter((p) => p.creator_id === creator).length, 0);

    // --- hold 解除 ---
    await inTx((c) => holds.releaseHold(c, { holdId: held.hold.id, reason: "case closed in creator's favour", actorId: `${PREFIX}admin` }));

    // --- 期間 2：全額回到 eligible，但 200 仍低於門檻 → 繼續結轉 ---
    const c2 = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-02", actorId: `${PREFIX}admin` }));
    const s2 = stmt(c2.statements, creator);
    assert.equal(Number(s2.held_amount), 0, "released money returns to eligible");
    assert.equal(Number(s2.eligible_balance), 200);
    assert.equal(s2.payout_triggered_reason, "none");
    // ageing 續計而非歸零（DEC-33）。
    assert.equal(Number(s2.ageing_cycles_after), 2);

    // --- 新的銷售把餘額推過門檻 ---
    const more = await makePaidOrder("life2", { items: [{ id: "a", subtotal: 250, sellerId: creator }] });
    await inTx((c) => ledger.recordOrderEarnings(c, { orderId: more }));

    const c3 = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-03", actorId: `${PREFIX}admin` }));
    const s3 = stmt(c3.statements, creator);
    assert.equal(Number(s3.eligible_balance), 400, "200 carried + 200 new");
    assert.equal(s3.payout_triggered_reason, "threshold");

    // --- payout item → allocation → 標記已付 ---
    const item = c3.payoutItems.find((p) => p.creator_id === creator);
    const paid = await inTx((c) =>
      payout.markPaid(c, { payoutItemId: item.id, bankReference: "TXN-E2E-1", actorId: `${PREFIX}admin` })
    );
    assert.equal(paid.payoutItem.status, "paid");
    assert.equal(paid.allocations.reduce((s, a) => s + Number(a.amount), 0), 400);
    assert.equal(await ledger.carriedBalance(db, creator), 0);

    // --- 稽核軌跡涵蓋整條路 ---
    const { rows: log } = await db.query(
      `SELECT action FROM activity_logs
        WHERE (target_id = $1 OR target_id = $2 OR target_id = $3 OR target_id = $4)
        ORDER BY created_at, id`,
      [orderId, held.hold.id, item.id, "2097-03"]
    );
    const actions = new Set(log.map((r) => r.action));
    for (const expected of [
      "creator_ledger.earnings_recorded",
      "hold.opened",
      "hold.released",
      "settlement.cycle_closed",
      "payout.marked_paid",
    ]) {
      assert.ok(actions.has(expected), `missing audit event ${expected}`);
    }

    // --- 通知：失敗不得反轉撥款 ---
    const { sendPayoutPaidEmail } = require("../services/emailService");
    await sendPayoutPaidEmail(item.id);
    const { rows: after } = await db.query(`SELECT status FROM payout_items WHERE id = $1`, [item.id]);
    assert.equal(after[0].status, "paid", "the payout stands regardless of the email outcome");
  });

  assert.equal((await reporting.verifyIdentity(db, { creatorId: creator })).ok, true);
});

// =========================================================================
// Scenario 2 — creator-fault refund offsets future earnings
// =========================================================================

test("E2E 2: creator-fault refund -> classification -> negative adjustment -> future offset", async (t) => {
  t.after(cleanup);
  await cleanup();
  const creator = `${PREFIX}c2`;
  await makeUser(`${PREFIX}admin`, "admin");

  const first = await makePaidOrder("fault1", { items: [{ id: "a", subtotal: 500, sellerId: creator }] });
  await inTx((c) => ledger.recordOrderEarnings(c, { orderId: first }));

  await withWritesEnabled(async () => {
    // 先撥一次款，把餘額清空 —— 之後的調整就只能沖抵**未來**收益（DEC-21）。
    const c1 = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-04", actorId: `${PREFIX}admin` }));
    const item = c1.payoutItems.find((p) => p.creator_id === creator);
    await inTx((c) => payout.markPaid(c, { payoutItemId: item.id, bankReference: "TXN-E2E-2" }));
    assert.equal(await ledger.carriedBalance(db, creator), 0);

    // --- 分類（必須先存在）---
    const classification = await inTx((c) =>
      fault.classify(c, {
        sourceType: "refund_remedy_case",
        sourceId: `${PREFIX}case2`,
        orderId: first,
        orderItemId: `${PREFIX}oi_fault1_a`,
        creatorId: creator,
        result: "creator_fault",
        reasonCode: "corrupted_or_unusable_file",
        writtenBasis: "file verified unusable; creator supplied a corrupt archive",
        evidenceReference: "case-2097-04-001",
        decidedBy: `${PREFIX}admin`,
      })
    );
    assert.equal(classification.result, "creator_fault");

    // --- 負向調整（只有 creator_fault 才走得到這裡）---
    const adjustment = await inTx((c) =>
      ledger.recordAdjustment(c, {
        creatorId: creator,
        amount: -160,
        faultClassificationId: classification.id,
        sourceType: "refund_remedy_case",
        sourceId: `${PREFIX}case2`,
        orderId: first,
        orderItemId: `${PREFIX}oi_fault1_a`,
        actorId: `${PREFIX}admin`,
      })
    );
    assert.equal(Number(adjustment.amount), -160);
    assert.equal(await ledger.carriedBalance(db, creator), -160, "negative balance is permitted here");

    // --- 未來收益被沖抵 ---
    const second = await makePaidOrder("fault2", { items: [{ id: "a", subtotal: 625, sellerId: creator }] });
    await inTx((c) => ledger.recordOrderEarnings(c, { orderId: second }));

    const c2 = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-05", actorId: `${PREFIX}admin` }));
    const s2 = stmt(c2.statements, creator);
    assert.equal(Number(s2.eligible_balance), 340, "500 new earnings offset by the 160 adjustment");
    assert.equal(s2.payout_triggered_reason, "threshold");

    const item2 = c2.payoutItems.find((p) => p.creator_id === creator);
    assert.equal(Number(item2.amount), 340, "the payout is net of the offset, not gross");
    await inTx((c) => payout.markPaid(c, { payoutItemId: item2.id, bankReference: "TXN-E2E-2b" }));
    assert.equal(await ledger.carriedBalance(db, creator), 0);
  });

  assert.equal((await reporting.verifyIdentity(db, { creatorId: creator })).ok, true);
});

// =========================================================================
// Scenario 3 — unattributed item becomes payable only through reconciliation
// =========================================================================

test("E2E 3: seller_id NULL -> suspense -> reliable attribution -> reconciliation split -> payable", async (t) => {
  t.after(cleanup);
  await cleanup();
  const creator = `${PREFIX}c3`;
  await makeUser(creator, "teacher");
  await makeUser(`${PREFIX}admin`, "admin");

  const orderId = await makePaidOrder("unattr", { items: [{ id: "a", subtotal: 500, sellerId: null }] });

  // --- 未歸屬品項不得產生任何創作者應付 ---
  const { settlement: computed } = await inTx((c) => ledger.recordOrderEarnings(c, { orderId }));
  assert.equal(computed.creators.length, 0);
  assert.equal(computed.unattributed.length, 1);
  assert.equal(computed.unattributed[0].itemNetAmount, 500);

  // --- 懸記保存的是**品項淨額**，不是已經切好的 80% ---
  const { suspense } = await inTx((c) =>
    reconciliation.recordSuspense(c, {
      orderId,
      orderItemId: `${PREFIX}oi_unattr_a`,
      netAmount: 500,
      sourceType: "order",
      sourceId: orderId,
      actorId: `${PREFIX}admin`,
    })
  );
  assert.equal(Number(suspense.net_amount), 500);
  assert.equal(suspense.state, "open");

  // 懸記期間，創作者的應付仍然是 0。
  assert.equal(await ledger.carriedBalance(db, creator), 0);

  // --- 日後可靠歸屬 ---
  const run = await inTx((c) =>
    reconciliation.startRun(c, {
      runScope: `${PREFIX}scope`,
      phase: "write",
      startedBy: `${PREFIX}admin`,
      note: "attribution established from signed creator statement",
    })
  );
  const resolved = await inTx((c) =>
    reconciliation.resolveSuspense(c, {
      suspenseId: suspense.id,
      creatorId: creator,
      runId: run.id,
      evidenceReference: "signed-attribution-2097-06",
      actorId: `${PREFIX}admin`,
    })
  );

  // --- 對帳分錄保存完整的 DEC-31 三個量 ---
  assert.equal(resolved.entry.entry_type, "opening");
  assert.equal(Number(resolved.entry.creator_net_sales), 500);
  assert.equal(Number(resolved.entry.amount), 400);
  assert.equal(Number(resolved.entry.platform_commission), 100);
  assert.equal(
    Number(resolved.entry.amount) + Number(resolved.entry.platform_commission),
    Number(resolved.entry.creator_net_sales)
  );
  assert.equal(resolved.suspense.state, "resolved");
  assert.equal(resolved.suspense.resolved_entry_id, resolved.entry.id);

  // --- 對帳結果與正常結算**結構上可區分**（DEC-27 K1）---
  assert.equal(resolved.entry.source_type, "reconciliation_run");

  // --- 現在才成為可撥付的應付 ---
  await withWritesEnabled(async () => {
    const closed = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-06", actorId: `${PREFIX}admin` }));
    const s = stmt(closed.statements, creator);
    assert.equal(Number(s.eligible_balance), 400);
    assert.equal(s.payout_triggered_reason, "threshold");
    const item = closed.payoutItems.find((p) => p.creator_id === creator);
    await inTx((c) => payout.markPaid(c, { payoutItemId: item.id, bankReference: "TXN-E2E-3" }));
    assert.equal(await ledger.carriedBalance(db, creator), 0);
  });

  // --- 稽核：歸屬指派留下明示軌跡 ---
  const { rows: log } = await db.query(
    `SELECT action FROM activity_logs WHERE target_id IN ($1,$2)`,
    [suspense.id, `${PREFIX}oi_unattr_a`]
  );
  const actions = new Set(log.map((r) => r.action));
  assert.ok(actions.has("suspense.resolved"));
  assert.ok(actions.has("attribution.manually_assigned"));
});

// =========================================================================
// Part G — termination override audit
// =========================================================================

test("G: a frozen account alone never triggers a forced payout", async (t) => {
  t.after(cleanup);
  await cleanup();
  const creator = `${PREFIX}c4`;
  await makeUser(`${PREFIX}admin`, "admin");
  const orderId = await makePaidOrder("frozen", { items: [{ id: "a", subtotal: 62, sellerId: creator }] });
  await inTx((c) => ledger.recordOrderEarnings(c, { orderId }));

  // 凍結帳號 —— 這是風控動作，**不是**關係終止。
  await db.query(`UPDATE users SET account_status = 'frozen', frozen_at = NOW() WHERE id = $1`, [creator]);

  await withWritesEnabled(async () => {
    const closed = await inTx((c) => settlement.closeCycle(c, { cycleId: "2097-07", actorId: `${PREFIX}admin` }));
    const s = stmt(closed.statements, creator);
    assert.ok(Number(s.eligible_balance) > 0 && Number(s.eligible_balance) < 300);
    assert.equal(
      s.payout_triggered_reason,
      "none",
      "a freeze must never be read as a terminated relationship"
    );
    assert.equal(closed.payoutItems.filter((p) => p.creator_id === creator).length, 0);
  });
});

test("G: an explicit termination override pays below threshold and is fully audited", async (t) => {
  t.after(cleanup);
  await cleanup();
  const creator = `${PREFIX}c5`;
  await makeUser(`${PREFIX}admin`, "admin");
  const orderId = await makePaidOrder("term", { items: [{ id: "a", subtotal: 62, sellerId: creator }] });
  await inTx((c) => ledger.recordOrderEarnings(c, { orderId }));

  await withWritesEnabled(async () => {
    const closed = await inTx((c) =>
      settlement.closeCycle(c, {
        cycleId: "2097-08",
        actorId: `${PREFIX}admin`,
        terminationOverrides: [
          { creatorId: creator, reason: "creator ended the relationship on 2097-08-10; final settlement" },
        ],
      })
    );
    const s = stmt(closed.statements, creator);
    assert.equal(s.payout_triggered_reason, "termination");
    const item = closed.payoutItems.find((p) => p.creator_id === creator);
    assert.ok(item && Number(item.amount) < 300, "released regardless of amount");

    const { rows } = await db.query(
      `SELECT actor_id, meta FROM activity_logs
        WHERE target_type = 'creator' AND target_id = $1
          AND action = 'settlement.termination_override_applied'`,
      [creator]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_id, `${PREFIX}admin`, "operator identity recorded");
    assert.match(rows[0].meta.reason, /ended the relationship/);
    assert.equal(rows[0].meta.applied, true);
    assert.match(rows[0].meta.basis, /never inferred from users\.account_status/);
  });
});

test("G: a termination override without a written reason or operator is refused", async (t) => {
  t.after(cleanup);
  await cleanup();
  await withWritesEnabled(async () => {
    await assert.rejects(
      () =>
        inTx((c) =>
          settlement.closeCycle(c, {
            cycleId: "2097-09",
            actorId: `${PREFIX}admin`,
            terminationOverrides: [{ creatorId: `${PREFIX}c6`, reason: "  " }],
          })
        ),
      /a written reason is required/
    );
    await assert.rejects(
      () =>
        inTx((c) =>
          settlement.closeCycle(c, {
            cycleId: "2097-09",
            terminationOverrides: [{ creatorId: `${PREFIX}c6`, reason: "valid reason" }],
          })
        ),
      /requires an identified operator/
    );
  });
});

test("final: invariants and the reporting identity hold after every scenario", async (t) => {
  t.after(cleanup);
  const invariants = await runInvariantChecks(db);
  assert.equal(invariants.ok, true, JSON.stringify(invariants.violations, null, 2));
  const identity = await reporting.verifyIdentity(db);
  assert.equal(identity.ok, true, JSON.stringify(identity, null, 2));
});

// =========================================================================
// Part A — disposition semantics: detected != disposed != resolved
// =========================================================================

test("A: a detected DEC-27 row without a disposition blocks write-enable", async (t) => {
  t.after(cleanup);
  await cleanup();
  await makeUser(`${PREFIX}admin`, "admin");
  await makeUser(`${PREFIX}buyer_nopay`, "buyer");

  // approved + paid_at NULL —— DEC-27 §K2 的 fail-closed 族群。
  await db.query(
    `INSERT INTO orders(id, user_id, status, total_amount, paid_at)
     VALUES($1,$2,'approved',100,NULL)`,
    [`${PREFIX}o_nopay`, `${PREFIX}buyer_nopay`]
  );

  const before = await reconciliation.outstandingDispositions(db);
  assert.ok(
    before.approvedWithoutPaidAt.includes(`${PREFIX}o_nopay`),
    "the row is detected and awaiting a disposition"
  );

  // 記錄處置後，它不再是「未處置」—— 但**該列仍然存在**（DEC-27 不要求它消失）。
  const disposition = await inTx((c) =>
    reconciliation.recordDisposition(c, {
      targetType: "order",
      targetId: `${PREFIX}o_nopay`,
      category: "approved_without_paid_at",
      decision: "exclude_no_evidence",
      writtenBasis: "no bank record found for this order; excluded from payout per DEC-27 K2(b)",
      decidedBy: `${PREFIX}admin`,
    })
  );
  assert.equal(disposition.decision, "exclude_no_evidence");

  const after = await reconciliation.outstandingDispositions(db);
  assert.equal(
    after.approvedWithoutPaidAt.includes(`${PREFIX}o_nopay`),
    false,
    "recorded disposition clears the blocker"
  );
  const { rows: still } = await db.query(`SELECT id FROM orders WHERE id = $1`, [`${PREFIX}o_nopay`]);
  assert.equal(still.length, 1, "DEC-27 does not require the row to disappear");
});

test("A: a disposition cannot be undocumented, duplicated, or silently edited", async (t) => {
  t.after(cleanup);
  await cleanup();
  await makeUser(`${PREFIX}admin`, "admin");
  await makeUser(`${PREFIX}buyer_dup`, "buyer");
  await db.query(
    `INSERT INTO orders(id, user_id, status, total_amount, paid_at)
     VALUES($1,$2,'approved',100,NULL)`,
    [`${PREFIX}o_dup`, `${PREFIX}buyer_dup`]
  );

  await assert.rejects(
    () =>
      inTx((c) =>
        reconciliation.recordDisposition(c, {
          targetType: "order",
          targetId: `${PREFIX}o_dup`,
          category: "approved_without_paid_at",
          decision: "exclude_no_evidence",
          writtenBasis: "   ",
          decidedBy: `${PREFIX}admin`,
        })
      ),
    /a written basis is required/
  );

  // include_with_evidence 的前提就是有證據 —— DB 層強制。
  await assert.rejects(
    () =>
      inTx((c) =>
        reconciliation.recordDisposition(c, {
          targetType: "order",
          targetId: `${PREFIX}o_dup`,
          category: "approved_without_paid_at",
          decision: "include_with_evidence",
          writtenBasis: "bank statement reviewed",
          evidenceReference: null,
          decidedBy: `${PREFIX}admin`,
        })
      ),
    /rd_include_requires_evidence/
  );

  const first = await inTx((c) =>
    reconciliation.recordDisposition(c, {
      targetType: "order",
      targetId: `${PREFIX}o_dup`,
      category: "approved_without_paid_at",
      decision: "exclude_no_evidence",
      writtenBasis: "no reliable payment evidence",
      decidedBy: `${PREFIX}admin`,
    })
  );

  // 同一列不得有第二筆有效處置。
  await assert.rejects(
    () =>
      inTx((c) =>
        reconciliation.recordDisposition(c, {
          targetType: "order",
          targetId: `${PREFIX}o_dup`,
          category: "approved_without_paid_at",
          decision: "exclude_no_evidence",
          writtenBasis: "second opinion",
          decidedBy: `${PREFIX}admin`,
        })
      ),
    /duplicate key/
  );

  // 更正走 supersedes 鏈，原決定保留。
  const corrected = await inTx((c) =>
    reconciliation.recordDisposition(c, {
      targetType: "order",
      targetId: `${PREFIX}o_dup`,
      category: "approved_without_paid_at",
      decision: "include_with_evidence",
      writtenBasis: "bank statement located on review",
      evidenceReference: "stmt-2097-11-03",
      decidedBy: `${PREFIX}admin`,
      supersedesId: first.id,
    })
  );
  assert.equal(corrected.supersedes_id, first.id);

  // 處置是決定，不是可就地修改的欄位。
  await assert.rejects(
    () => db.query(`UPDATE reconciliation_dispositions SET decision='exclude_no_evidence' WHERE id=$1`, [first.id]),
    /append-only/
  );
  await assert.rejects(
    () => db.query(`DELETE FROM reconciliation_dispositions WHERE id=$1`, [first.id]),
    /append-only/
  );
});
