/**
 * `PRE-18` Batch 2 —— 結算期間、ageing、門檻、六期 override、撥款與標記已付。
 *
 * 這一檔跑的是**完整生命週期**：真的關閉期間、真的產生 payout item、真的消耗切片。
 * 純算術與 ageing 規則的單元測試在 `settlementAgeing.test.js`；
 * 本檔證明的是「接起來之後仍然對」。
 *
 * ⚠️ 會寫入資料，且會暫時開啟 `SETTLEMENT_WRITE_ENABLED`
 * （只在本 process 的 `process.env`，不碰任何檔案或部署設定）。
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
const settlement = require("../services/settlement.service");
const payout = require("../services/payout.service");
const reporting = require("../services/settlementReporting.service");
const { runInvariantChecks } = require("../utils/settlementInvariants");
const { refundWindowEndAt, cycleBounds } = require("../utils/settlementPolicy");

const PREFIX = "cyc18_";
const FAR_PAST = "2020-01-01T00:00:00.000Z";

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS name");
  assert.equal(rows[0].name, EXPECTED_DB);
  await applySettlementSchema(db);
});

const APPEND_ONLY_GUARDS = [
  ["creator_ledger_entries", "pre18_ledger_append_only_trg"],
  ["creator_payable_slices", "pre18_slice_write_once_trg"],
  ["settlement_hold_allocations", "pre18_hold_allocation_append_only_trg"],
  ["payout_allocations", "pre18_payout_allocation_append_only_trg"],
  ["creator_cycle_statements", "pre18_statement_immutable_trg"],
];

async function cleanup() {
  for (const [table, trigger] of APPEND_ONLY_GUARDS) {
    await db.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  }
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
    await db.query(`DELETE FROM creator_fault_classifications WHERE creator_id LIKE $1`, [like]);
    await db.query(`DELETE FROM activity_logs WHERE target_id LIKE $1`, [like]);
    await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [like]);
    await db.query(`DELETE FROM orders WHERE id LIKE $1`, [like]);
    await db.query(`DELETE FROM materials WHERE id LIKE $1`, [like]);
    await db.query(`DELETE FROM users WHERE id LIKE $1`, [like]);
    // 測試專用的遙遠未來期間。
    await db.query(`DELETE FROM payout_allocations WHERE payout_item_id IN (SELECT id FROM payout_items WHERE cycle_id LIKE '2098-%')`);
    await db.query(`DELETE FROM payout_items WHERE cycle_id LIKE '2098-%'`);
    await db.query(`DELETE FROM creator_cycle_statements WHERE cycle_id LIKE '2098-%'`);
    await db.query(`UPDATE creator_payable_slices SET settlement_cycle_id = NULL WHERE settlement_cycle_id LIKE '2098-%'`);
    await db.query(`UPDATE creator_payable_slices SET split_in_cycle_id = NULL WHERE split_in_cycle_id LIKE '2098-%'`);
    await db.query(`DELETE FROM payout_cycles WHERE id LIKE '2098-%'`);
  } finally {
    for (const [table, trigger] of APPEND_ONLY_GUARDS) {
      await db.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }
  }
}

async function inTx(fn) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** 寫入期間需要旗標；只改本 process 的環境變數。 */
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

