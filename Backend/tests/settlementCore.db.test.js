/**
 * `PRE-18` settlement core —— DB 級整合測試。
 *
 * 這一檔測的是**只有真的資料庫才能證明的東西**：row CHECK、partial UNIQUE、
 * deferred constraint trigger、以及 service 在真實 transaction 下的行為。
 * 純算術與 ageing 規則在 `settlementMoney` / `settlementPolicy` / `settlementAgeing`
 * 三支單元測試裡，不在這裡重複。
 *
 * ⚠️ 會寫入資料，因此第一個測試就是資料庫 guard。
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
const { runInvariantChecks } = require("../utils/settlementInvariants");
const { refundWindowEndAt } = require("../utils/settlementPolicy");

const PREFIX = "st18_";

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS name");
  assert.equal(rows[0].name, EXPECTED_DB);
});

test("the settlement schema applies (and re-applies) cleanly — idempotence", async () => {
  await applySettlementSchema(db);
  await applySettlementSchema(db);
  const { rows } = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (
        'payout_cycles','creator_fault_classifications','creator_ledger_entries',
        'creator_payable_slices','settlement_holds','settlement_hold_allocations',
        'unattributed_suspense_entries','creator_cycle_statements','payout_items',
        'payout_allocations','reconciliation_runs')`
  );
  assert.equal(rows.length, 11, "all eleven settlement tables must exist");
});

test("orders.refund_window_end exists and is nullable (legacy rows are never backfilled)", async () => {
  const { rows } = await db.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name = 'refund_window_end'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data_type, "timestamp without time zone");
  assert.equal(rows[0].is_nullable, "YES", "legacy orders legitimately have no persisted deadline");
});

/**
 * 這些表在正式運作中是 append-only，**刪除被 trigger 擋下**（那正是重點）。
 * 測試 fixture 需要清乾淨，因此只在**這裡**、只在測試資料庫、
 * 只在 `DELETE` 期間停用那些 guard，之後立刻恢復。
 *
 * ⚠️ 不要把這個模式帶進任何 production 程式碼 —— 那等於把 invariant 關掉。
 */
const APPEND_ONLY_GUARDS = [
  ["creator_ledger_entries", "pre18_ledger_append_only_trg"],
  ["creator_payable_slices", "pre18_slice_write_once_trg"],
  ["settlement_hold_allocations", "pre18_hold_allocation_append_only_trg"],
  ["payout_allocations", "pre18_payout_allocation_append_only_trg"],
  ["creator_cycle_statements", "pre18_statement_immutable_trg"],
];

async function withoutAppendOnlyGuards(fn) {
  for (const [table, trigger] of APPEND_ONLY_GUARDS) {
    await db.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  }
  try {
    await fn();
  } finally {
    for (const [table, trigger] of APPEND_ONLY_GUARDS) {
      await db.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }
  }
}

async function cleanup() {
  await withoutAppendOnlyGuards(deleteFixtures);
}

async function deleteFixtures() {
  const like = `${PREFIX}%`;
  await db.query(`DELETE FROM payout_allocations WHERE payout_item_id IN (SELECT id FROM payout_items WHERE creator_id LIKE $1)`, [like]);
  await db.query(`DELETE FROM payout_items WHERE creator_id LIKE $1`, [like]);
  await db.query(`DELETE FROM creator_cycle_statements WHERE creator_id LIKE $1`, [like]);
  await db.query(`DELETE FROM settlement_hold_allocations WHERE hold_id IN (SELECT id FROM settlement_holds WHERE order_id LIKE $1)`, [like]);
  await db.query(`DELETE FROM settlement_holds WHERE order_id LIKE $1`, [like]);
  await db.query(`DELETE FROM unattributed_suspense_entries WHERE order_id LIKE $1`, [like]);
  await db.query(`DELETE FROM creator_payable_slices WHERE ledger_entry_id IN (SELECT id FROM creator_ledger_entries WHERE creator_id LIKE $1)`, [like]);
  await db.query(`DELETE FROM creator_ledger_entries WHERE creator_id LIKE $1`, [like]);
  await db.query(`DELETE FROM creator_fault_classifications WHERE source_id LIKE $1 OR creator_id LIKE $1`, [like]);
  await db.query(`DELETE FROM activity_logs WHERE target_id LIKE $1`, [like]);
  await db.query(`DELETE FROM order_items WHERE order_id LIKE $1`, [like]);
  await db.query(`DELETE FROM orders WHERE id LIKE $1`, [like]);
  await db.query(`DELETE FROM materials WHERE id LIKE $1`, [like]);
  await db.query(`DELETE FROM users WHERE id LIKE $1`, [like]);
  // 測試用的結算期間（遙遠未來的 id，正式資料不會用到）。
  await db.query(`DELETE FROM payout_allocations WHERE payout_item_id IN (SELECT id FROM payout_items WHERE cycle_id LIKE '2099-%')`);
  await db.query(`DELETE FROM payout_items WHERE cycle_id LIKE '2099-%'`);
  await db.query(`DELETE FROM creator_cycle_statements WHERE cycle_id LIKE '2099-%'`);
  await db.query(`UPDATE creator_payable_slices SET settlement_cycle_id = NULL WHERE settlement_cycle_id LIKE '2099-%'`);
  await db.query(`UPDATE creator_payable_slices SET split_in_cycle_id = NULL WHERE split_in_cycle_id LIKE '2099-%'`);
  await db.query(`DELETE FROM payout_cycles WHERE id LIKE '2099-%'`);
}

/**
 * 建立一張已核准、已付款、退款窗口早已屆滿的訂單。
 *
 * `paidAt` 刻意放在遙遠的過去，讓 `refund_window_end` 遠早於任何測試 cutoff ——
 * 否則測試會在每個月的前 7 天隨機變紅。
 */
async function makePaidOrder(tag, { items, discount = 0, paidAt = "2020-01-01T00:00:00.000Z" }) {
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
    if (item.sellerId) {
      await db.query(
        `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','teacher')
         ON CONFLICT (id) DO NOTHING`,
        [item.sellerId, `${item.sellerId}@example.test`]
      );
    }
    const materialId = `${PREFIX}m_${tag}_${item.id}`;
    await db.query(
      `INSERT INTO materials(id, title, teacher_id, status, file_key, price)
       VALUES($1,$2,$3,'published',$4,$5) ON CONFLICT (id) DO NOTHING`,
      [materialId, `fixture ${materialId}`, item.sellerId ?? null, `files/${materialId}.pdf`, 100]
    );
    await db.query(
      `INSERT INTO order_items(id, order_id, material_id, title_snapshot, price_snapshot, seller_id, subtotal)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        `${PREFIX}oi_${tag}_${item.id}`,
        orderId,
        materialId,
        `fixture ${item.id}`,
        item.subtotal,
        item.sellerId ?? null,
        item.subtotal,
      ]
    );
  }
  return orderId;
}

/**
 * 關閉期間是**結算寫入**，Batch 2 起受 `SETTLEMENT_WRITE_ENABLED` 約束。
 * 只改本 process 的環境變數，不碰任何檔案或部署設定。
 */
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

test("materials fixtures satisfy the COR-09 listing price policy", async () => {
  // 這不是 PRE-18 的測試對象，但如果 fixture 違反了已上線的價格約束，
  // 下面每一個測試都會以一個誤導性的錯誤失敗。
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM materials WHERE price < 30 OR price <> trunc(price)`
  );
  assert.equal(rows[0].n, 0);
});