async function makePaidOrder(tag, { items, discount = 0, paidAt = FAR_PAST }) {
  const orderId = `${PREFIX}o_${tag}`;
  const buyerId = `${PREFIX}buyer_${tag}`;
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','buyer')
     ON CONFLICT (id) DO NOTHING`,
    [buyerId, `${buyerId}@example.test`]
  );
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  await db.query(
    `INSERT INTO orders(id, user_id, status, total_amount, discount_amount, paid_at, refund_window_end)
     VALUES($1,$2,'approved',$3,$4,$5,$6)`,
    [orderId, buyerId, subtotal - discount, discount, paidAt, refundWindowEndAt(paidAt)]
  );
  for (const item of items) {
    await db.query(
      `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','teacher')
       ON CONFLICT (id) DO NOTHING`,
      [item.sellerId, `${item.sellerId}@example.test`]
    );
    const materialId = `${PREFIX}m_${tag}_${item.id}`;
    await db.query(
      `INSERT INTO materials(id, title, teacher_id, status, file_key, price)
       VALUES($1,$2,$3,'published',$4,100) ON CONFLICT (id) DO NOTHING`,
      [materialId, `fixture ${materialId}`, item.sellerId, `files/${materialId}.pdf`]
    );
    await db.query(
      `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, seller_id, subtotal)
       VALUES($1,$2,$3,$4,$5,$6,$5)`,
      [`${PREFIX}oi_${tag}_${item.id}`, orderId, materialId, `fixture ${item.id}`, item.subtotal, item.sellerId]
    );
  }
  return orderId;
}

const statementFor = (statements, creatorId) =>
  statements.find((row) => row.creator_id === creatorId);

// ---------------------------------------------------------------------------
// D1 — cycle engine
// ---------------------------------------------------------------------------

test("D1: cycle boundaries are Taipei calendar months with end-of-final-day cutoff", async () => {
  const bounds = cycleBounds("2098-02");
  assert.equal(bounds.cutoffAt.toISOString(), "2098-02-28T15:59:59.999Z");
  assert.equal(bounds.payoutDueAt.toISOString(), "2098-03-15T15:59:59.999Z");
});

test("D1: amounts eligible only after the cutoff belong to the NEXT cycle", async (t) => {
  t.after(cleanup);
  await cleanup();
  // 退款窗口在 2098-03-05 才屆滿 → 2098-02 不得納入，2098-03 才納入。
  const paidAt = "2098-02-26T02:00:00.000Z";
  const orderId = await makePaidOrder("late", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
    paidAt,
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await withWritesEnabled(async () => {
    const feb = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-02" }));
    assert.equal(Number(statementFor(feb.statements, `${PREFIX}c1`).eligible_balance), 0);
    assert.equal(feb.payoutItems.filter((p) => p.creator_id === `${PREFIX}c1`).length, 0);

    const mar = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-03" }));
    assert.equal(Number(statementFor(mar.statements, `${PREFIX}c1`).eligible_balance), 400);
    assert.equal(mar.payoutItems.filter((p) => p.creator_id === `${PREFIX}c1`).length, 1);
  });
});

test("D1: a closed cycle cannot be closed again or reopened", async (t) => {
  t.after(cleanup);
  await cleanup();
  await withWritesEnabled(async () => {
    await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-06" }));
    await assert.rejects(
      () => inTx((client) => settlement.closeCycle(client, { cycleId: "2098-06" })),
      /already closed/
    );
  });
  await assert.rejects(
    () => db.query(`UPDATE payout_cycles SET status='open' WHERE id='2098-06'`),
    /cannot be reopened/
  );
});

test("D11: closing a cycle is refused while settlement writes are disabled", async (t) => {
  t.after(cleanup);
  await cleanup();
  const previous = process.env.SETTLEMENT_WRITE_ENABLED;
  delete process.env.SETTLEMENT_WRITE_ENABLED;
  try {
    await assert.rejects(
      () => inTx((client) => settlement.closeCycle(client, { cycleId: "2098-09" })),
      /settlement writes are disabled/
    );
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM payout_cycles WHERE id='2098-09'`);
    assert.equal(rows[0].n, 0, "a refused close must not even create the cycle row");
  } finally {
    if (previous === undefined) delete process.env.SETTLEMENT_WRITE_ENABLED;
    else process.env.SETTLEMENT_WRITE_ENABLED = previous;
  }
});

test("D11: previewCycleClose computes the same numbers and writes nothing", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("preview", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  const before = await db.query(`SELECT COUNT(*)::int AS n FROM creator_cycle_statements`);
  const preview = await settlement.previewCycleClose(db, { cycleId: "2098-04" });
  const after = await db.query(`SELECT COUNT(*)::int AS n FROM creator_cycle_statements`);
  assert.equal(after.rows[0].n, before.rows[0].n, "preview must not write");
  assert.equal(preview.written, false);

  const mine = preview.statements.find((s) => s.creatorId === `${PREFIX}c1`);
  assert.equal(mine.eligibleBalance, 400);
  assert.equal(mine.payoutTriggeredReason, "threshold");

  await withWritesEnabled(async () => {
    const real = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-04" }));
    const row = statementFor(real.statements, `${PREFIX}c1`);
    assert.equal(Number(row.eligible_balance), mine.eligibleBalance, "preview matched the real close");
    assert.equal(row.payout_triggered_reason, mine.payoutTriggeredReason);
  });
});

// ---------------------------------------------------------------------------
// D3 / D4 — ageing and the six-cycle override
// ---------------------------------------------------------------------------

test("D4: cycles 1-6 carry NT$50 forward and cycle 7 releases it (off-by-one)", async (t) => {
  t.after(cleanup);
  await cleanup();
  // item_net 63 -> payable 50（63 x 4/5 = 50.4 -> round-half-up 50）
  const orderId = await makePaidOrder("aged", {
    items: [{ id: "a", subtotal: 63, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await withWritesEnabled(async () => {
    const seen = [];
    for (let month = 1; month <= 6; month += 1) {
      const cycleId = `2098-${String(month).padStart(2, "0")}`;
      const result = await inTx((client) => settlement.closeCycle(client, { cycleId }));
      const row = statementFor(result.statements, `${PREFIX}c1`);
      seen.push({
        cycleId,
        before: Number(row.ageing_cycles_before),
        after: Number(row.ageing_cycles_after),
        reason: row.payout_triggered_reason,
        paid: result.payoutItems.some((p) => p.creator_id === `${PREFIX}c1`),
      });
    }

    // 六期全部合格、全部結轉，**沒有任何一期撥款**。
    assert.deepEqual(
      seen.map((s) => s.before),
      [0, 1, 2, 3, 4, 5],
      "ageing_before carried into cycles 1..6"
    );
    assert.deepEqual(seen.map((s) => s.after), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(seen.map((s) => s.reason), Array(6).fill("none"));
    assert.equal(seen.some((s) => s.paid), false, "cycle 6 must NOT pay");

    // 第 7 期帶入的計數是 6 → override 觸發。
    const seventh = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-07" }));
    const row = statementFor(seventh.statements, `${PREFIX}c1`);
    assert.equal(Number(row.ageing_cycles_before), 6);
    assert.equal(row.payout_triggered_reason, "six_cycle_override");
    const item = seventh.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);
    assert.equal(Number(item.amount), 50, "below threshold, but released by the six-cycle override");
  });
});

test("D3: a cycle with no new earnings still counts while a positive balance carries", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("noearn", {
    items: [{ id: "a", subtotal: 63, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await withWritesEnabled(async () => {
    const first = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-01" }));
    const second = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-02" }));
    assert.equal(Number(statementFor(first.statements, `${PREFIX}c1`).earnings), 50);
    // 第二期完全沒有新收益，但計數照樣前進。
    assert.equal(Number(statementFor(second.statements, `${PREFIX}c1`).earnings), 0);
    assert.equal(Number(statementFor(second.statements, `${PREFIX}c1`).ageing_cycles_after), 2);
  });
});

test("D3: a hold active at cutoff pauses that slice; the rest keeps ageing", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("pause", {
    items: [
      { id: "a", subtotal: 125, sellerId: `${PREFIX}c1` },
      { id: "b", subtotal: 125, sellerId: `${PREFIX}c1` },
    ],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_pause_a`,
      sourceType: "consumer_complaint",
      sourceId: `${PREFIX}cc`,
      reason: "complaint under review",
    })
  );

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-05" }));
    const row = statementFor(result.statements, `${PREFIX}c1`);
    // 被 hold 的 100 不 eligible，但**仍為創作者所有**，列在 held。
    assert.equal(Number(row.held_amount), 100);
    assert.equal(Number(row.eligible_balance), 100);
    // 低於 NT$300 → 結轉，不撥款。
    assert.equal(row.payout_triggered_reason, "none");
  });
});

test("D3: a hold released before the cutoff does not erase that cycle", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("relcut", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  const opened = await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_relcut_a`,
      sourceType: "consumer_complaint",
      sourceId: `${PREFIX}cc2`,
      reason: "under review",
    })
  );
  await inTx((client) =>
    holds.releaseHold(client, { holdId: opened.hold.id, reason: "complaint dismissed" })
  );

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-05" }));
    const row = statementFor(result.statements, `${PREFIX}c1`);
    assert.equal(Number(row.held_amount), 0);
    assert.equal(Number(row.eligible_balance), 400, "cutoff-state: released before cutoff still counts");
    assert.equal(row.ageing_qualified, true);
  });
});

// ---------------------------------------------------------------------------
// D5 / D6 — threshold, payout items, allocation
// ---------------------------------------------------------------------------

test("D5: below NT$300 carries forward; reaching it pays", async (t) => {
  t.after(cleanup);
  await cleanup();
  const small = await makePaidOrder("small", {
    items: [{ id: "a", subtotal: 125, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId: small }));

  await withWritesEnabled(async () => {
    const first = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-01" }));
    const row1 = statementFor(first.statements, `${PREFIX}c1`);
    assert.equal(Number(row1.eligible_balance), 100);
    assert.equal(row1.payout_triggered_reason, "none", "below threshold carries forward");
    assert.equal(first.payoutItems.filter((p) => p.creator_id === `${PREFIX}c1`).length, 0);

    // 再賣一筆 → 累積過門檻。
    const more = await makePaidOrder("more", {
      items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
    });
    await inTx((client) => ledger.recordOrderEarnings(client, { orderId: more }));

    const second = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-02" }));
    const row2 = statementFor(second.statements, `${PREFIX}c1`);
    assert.equal(Number(row2.eligible_balance), 500, "100 carried + 400 new");
    assert.equal(row2.payout_triggered_reason, "threshold");
    assert.equal(Number(row2.opening_balance), 100, "opening balance is the prior statement");
  });
});

test("D5/D6: a multi-creator order pays each creator independently and exactly", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("multi", {
    items: [
      { id: "a", subtotal: 500, sellerId: `${PREFIX}c1` },
      { id: "b", subtotal: 400, sellerId: `${PREFIX}c2` },
    ],
    discount: 90,
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-03" }));
    // 500/900 x 90 = 50 -> net 450 -> 360 ; 400/900 x 90 = 40 -> net 360 -> 288
    assert.equal(Number(statementFor(result.statements, `${PREFIX}c1`).eligible_balance), 360);
    assert.equal(Number(statementFor(result.statements, `${PREFIX}c2`).eligible_balance), 288);

    // **門檻是逐創作者套用的**：c1 的 360 過門檻要付，c2 的 288 未過門檻要結轉。
    // 同一張訂單、同一個期間，兩人的結果不同 —— 這正是 DEC-29 §1 的要求
    // （未達門檻**不沒收、不歸零**，滾入下一期）。
    const c1Item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);
    const c2Item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c2`);
    assert.ok(c1Item, "c1 is above the threshold and must be paid");
    assert.equal(c2Item, undefined, "c2 is below the threshold and must carry forward");
    assert.equal(
      statementFor(result.statements, `${PREFIX}c2`).payout_triggered_reason,
      "none"
    );

    const paid = await inTx((client) =>
      payout.markPaid(client, { payoutItemId: c1Item.id, bankReference: `TXN-${c1Item.id}` })
    );
    assert.equal(
      paid.allocations.reduce((sum, a) => sum + Number(a.amount), 0),
      Number(c1Item.amount),
      "allocations reconcile exactly"
    );

    assert.equal(await ledger.carriedBalance(db, `${PREFIX}c1`), 0, "paid out in full");
    assert.equal(
      await ledger.carriedBalance(db, `${PREFIX}c2`),
      288,
      "c2 keeps its money — a below-threshold balance is never forfeited"
    );
  });
});

test("D6: a partial payout splits the slice and the remainder keeps its own history", async (t) => {
  t.after(cleanup);
  await cleanup();
  // 收益 600 payable，負向調整 -150 讓應付剩 450（仍高於 NT$300 門檻，故會撥款）。
  const orderId = await makePaidOrder("partialpay", {
    items: [{ id: "a", subtotal: 750, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','admin')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}admin`, `${PREFIX}admin@example.test`]
  );
  const { rows: cls } = await db.query(
    `INSERT INTO creator_fault_classifications
       (source_type, source_id, order_id, creator_id, result, reason_code, written_basis, decided_by)
     VALUES ('manual_case_record',$1,$2,$3,'creator_fault','wrong_material','documented basis',$4)
     RETURNING id`,
    [`${PREFIX}case`, orderId, `${PREFIX}c1`, `${PREFIX}admin`]
  );
  await inTx((client) =>
    ledger.recordAdjustment(client, {
      creatorId: `${PREFIX}c1`,
      amount: -150,
      faultClassificationId: cls[0].id,
      sourceType: "manual_case_record",
      sourceId: `${PREFIX}case`,
      orderId,
    })
  );

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-08" }));
    const row = statementFor(result.statements, `${PREFIX}c1`);
    assert.equal(Number(row.eligible_balance), 450, "600 earnings - 150 adjustment");

    const item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);
    const paid = await inTx((client) =>
      payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-PARTIAL" })
    );
    assert.equal(paid.allocations.reduce((s, a) => s + Number(a.amount), 0), 450);

    // 600 的切片被分割成 450（已消耗）＋ 150（留著，抵銷那筆負向調整）。
    const { rows } = await db.query(
      `SELECT s.id, s.amount, s.parent_slice_id FROM creator_payable_slices s
         JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
        WHERE e.creator_id = $1 ORDER BY s.amount`,
      [`${PREFIX}c1`]
    );
    const children = rows.filter((r) => r.parent_slice_id !== null).map((r) => Number(r.amount));
    assert.deepEqual(children.sort((a, b) => a - b), [150, 450]);
    assert.equal(await ledger.carriedBalance(db, `${PREFIX}c1`), 0, "600 - 150 - 450 = 0");
  });
});