test("earnings: DEC-23 + DEC-24 + DEC-31 land in the ledger with exact slices", async (t) => {
  t.after(cleanup);
  await cleanup();

  const orderId = await makePaidOrder("basic", {
    items: [
      { id: "a", subtotal: 100, sellerId: `${PREFIX}c1` },
      { id: "b", subtotal: 200, sellerId: `${PREFIX}c2` },
    ],
    discount: 50,
  });

  const { entries } = await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  assert.equal(entries.length, 2);

  const byCreator = Object.fromEntries(entries.map((entry) => [entry.creator_id, entry]));
  // 100/300 × 50 = 16 → net 84 → 80% round-half-up = 67（67.2）
  assert.equal(Number(byCreator[`${PREFIX}c1`].creator_net_sales), 84);
  assert.equal(Number(byCreator[`${PREFIX}c1`].amount), 67);
  assert.equal(Number(byCreator[`${PREFIX}c1`].platform_commission), 17);
  // 200/300 × 50 = 33 → net 167 → 80% = 133.6 → 134
  assert.equal(Number(byCreator[`${PREFIX}c2`].creator_net_sales), 167);
  assert.equal(Number(byCreator[`${PREFIX}c2`].amount), 134);
  assert.equal(Number(byCreator[`${PREFIX}c2`].platform_commission), 33);

  for (const entry of entries) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(amount),0)::int AS total FROM creator_payable_slices WHERE ledger_entry_id = $1`,
      [entry.id]
    );
    assert.equal(rows[0].total, Number(entry.amount), "leaf slices must reconstruct the entry");
  }
});

test("invariant 3: a second earning for the same order+creator is rejected by the database", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("dup", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await assert.rejects(
    () => inTx((client) => ledger.recordOrderEarnings(client, { orderId })),
    /duplicate key|cle_one_earning_per_order_creator/
  );
});

test("invariant 2: an entry whose split does not add up is rejected by a row CHECK", async (t) => {
  t.after(cleanup);
  await cleanup();
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','teacher')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}c1`, `${PREFIX}c1@example.test`]
  );
  const orderId = await makePaidOrder("split", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO creator_ledger_entries
           (creator_id, entry_type, amount, creator_net_sales, platform_commission, order_id, source_type, source_id)
         VALUES ($1,'earning',80,100,19,$2,'order',$2)`,
        [`${PREFIX}c1`, orderId]
      ),
    /cle_attributed_split_check/
  );
});

test("invariant 7: a negative adjustment without a creator_fault classification is rejected", async (t) => {
  t.after(cleanup);
  await cleanup();
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','teacher')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}c1`, `${PREFIX}c1@example.test`]
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO creator_ledger_entries (creator_id, entry_type, amount, source_type, source_id)
         VALUES ($1,'adjustment',-50,'manual_case_record',$2)`,
        [`${PREFIX}c1`, `${PREFIX}case`]
      ),
    /cle_negative_requires_fault_check/
  );
});

test("DEC-35: non_creator_fault produces no ledger entry at all", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("fault", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','admin')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}admin`, `${PREFIX}admin@example.test`]
  );

  const classification = await inTx((client) =>
    fault.classify(client, {
      sourceType: "manual_case_record",
      sourceId: `${PREFIX}case1`,
      orderId,
      creatorId: `${PREFIX}c1`,
      result: "non_creator_fault",
      reasonCode: "platform_nonperformance",
      writtenBasis: "platform delivery failure, creator not at fault",
      decidedBy: `${PREFIX}admin`,
    })
  );

  await assert.rejects(
    () =>
      inTx((client) =>
        ledger.recordAdjustment(client, {
          creatorId: `${PREFIX}c1`,
          amount: -40,
          faultClassificationId: classification.id,
          sourceType: "manual_case_record",
          sourceId: `${PREFIX}case1`,
          orderId,
        })
      ),
    /non_creator_fault must be absorbed by the platform/
  );

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM creator_ledger_entries WHERE creator_id = $1`,
    [`${PREFIX}c1`]
  );
  assert.equal(rows[0].n, 0, "Platform absorb must leave the creator ledger untouched");
});

test("creator_fault requires attribution — classification cannot cure a missing seller", async () => {
  await assert.rejects(
    () =>
      inTx((client) =>
        fault.classify(client, {
          sourceType: "manual_case_record",
          sourceId: `${PREFIX}case2`,
          creatorId: null,
          result: "creator_fault",
          reasonCode: "wrong_material",
          writtenBasis: "x",
          decidedBy: `${PREFIX}admin`,
        })
      ),
    /attribution cannot be invented/
  );
});

test("the ledger is append-only: UPDATE and DELETE are refused by the database", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("append", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  const { entries } = await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  const entryId = entries[0].id;

  await assert.rejects(
    () => db.query(`UPDATE creator_ledger_entries SET amount = 1 WHERE id = $1`, [entryId]),
    /append-only/
  );
  await assert.rejects(
    () => db.query(`DELETE FROM creator_ledger_entries WHERE id = $1`, [entryId]),
    /append-only/
  );
});

test("invariant 12: settlement_cycle_id is write-once", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("cycle", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await inTx((client) => holds.ensureCycle(client, "2099-01"));
  await inTx((client) => holds.ensureCycle(client, "2099-02"));

  const { rows } = await db.query(
    `SELECT s.id FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1 LIMIT 1`,
    [`${PREFIX}c1`]
  );
  const sliceId = rows[0].id;

  await db.query(`UPDATE creator_payable_slices SET settlement_cycle_id = '2099-01' WHERE id = $1`, [
    sliceId,
  ]);
  await assert.rejects(
    () =>
      db.query(`UPDATE creator_payable_slices SET settlement_cycle_id = '2099-02' WHERE id = $1`, [
        sliceId,
      ]),
    /write-once/
  );
  // 同值重寫是無操作，不該被當成違規。
  await db.query(`UPDATE creator_payable_slices SET settlement_cycle_id = '2099-01' WHERE id = $1`, [
    sliceId,
  ]);
});

test("invariant 14: a slice that does not reconcile to its entry is refused at COMMIT", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("sum", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  const { entries } = await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  await assert.rejects(
    () =>
      inTx(async (client) => {
        await client.query(
          `INSERT INTO creator_payable_slices (ledger_entry_id, order_item_id, amount)
           VALUES ($1, NULL, 999)`,
          [entries[0].id]
        );
      }),
    /invariant 14 violated/
  );
});

test("invariant 2/13: an opening entry without the DEC-31 split is refused by the database", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("nosplit", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO creator_ledger_entries
           (creator_id, entry_type, amount, order_id, order_item_id, source_type, source_id)
         VALUES ($1,'opening',80,$2,$3,'reconciliation_run',$4)`,
        [`${PREFIX}c1`, orderId, `${PREFIX}oi_nosplit_a`, `${PREFIX}run`]
      ),
    /cle_attributed_split_check/
  );
  // 而非銷售類的分錄反過來**不得**帶分潤欄位。
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO creator_ledger_entries
           (creator_id, entry_type, amount, creator_net_sales, platform_commission, source_type, source_id)
         VALUES ($1,'payout_consumption',-80,100,20,'payout_item',$2)`,
        [`${PREFIX}c1`, `${PREFIX}pi`]
      ),
    /cle_non_attributed_no_split_check/
  );
});

test("DEC-33 §P7a: a partial hold splits the slice instead of pausing the whole thing", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("partial", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  // payable ＝ 80。請求 hold 買方金額 50 → 50 × 4/5 = 40，**正好是整數**，故精確 hold。
  const result = await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_partial_a`,
      requestedAmount: 50,
      sourceType: "refund_remedy_case",
      sourceId: `${PREFIX}rrc1`,
      reason: "partial refund under review",
    })
  );
  assert.equal(result.scope, "item");
  assert.equal(result.degradedToFullItem, false);
  assert.equal(result.allocations.length, 1);
  assert.equal(Number(result.allocations[0].held_amount), 40);

  const { rows } = await db.query(
    `SELECT s.id, s.amount, s.parent_slice_id FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1 ORDER BY s.amount`,
    [`${PREFIX}c1`]
  );
  // 父 80 ＋ 兩個子（40 / 40）。父列**未被更新**，只是多了子列。
  assert.equal(rows.length, 3);
  const children = rows.filter((row) => row.parent_slice_id !== null);
  assert.equal(children.length, 2);
  assert.equal(
    children.reduce((sum, row) => sum + Number(row.amount), 0),
    80,
    "children must sum back to the parent (invariant 15)"
  );
});