test("D6/D7: mark-paid is not repeatable and records operator plus reference", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("once", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','admin')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}admin`, `${PREFIX}admin@example.test`]
  );

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-10" }));
    const item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);

    const paid = await inTx((client) =>
      payout.markPaid(client, {
        payoutItemId: item.id,
        bankReference: "TXN-ONCE-1",
        actorId: `${PREFIX}admin`,
      })
    );
    assert.equal(paid.payoutItem.status, "paid");
    assert.equal(paid.payoutItem.paid_by, `${PREFIX}admin`);
    assert.equal(paid.payoutItem.bank_reference, "TXN-ONCE-1");
    assert.notEqual(paid.payoutItem.paid_at, null);

    // 第二次必須被拒絕 —— 否則會產生第二筆 payout_consumption。
    await assert.rejects(
      () =>
        inTx((client) =>
          payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-ONCE-2" })
        ),
      /already paid/
    );
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM creator_ledger_entries
        WHERE creator_id = $1 AND entry_type = 'payout_consumption'`,
      [`${PREFIX}c1`]
    );
    assert.equal(rows[0].n, 1, "exactly one consumption entry");
  });
});

test("D8: a failed mark-paid leaves no partial money state and no orphan audit event", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("rollback", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-11" }));
    const item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);

    // 人為在同一 transaction 內於 markPaid 之後拋錯，模擬提交前失敗。
    await assert.rejects(
      () =>
        inTx(async (client) => {
          await payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-ROLLBACK" });
          throw new Error("simulated failure after markPaid, before COMMIT");
        }),
      /simulated failure/
    );

    const { rows: stillPending } = await db.query(
      `SELECT status, paid_at, bank_reference FROM payout_items WHERE id = $1`,
      [item.id]
    );
    assert.equal(stillPending[0].status, "pending", "payout state rolled back");
    assert.equal(stillPending[0].paid_at, null);
    assert.equal(stillPending[0].bank_reference, null);

    const { rows: allocs } = await db.query(
      `SELECT COUNT(*)::int AS n FROM payout_allocations WHERE payout_item_id = $1`,
      [item.id]
    );
    assert.equal(allocs[0].n, 0, "no allocations survived");

    const { rows: entries } = await db.query(
      `SELECT COUNT(*)::int AS n FROM creator_ledger_entries
        WHERE creator_id = $1 AND entry_type = 'payout_consumption'`,
      [`${PREFIX}c1`]
    );
    assert.equal(entries[0].n, 0, "no consumption entry survived");

    // PRE-18 §W: 稽核事件與金錢同生同死 —— 回滾後不得留下孤兒事件。
    const { rows: logs } = await db.query(
      `SELECT COUNT(*)::int AS n FROM activity_logs
        WHERE target_type = 'payout_item' AND target_id = $1 AND action = 'payout.marked_paid'`,
      [item.id]
    );
    assert.equal(logs[0].n, 0, "audit event rolled back with the money");
    assert.equal(await ledger.carriedBalance(db, `${PREFIX}c1`), 400, "balance untouched");
  });
});

test("D8: a successful mark-paid writes its audit event in the SAME transaction", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("audit", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-12" }));
    const item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);
    await inTx((client) =>
      payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-AUDIT" })
    );
    const { rows } = await db.query(
      `SELECT meta FROM activity_logs
        WHERE target_type = 'payout_item' AND target_id = $1 AND action = 'payout.marked_paid'`,
      [item.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].meta.amount, 400);
    assert.equal(rows[0].meta.trigger_reason, "threshold");
    // 銀行憑據本身不進 log —— 只記錄「有留下憑據」這件事。
    assert.equal(rows[0].meta.bank_reference_recorded, true);
    assert.equal("bank_reference" in rows[0].meta, false);
  });
});

// ---------------------------------------------------------------------------
// D12 — reporting
// ---------------------------------------------------------------------------

test("D12: reporting lines separate creator money, platform commission and suspense", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("report", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  const lines = await reporting.settlementLines(db, { creatorId: `${PREFIX}c1` });
  assert.equal(lines.creatorNetSales, 500);
  assert.equal(lines.creatorEarnings, 400);
  assert.equal(lines.platformCommission, 100);
  assert.equal(lines.held, 0);
  assert.equal(lines.paid, 0);
  assert.equal(lines.pendingPayable, 400);
  // 懸記依定義不屬於任何創作者，故單一創作者視角恆為 0。
  assert.equal(lines.unattributedSuspense, 0);

  const identity = await reporting.verifyIdentity(db, { creatorId: `${PREFIX}c1` });
  assert.equal(identity.ok, true, `identity broke: ${JSON.stringify(identity)}`);

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-02" }));
    const item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);
    await inTx((client) =>
      payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-REPORT" })
    );
  });

  const after = await reporting.settlementLines(db, { creatorId: `${PREFIX}c1` });
  assert.equal(after.paid, 400);
  assert.equal(after.pendingPayable, 0);
  assert.equal((await reporting.verifyIdentity(db, { creatorId: `${PREFIX}c1` })).ok, true);
});

test("D12: platform-wide identity holds and suspense is never platform commission", async (t) => {
  t.after(cleanup);
  const identity = await reporting.verifyIdentity(db);
  assert.equal(identity.ok, true, `platform identity broke: ${JSON.stringify(identity)}`);
  const lines = await reporting.settlementLines(db);
  assert.ok(lines.unattributedSuspense >= 0);
  assert.match(lines.notes.unattributedSuspense, /never platform revenue/);
});

test("final: invariants hold after the whole Batch 2 lifecycle", async (t) => {
  t.after(cleanup);
  const result = await runInvariantChecks(db);
  assert.equal(result.ok, true, `violations: ${JSON.stringify(result.violations, null, 2)}`);
});

// ---------------------------------------------------------------------------
// D9 — notification (DEC-20 C4)
// ---------------------------------------------------------------------------

test("D9: a failed notification does not undo the completed payout", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("notify", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await withWritesEnabled(async () => {
    const result = await inTx((client) => settlement.closeCycle(client, { cycleId: "2098-01" }));
    const item = result.payoutItems.find((p) => p.creator_id === `${PREFIX}c1`);
    await inTx((client) =>
      payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-NOTIFY" })
    );

    // SMTP 未設定時 `sendPayoutPaidEmail` 會走 sendEmailWithLog 的失敗分支。
    // 它**不得**拋出，也**不得**改變任何金錢狀態。
    const { sendPayoutPaidEmail } = require("../services/emailService");
    await sendPayoutPaidEmail(item.id);

    const { rows } = await db.query(
      `SELECT status, paid_at, bank_reference, notified_at FROM payout_items WHERE id = $1`,
      [item.id]
    );
    assert.equal(rows[0].status, "paid", "the payout stands regardless of the email outcome");
    assert.notEqual(rows[0].paid_at, null);
    assert.equal(rows[0].bank_reference, "TXN-NOTIFY");

    // `notified_at` 只在真的寄出時才寫入 —— 它是通知狀態，不是撥款狀態。
    const { rows: sent } = await db.query(
      `SELECT action FROM activity_logs
        WHERE target_type = 'payout_item' AND target_id = $1
          AND action IN ('order_email_sent','order_email_failed')`,
      [item.id]
    );
    assert.equal(sent.length, 1, "the attempt is always recorded, success or failure");
    const delivered = sent[0].action === "order_email_sent";
    assert.equal(
      rows[0].notified_at !== null,
      delivered,
      "notified_at tracks delivery, not merely the attempt"
    );

    assert.equal(await ledger.carriedBalance(db, `${PREFIX}c1`), 0);
  });
});

test("D9: the payout email carries no banking destination and no tax wording", async () => {
  const source = require("fs").readFileSync(
    require("path").join(__dirname, "..", "services", "emailService.js"),
    "utf8"
  );
  const fn = source.slice(
    source.indexOf("async function sendPayoutPaidEmail"),
    source.indexOf("module.exports")
  );
  // AD-09（收款目的地）與稅務／扣繳都還沒定案，信裡不得出現任何相關內容。
  for (const forbidden of ["bank_reference", "帳號", "分行", "扣繳", "稅", "withhold"]) {
    assert.equal(
      fn.includes(forbidden),
      false,
      `payout email must not mention "${forbidden}" (AD-09 / tax undecided)`
    );
  }
});