test("DEC-28 §L6: a partial amount larger than the item fails closed to the full item", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("overask", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  const result = await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_overask_a`,
      requestedAmount: 500,
      sourceType: "refund_remedy_case",
      sourceId: `${PREFIX}rrc2`,
      reason: "amount exceeds the attributable item",
    })
  );
  assert.equal(result.degradedToFullItem, true);
  assert.equal(result.degradeReason, "amount_exceeds_attributable_item");
  assert.equal(
    result.allocations.reduce((sum, a) => sum + Number(a.held_amount), 0),
    80,
    "the whole item payable is held rather than a guessed partial amount"
  );
});

test("DEC-28 §L6 + DEC-31: a partial amount with no exact payable fails closed to the item", async (t) => {
  t.after(cleanup);
  // 買方金額 1/2/3 在 80／20 之下分別對應 0.8/1.6/2.4 —— 都不是整數。
  // 任何取整都是 `DEC-31` 之外的新規則，因此退回**整個品項**（item scope 本來就已授權）。
  for (const [tag, requested] of [["one", 1], ["two", 2], ["three", 3]]) {
    await cleanup();
    const orderId = await makePaidOrder(`inexact_${tag}`, {
      items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
    });
    await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
    const result = await inTx((client) =>
      holds.openHold(client, {
        orderId,
        orderItemId: `${PREFIX}oi_inexact_${tag}_a`,
        requestedAmount: requested,
        sourceType: "refund_remedy_case",
        sourceId: `${PREFIX}rrc_${tag}`,
        reason: "partial amount with no exact creator payable",
      })
    );
    assert.equal(result.degradedToFullItem, true, `requested ${requested} must fail closed`);
    assert.equal(result.degradeReason, "attributable_payable_not_exactly_representable");
    assert.equal(
      result.allocations.reduce((sum, a) => sum + Number(a.held_amount), 0),
      80,
      "the narrowest safe scope is the whole item, never a rounded-up guess"
    );
  }
});

test("DEC-28 §L6: an exactly representable partial amount is held exactly", async (t) => {
  t.after(cleanup);
  await cleanup();
  // 買方金額 5 → 4 整數；25 → 20 整數。
  const orderId = await makePaidOrder("exact", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  const result = await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_exact_a`,
      requestedAmount: 25,
      sourceType: "refund_remedy_case",
      sourceId: `${PREFIX}rrc_exact`,
      reason: "exact partial",
    })
  );
  assert.equal(result.degradedToFullItem, false);
  assert.equal(Number(result.allocations[0].held_amount), 20, "exactly 25 x 4/5, no rounding");
});

test("invariant 11: holds cannot exceed the slice they target", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("overhold", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  const { rows } = await db.query(
    `SELECT s.id FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1 AND s.order_item_id IS NOT NULL`,
    [`${PREFIX}c1`]
  );
  const { rows: holdRows } = await db.query(
    `INSERT INTO settlement_holds (scope, order_id, order_item_id, source_type, source_id, reason)
     VALUES ('item',$1,$2,'manual_case_record',$3,'test') RETURNING id`,
    [orderId, `${PREFIX}oi_overhold_a`, `${PREFIX}case`]
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO settlement_hold_allocations (hold_id, payable_slice_id, held_amount)
         VALUES ($1,$2,81)`,
        [holdRows[0].id, rows[0].id]
      ),
    /invariant 11 violated/
  );
});

test("a residue slice can never be held", async (t) => {
  t.after(cleanup);
  await cleanup();
  // 三個品項各 101/103/107，折扣 13 → 分錄取整與逐品項 floor 之間必有 residue。
  const orderId = await makePaidOrder("residue", {
    items: [
      { id: "a", subtotal: 101, sellerId: `${PREFIX}c1` },
      { id: "b", subtotal: 103, sellerId: `${PREFIX}c1` },
      { id: "c", subtotal: 107, sellerId: `${PREFIX}c1` },
    ],
    discount: 13,
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  const { rows } = await db.query(
    `SELECT s.id FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1 AND s.order_item_id IS NULL`,
    [`${PREFIX}c1`]
  );
  assert.equal(rows.length, 1, "this fixture must produce exactly one residue slice");

  const { rows: holdRows } = await db.query(
    `INSERT INTO settlement_holds (scope, order_id, source_type, source_id, reason)
     VALUES ('order',$1,'manual_case_record',$2,'test') RETURNING id`,
    [orderId, `${PREFIX}case`]
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO settlement_hold_allocations (hold_id, payable_slice_id, held_amount)
         VALUES ($1,$2,1)`,
        [holdRows[0].id, rows[0].id]
      ),
    /residue payable slice .* can never be held/
  );
});

test("D: a released allocation survives a later subdivision without enabling double consumption", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("relsplit", {
    items: [{ id: "a", subtotal: 100, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  // 1. 整筆 hold
  const first = await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_relsplit_a`,
      sourceType: "consumer_complaint",
      sourceId: `${PREFIX}cc1`,
      reason: "complaint under review",
    })
  );
  const parentSliceId = first.allocations[0].payable_slice_id;

  // 2. 解除
  await inTx((client) =>
    holds.releaseHold(client, { holdId: first.hold.id, reason: "complaint dismissed" })
  );

  // 3. 之後的部分 hold → 再分割（解除過的 allocation 不再是障礙）
  const second = await inTx((client) =>
    holds.openHold(client, {
      orderId,
      orderItemId: `${PREFIX}oi_relsplit_a`,
      requestedAmount: 25,
      sourceType: "refund_remedy_case",
      sourceId: `${PREFIX}rrc_rel`,
      reason: "partial refund approved",
    })
  );
  assert.equal(second.degradedToFullItem, false);
  assert.equal(Number(second.allocations[0].held_amount), 20);

  // 4. 歷史 allocation 仍附著在（現已成為父的）原切片上，且仍然有效
  const { rows: historical } = await db.query(
    `SELECT id FROM settlement_hold_allocations WHERE payable_slice_id = $1`,
    [parentSliceId]
  );
  assert.equal(historical.length, 1, "the released allocation is history and must remain");

  // 5. 父切片不得再接受任何會動到錢的新 allocation
  const { rows: newHold } = await db.query(
    `INSERT INTO settlement_holds (scope, order_id, order_item_id, source_type, source_id, reason)
     VALUES ('item',$1,$2,'manual_case_record',$3,'test') RETURNING id`,
    [orderId, `${PREFIX}oi_relsplit_a`, `${PREFIX}case`]
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO settlement_hold_allocations (hold_id, payable_slice_id, held_amount)
         VALUES ($1,$2,10)`,
        [newHold[0].id, parentSliceId]
      ),
    /invariant 16 violated/
  );

  // 6. 解除不可逆 —— 否則父與子會同時各自算一次未解除 hold（雙重凍結）
  await assert.rejects(
    () => db.query(`UPDATE settlement_holds SET released_at = NULL WHERE id = $1`, [first.hold.id]),
    /cannot be un-released/
  );

  // 7. 撥款也碰不到父切片
  const consumable = await inTx((client) =>
    payout.consumableSlices(client, { creatorId: `${PREFIX}c1` })
  );
  assert.equal(
    consumable.some((slice) => slice.id === parentSliceId),
    false,
    "a subdivided slice is never consumable"
  );
});

test("DEC-36/DEC-37: an unattributed item goes to suspense, never to a creator", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("unattr", {
    items: [
      { id: "a", subtotal: 100, sellerId: `${PREFIX}c1` },
      { id: "b", subtotal: 200, sellerId: null },
    ],
  });
  const { settlement: computed } = await inTx((client) =>
    ledger.recordOrderEarnings(client, { orderId })
  );
  assert.equal(computed.unattributed.length, 1);

  const { suspense } = await inTx((client) =>
    reconciliation.recordSuspense(client, {
      orderId,
      orderItemId: `${PREFIX}oi_unattr_b`,
      netAmount: 200,
      sourceType: "order",
      sourceId: orderId,
    })
  );
  assert.equal(suspense.state, "open");
  // DEC-37：懸記保存的是**品項淨額**，不是已經切好的 80％ ——
  // 在創作者未知之前先算一筆 platform commission，等於對歸屬先下結論。
  assert.equal(Number(suspense.net_amount), 200);
  assert.equal("amount" in suspense, false, "suspense must not carry a pre-split payable");

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM creator_ledger_entries WHERE order_item_id = $1`,
    [`${PREFIX}oi_unattr_b`]
  );
  assert.equal(rows[0].n, 0, "an unattributed item must never produce a creator payable");
});

test("suspense resolution is idempotent and produces a distinguishable reconciliation entry", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("resolve", {
    items: [{ id: "a", subtotal: 200, sellerId: null }],
  });
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','teacher')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}c9`, `${PREFIX}c9@example.test`]
  );

  const { suspense } = await inTx((client) =>
    reconciliation.recordSuspense(client, {
      orderId,
      orderItemId: `${PREFIX}oi_resolve_a`,
      netAmount: 200,
      sourceType: "order",
      sourceId: orderId,
    })
  );

  const run = await inTx((client) =>
    reconciliation.startRun(client, { runScope: `${PREFIX}scope`, phase: "write" })
  );

  const resolved = await inTx((client) =>
    reconciliation.resolveSuspense(client, {
      suspenseId: suspense.id,
      creatorId: `${PREFIX}c9`,
      runId: run.id,
      evidenceReference: "signed attribution statement 2026-09",
    })
  );
  assert.equal(resolved.suspense.state, "resolved");
  assert.equal(resolved.entry.entry_type, "opening");
  assert.equal(resolved.entry.source_type, "reconciliation_run");

  // A. 經濟事實完整保存：三個 DEC-31 量都在，恆等式可由資料證明。
  assert.equal(Number(resolved.entry.creator_net_sales), 200, "creator_net_sales is preserved");
  assert.equal(Number(resolved.entry.amount), 160, "creator earnings = 80% of 200");
  assert.equal(Number(resolved.entry.platform_commission), 40, "platform commission is preserved");
  assert.equal(
    Number(resolved.entry.amount) + Number(resolved.entry.platform_commission),
    Number(resolved.entry.creator_net_sales),
    "DEC-31 identity is provable for a suspense-resolved transaction"
  );

  // 重跑對帳：partial UNIQUE 讓第二次寫入變成 no-op（invariant 4）。
  const again = await inTx((client) =>
    reconciliation.recordLegacyOpening(client, {
      runId: run.id,
      orderId,
      orderItemId: `${PREFIX}oi_resolve_a`,
      creatorId: `${PREFIX}c9`,
      creatorNetSales: 200,
    })
  );
  assert.equal(again.created, false);
  assert.equal(again.entry.id, resolved.entry.id);
});

test("full lifecycle: close a cycle below threshold, then pay out and consume the slices", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("life", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));

  // 用遙遠未來的期間 id，避免與其他測試或真實資料互相干擾；cleanup 會一併刪掉。
  const cycleId = "2099-01";
  const { statements, payoutItems } = await withWritesEnabled(() =>
    inTx((client) => settlement.closeCycle(client, { cycleId }))
  );
  const mine = statements.filter((row) => row.creator_id === `${PREFIX}c1`);
  assert.equal(mine.length, 1);
  assert.equal(Number(mine[0].eligible_balance), 400);
  assert.equal(mine[0].payout_triggered_reason, "threshold");
  assert.equal(mine[0].ageing_qualified, true);
  assert.equal(Number(mine[0].ageing_cycles_before), 0);
  assert.equal(Number(mine[0].ageing_cycles_after), 1);

  const item = payoutItems.find((row) => row.creator_id === `${PREFIX}c1`);
  assert.equal(Number(item.amount), 400);

  const paid = await withWritesEnabled(() =>
    inTx((client) =>
      payout.markPaid(client, { payoutItemId: item.id, bankReference: "TXN-TEST-0001" })
    )
  );
  assert.equal(paid.payoutItem.status, "paid");
  assert.equal(
    paid.allocations.reduce((sum, a) => sum + Number(a.amount), 0),
    400,
    "allocations must reconcile exactly to the payout item (invariant 10)"
  );
  assert.equal(Number(paid.ledgerEntry.amount), -400);

  const balance = await ledger.carriedBalance(db, `${PREFIX}c1`);
  assert.equal(balance, 0, "the payable is extinguished once the payout is recorded");
});

test("a closed cycle cannot be reopened and its statements cannot be edited", async (t) => {
  t.after(cleanup);
  await cleanup();
  await withWritesEnabled(async () => {
    await inTx((client) => settlement.closeCycle(client, { cycleId: "2099-03" }));
    await assert.rejects(
      () => db.query(`UPDATE payout_cycles SET status = 'open' WHERE id = '2099-03'`),
      /cannot be reopened/
    );
    await assert.rejects(
      () => inTx((client) => settlement.closeCycle(client, { cycleId: "2099-03" })),
      /already closed/
    );
  });
});

test("paying more than the consumable payable fails closed", async (t) => {
  t.after(cleanup);
  await cleanup();
  await db.query(
    `INSERT INTO users(id, email, password_hash, role) VALUES($1,$2,'x','teacher')
     ON CONFLICT (id) DO NOTHING`,
    [`${PREFIX}c1`, `${PREFIX}c1@example.test`]
  );
  await inTx((client) => holds.ensureCycle(client, "2099-05"));
  const { rows } = await db.query(
    `INSERT INTO payout_items (cycle_id, creator_id, amount, trigger_reason)
     VALUES ('2099-05',$1,500,'threshold') RETURNING id`,
    [`${PREFIX}c1`]
  );
  await assert.rejects(
    () => inTx((client) => payout.markPaid(client, { payoutItemId: rows[0].id, bankReference: "X" })),
    /refusing to pay an unreconcilable amount/
  );
});

test("marking a payout paid requires a bank reference — the platform does not move money", async () => {
  await assert.rejects(
    () => inTx((client) => payout.markPaid(client, { payoutItemId: "nope", bankReference: "  " })),
    /bank reference is required/
  );
});

test("the invariant suite reports no violations after the whole exercise", async (t) => {
  t.after(cleanup);
  const result = await runInvariantChecks(db);
  assert.equal(
    result.ok,
    true,
    `invariant violations: ${JSON.stringify(result.violations, null, 2)}`
  );
});

test("the census is read-only: it reports counts without changing anything", async () => {
  const before = await db.query(`SELECT COUNT(*)::int AS n FROM creator_ledger_entries`);
  const counts = await reconciliation.census(db);
  const after = await db.query(`SELECT COUNT(*)::int AS n FROM creator_ledger_entries`);
  assert.equal(after.rows[0].n, before.rows[0].n);
  assert.equal(typeof counts.approved_without_paid_at, "number");
  assert.equal(counts.listing_price_violations, 0);
});

test("F: with the flag OFF the approval hook persists refund_window_end and writes nothing else", async (t) => {
  t.after(cleanup);
  await cleanup();
  const { onOrderPaymentApproved } = require("../services/settlementIntegration.service");
  const previous = process.env.SETTLEMENT_WRITE_ENABLED;
  delete process.env.SETTLEMENT_WRITE_ENABLED;
  try {
    const orderId = await makePaidOrder("shadow", {
      items: [
        { id: "a", subtotal: 300, sellerId: `${PREFIX}c1` },
        { id: "b", subtotal: 100, sellerId: null },
      ],
    });
    await db.query(`UPDATE orders SET refund_window_end = NULL WHERE id = $1`, [orderId]);

    const result = await inTx((client) =>
      onOrderPaymentApproved(client, { orderId, paidAt: "2020-01-01T00:00:00.000Z" })
    );
    assert.equal(result.written, false);
    assert.equal(result.mode, "shadow");

    const { rows: order } = await db.query(
      `SELECT refund_window_end FROM orders WHERE id = $1`,
      [orderId]
    );
    assert.notEqual(order[0].refund_window_end, null, "DEC-26 deadline is persisted regardless");

    for (const table of [
      "creator_ledger_entries",
      "creator_payable_slices",
      "unattributed_suspense_entries",
    ]) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${
          table === "creator_payable_slices"
            ? "ledger_entry_id IN (SELECT id FROM creator_ledger_entries WHERE order_id = $1)"
            : "order_id = $1"
        }`,
        [orderId]
      );
      assert.equal(rows[0].n, 0, `${table} must stay empty while the flag is off`);
    }
  } finally {
    if (previous === undefined) delete process.env.SETTLEMENT_WRITE_ENABLED;
    else process.env.SETTLEMENT_WRITE_ENABLED = previous;
  }
});

test("F: with the flag ON the same hook writes the ledger and routes unattributed money to suspense", async (t) => {
  t.after(cleanup);
  await cleanup();
  const { onOrderPaymentApproved } = require("../services/settlementIntegration.service");
  const previous = process.env.SETTLEMENT_WRITE_ENABLED;
  process.env.SETTLEMENT_WRITE_ENABLED = "true";
  try {
    const orderId = await makePaidOrder("live", {
      items: [
        { id: "a", subtotal: 300, sellerId: `${PREFIX}c1` },
        { id: "b", subtotal: 100, sellerId: null },
      ],
    });
    const result = await inTx((client) =>
      onOrderPaymentApproved(client, { orderId, paidAt: "2020-01-01T00:00:00.000Z" })
    );
    assert.equal(result.written, true);
    assert.equal(result.entries.length, 1, "only the attributed item produces a creator entry");
    assert.equal(Number(result.entries[0].creator_net_sales), 300);
    assert.equal(Number(result.entries[0].amount), 240);
    assert.equal(Number(result.entries[0].platform_commission), 60);
    assert.equal(result.suspense.length, 1);
    assert.equal(
      Number(result.suspense[0].net_amount),
      100,
      "suspense carries the item net amount, not a pre-split payable (DEC-37)"
    );
  } finally {
    if (previous === undefined) delete process.env.SETTLEMENT_WRITE_ENABLED;
    else process.env.SETTLEMENT_WRITE_ENABLED = previous;
  }
});

test("final: invariants still hold after the flag-ON exercise", async () => {
  const result = await runInvariantChecks(db);
  assert.equal(result.ok, true, `violations: ${JSON.stringify(result.violations, null, 2)}`);
});

test("G: invariant 5 is enforced by the database, not only by the payout service", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("inv5", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await inTx((client) => holds.ensureCycle(client, "2099-07"));
  const { rows: item } = await db.query(
    `INSERT INTO payout_items (cycle_id, creator_id, amount, trigger_reason)
     VALUES ('2099-07',$1,400,'threshold') RETURNING id`,
    [`${PREFIX}c1`]
  );
  const { rows: slice } = await db.query(
    `SELECT s.id, s.amount FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1 AND s.order_item_id IS NOT NULL`,
    [`${PREFIX}c1`]
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO payout_allocations (payout_item_id, payable_slice_id, amount) VALUES ($1,$2,$3)`,
        [item[0].id, slice[0].id, Number(slice[0].amount) + 1]
      ),
    /invariant 5 violated/
  );
});

test("G: invariant 10 is enforced at COMMIT by a deferred constraint trigger", async (t) => {
  t.after(cleanup);
  await cleanup();
  const orderId = await makePaidOrder("inv10", {
    items: [{ id: "a", subtotal: 500, sellerId: `${PREFIX}c1` }],
  });
  await inTx((client) => ledger.recordOrderEarnings(client, { orderId }));
  await inTx((client) => holds.ensureCycle(client, "2099-08"));
  const { rows: item } = await db.query(
    `INSERT INTO payout_items (cycle_id, creator_id, amount, trigger_reason)
     VALUES ('2099-08',$1,400,'threshold') RETURNING id`,
    [`${PREFIX}c1`]
  );
  const { rows: slice } = await db.query(
    `SELECT s.id FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1 AND s.order_item_id IS NOT NULL`,
    [`${PREFIX}c1`]
  );
  // 只配置 100，但 payout_item 是 400 —— 單筆 INSERT 合法，**整個 transaction 不合法**。
  await assert.rejects(
    () =>
      inTx((client) =>
        client.query(
          `INSERT INTO payout_allocations (payout_item_id, payable_slice_id, amount) VALUES ($1,$2,100)`,
          [item[0].id, slice[0].id]
        )
      ),
    /invariant 10 violated/
  );
  // 而未配置任何 allocation 的 pending item 不受檢查 —— 那是合法的待撥款狀態。
  const { rows: still } = await db.query(`SELECT status FROM payout_items WHERE id = $1`, [
    item[0].id,
  ]);
  assert.equal(still[0].status, "pending");
});
