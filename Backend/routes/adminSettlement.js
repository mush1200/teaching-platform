/**
 * Admin settlement API —— `PRE-18` Batch 2。
 *
 * ## 授權
 *
 * 與其他 admin router 相同：`requireAuth` ＋ `requireRole("admin")` 掛在 router 層。
 * 前端 proxy 的 `ALLOW_ROOT` 已含 `admin`，**不需要新增前綴**。
 *
 * ## 寫入一律受旗標約束
 *
 * `SETTLEMENT_WRITE_ENABLED` 關閉時：
 *
 *   * **唯讀**端點照常運作（清單、statement、撥款明細、報表、**shadow preview**）；
 *   * **寫入**端點（關閉期間、標記已付）回 **409 `settlement_writes_disabled`**。
 *
 * 刻意不是靜默略過 —— 靜默會讓 Admin 以為期間已經關了。
 *
 * ## 這裡不做金額計算
 *
 * 所有金額都來自 service 層（ledger／slice／allocation 的不可變事實）。
 * 路由只負責參數驗證、交易邊界與回應塑形。
 */

const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { dispatchBestEffort } = require("../utils/bestEffortDispatch");
const { sendPayoutPaidEmail } = require("../services/emailService");
const settlementService = require("../services/settlement.service");
const payoutService = require("../services/payout.service");
const reportingService = require("../services/settlementReporting.service");
const { runInvariantChecks } = require("../utils/settlementInvariants");
const {
  assertCycleId,
  cycleBounds,
  isSettlementWriteEnabled,
  MIN_PAYOUT_AMOUNT_TWD,
  AGEING_OVERRIDE_CYCLES,
} = require("../utils/settlementPolicy");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

function writesDisabled(res) {
  return res.status(409).json({
    code: "settlement_writes_disabled",
    message:
      "Settlement writes are disabled. Set SETTLEMENT_WRITE_ENABLED=true to enable them; " +
      "read-only shadow previews remain available.",
  });
}

function badCycleId(res, cycleId) {
  return res.status(400).json({
    code: "invalid_cycle_id",
    message: `Invalid settlement cycle id "${cycleId}" (expected YYYY-MM).`,
  });
}

async function inTransaction(fn) {
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

/** 結算期間清單。 */
router.get("/settlement/cycles", async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.starts_at, c.cutoff_at, c.payout_due_at, c.status, c.closed_at, c.closed_by,
            (SELECT COUNT(*)::int FROM creator_cycle_statements s WHERE s.cycle_id = c.id) AS statement_count,
            (SELECT COUNT(*)::int FROM payout_items p WHERE p.cycle_id = c.id) AS payout_item_count
       FROM payout_cycles c
      ORDER BY c.id DESC`
  );
  return res.json({
    writesEnabled: isSettlementWriteEnabled(),
    policy: {
      minPayoutAmount: MIN_PAYOUT_AMOUNT_TWD,
      ageingOverrideCycles: AGEING_OVERRIDE_CYCLES,
    },
    cycles: rows,
  });
});

/**
 * **唯讀** shadow：這個期間關閉時**會**產生什麼。
 *
 * 旗標關閉時這是唯一能跑的結算動作，也是啟用前的比對依據。
 */
router.get("/settlement/cycles/:cycleId/preview", async (req, res) => {
  const { cycleId } = req.params;
  try {
    assertCycleId(cycleId);
  } catch {
    return badCycleId(res, cycleId);
  }
  const preview = await settlementService.previewCycleClose(db, {
    cycleId,
    terminatingCreatorIds: [],
  });
  return res.json(preview);
});

/**
 * 關閉一個結算期間。
 *
 * `terminatingCreatorIds` 是 **Admin 明示提供**的名單，不由系統推導 ——
 * repo 沒有 canonical 的「合作關係終止」狀態（`users.account_status` 只有
 * `active` / `frozen`，而凍結是風控動作，不是關係終止）。把凍結當終止會讓
 * 一個被凍結的帳號**拿到錢**，方向剛好相反。因此 `DEC-29` §3 的 override
 * 需要一次有紀錄的人工判斷，而不是猜出來的。
 */
router.post("/settlement/cycles/:cycleId/close", async (req, res) => {
  const { cycleId } = req.params;
  try {
    assertCycleId(cycleId);
  } catch {
    return badCycleId(res, cycleId);
  }
  if (!isSettlementWriteEnabled()) return writesDisabled(res);

  const terminating = req.body?.terminatingCreatorIds;
  if (terminating !== undefined && !Array.isArray(terminating)) {
    return res.status(400).json({
      code: "invalid_terminating_creator_ids",
      message: "terminatingCreatorIds must be an array of creator ids when provided.",
    });
  }

  try {
    const result = await inTransaction((client) =>
      settlementService.closeCycle(client, {
        cycleId,
        actorId: req.user.userId,
        terminatingCreatorIds: terminating ?? [],
      })
    );
    return res.status(201).json({
      cycleId,
      statementCount: result.statements.length,
      payoutItemCount: result.payoutItems.length,
      payoutTotal: result.payoutItems.reduce((sum, item) => sum + Number(item.amount), 0),
    });
  } catch (err) {
    if (err.code === "SETTLEMENT_WRITES_DISABLED") return writesDisabled(res);
    if (/already (closed|settled)/.test(err.message)) {
      return res.status(409).json({ code: "cycle_not_open", message: err.message });
    }
    console.error("close settlement cycle failed:", err);
    return res.status(500).json({ message: "failed to close settlement cycle" });
  }
});

/** 某期間的創作者結算 statement（物化快照，非權威）。 */
router.get("/settlement/cycles/:cycleId/statements", async (req, res) => {
  const { cycleId } = req.params;
  try {
    assertCycleId(cycleId);
  } catch {
    return badCycleId(res, cycleId);
  }
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId : null;
  const { rows } = await db.query(
    `SELECT * FROM creator_cycle_statements
      WHERE cycle_id = $1 AND ($2::text IS NULL OR creator_id = $2)
      ORDER BY creator_id`,
    [cycleId, creatorId]
  );
  return res.json({
    cycleId,
    bounds: cycleBounds(cycleId),
    // 提醒讀者這不是金額權威 —— 權威永遠是 ledger ＋ hold 歷程。
    note: "materialized snapshot; the authoritative source is the ledger plus hold history",
    statements: rows,
  });
});

/** 撥款項目清單。 */
router.get("/settlement/payout-items", async (req, res) => {
  const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  if (status && !["pending", "paid", "failed", "cancelled"].includes(status)) {
    return res.status(400).json({ code: "invalid_status", message: "unknown payout item status" });
  }
  const { rows } = await db.query(
    `SELECT id, cycle_id, creator_id, amount, status, trigger_reason,
            bank_reference, paid_at, paid_by, notified_at, failure_reason, created_at
       FROM payout_items
      WHERE ($1::text IS NULL OR cycle_id = $1)
        AND ($2::text IS NULL OR status = $2)
      ORDER BY cycle_id DESC, creator_id`,
    [cycleId, status]
  );
  return res.json({ payoutItems: rows });
});

/**
 * 撥款的**配置證據** —— 這筆錢究竟消耗了哪些切片、各多少。
 *
 * 同時附上該創作者目前的 hold 配置，讓「為什麼這一期只付這麼多」可以當場回答。
 */
router.get("/settlement/payout-items/:id/evidence", async (req, res) => {
  const { id } = req.params;
  const { rows: items } = await db.query(`SELECT * FROM payout_items WHERE id = $1`, [id]);
  if (items.length === 0) {
    return res.status(404).json({ code: "payout_item_not_found", message: "payout item not found" });
  }
  const item = items[0];

  const { rows: allocations } = await db.query(
    `SELECT a.id, a.payable_slice_id, a.amount, a.created_at,
            s.order_item_id, s.parent_slice_id, s.amount AS slice_amount,
            s.settlement_cycle_id, s.split_in_cycle_id,
            e.id AS ledger_entry_id, e.entry_type, e.order_id
       FROM payout_allocations a
       JOIN creator_payable_slices s ON s.id = a.payable_slice_id
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE a.payout_item_id = $1
      ORDER BY a.created_at, a.id`,
    [id]
  );

  const { rows: holds } = await db.query(
    `SELECT h.id AS hold_id, h.scope, h.order_id, h.order_item_id, h.reason,
            h.opened_at, h.released_at, h.release_reason,
            a.payable_slice_id, a.held_amount
       FROM settlement_hold_allocations a
       JOIN settlement_holds h ON h.id = a.hold_id
       JOIN creator_payable_slices s ON s.id = a.payable_slice_id
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1
      ORDER BY h.opened_at DESC, a.id`,
    [item.creator_id]
  );

  const allocated = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  return res.json({
    payoutItem: item,
    allocations,
    allocatedTotal: allocated,
    // invariant 10 在 allocation 存在時由 deferred trigger 保證；零配置的 pending
    // item 不在其射程內（那是合法的待撥款狀態）。這裡誠實地把狀態說出來，
    // 不宣稱資料庫證明了它沒有證明的事。
    reconciles: item.status === "paid" ? allocated === Number(item.amount) : null,
    holdEvidence: holds,
  });
});

/**
 * 標記撥款已完成（平台外匯款後）。
 *
 * 一個 transaction 內完成 allocation ＋ `payout_consumption` 分錄 ＋ 狀態 ＋ 稽核；
 * **通知在 commit 之後**以 best-effort 送出（`DEC-20` C4：寄信失敗不得回滾撥款）。
 *
 * ⚠️ `transferReference` 是平台自己的轉帳憑據（例如銀行交易序號）。
 * **不得**在此存入帳號、分行或任何 `AD-09` 所轄的創作者收款資料。
 */
router.post("/settlement/payout-items/:id/mark-paid", async (req, res) => {
  if (!isSettlementWriteEnabled()) return writesDisabled(res);

  const { id } = req.params;
  const reference = req.body?.transferReference ?? req.body?.bankReference;
  if (typeof reference !== "string" || !reference.trim()) {
    return res.status(400).json({
      code: "transfer_reference_required",
      message: "A transfer reference is required; the platform does not move money itself.",
    });
  }
  if (reference.trim().length > 200) {
    return res.status(400).json({
      code: "transfer_reference_too_long",
      message: "transferReference must be 200 characters or fewer.",
    });
  }

  try {
    const result = await inTransaction((client) =>
      payoutService.markPaid(client, {
        payoutItemId: id,
        bankReference: reference.trim(),
        actorId: req.user.userId,
      })
    );

    // commit 之後才寄。`dispatchBestEffort` 保證 rejection 不會炸掉 process。
    dispatchBestEffort(() => sendPayoutPaidEmail(id), {
      operation: "payout_paid email",
      reference: id,
    });

    return res.json({
      payoutItem: result.payoutItem,
      allocationCount: result.allocations.length,
      ledgerEntryId: result.ledgerEntry.id,
    });
  } catch (err) {
    if (/unknown payout item/.test(err.message)) {
      return res.status(404).json({ code: "payout_item_not_found", message: err.message });
    }
    if (/is already/.test(err.message)) {
      return res.status(409).json({ code: "payout_item_not_pending", message: err.message });
    }
    if (/unreconcilable/.test(err.message)) {
      return res.status(409).json({ code: "payout_not_reconcilable", message: err.message });
    }
    console.error("mark payout paid failed:", err);
    return res.status(500).json({ message: "failed to mark payout as paid" });
  }
});

/** 撥款失敗（例如匯款退回）。金額回到應付，不產生任何 ledger 分錄。 */
router.post("/settlement/payout-items/:id/mark-failed", async (req, res) => {
  if (!isSettlementWriteEnabled()) return writesDisabled(res);
  const reason = req.body?.reason;
  if (typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ code: "reason_required", message: "a failure reason is required" });
  }
  try {
    const item = await inTransaction((client) =>
      payoutService.markFailed(client, {
        payoutItemId: req.params.id,
        reason: reason.trim(),
        actorId: req.user.userId,
      })
    );
    return res.json({ payoutItem: item });
  } catch (err) {
    if (/not pending/.test(err.message)) {
      return res.status(409).json({ code: "payout_item_not_pending", message: err.message });
    }
    console.error("mark payout failed failed:", err);
    return res.status(500).json({ message: "failed to mark payout as failed" });
  }
});

/**
 * 結算報表 —— 互不含混的金額線。
 *
 * 「營收」一詞保留給 Admin 的 recognized order revenue，本端點**不重新定義它**。
 * 未歸屬懸記自成一行，**不是**平台收入。
 */
router.get("/settlement/report", async (req, res) => {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId : null;
  const [lines, identity, invariants] = await Promise.all([
    reportingService.settlementLines(db, { creatorId }),
    reportingService.verifyIdentity(db, { creatorId }),
    runInvariantChecks(db),
  ]);
  return res.json({
    lines,
    identity: {
      ok: identity.ok,
      left: identity.left,
      right: identity.right,
      difference: identity.difference,
      formula: "creatorEarnings + negativeAdjustments = paid + held + pendingPayable",
    },
    invariants: {
      checked: invariants.checked,
      violations: invariants.violations.length,
      keys: invariants.violations.map((v) => v.key),
    },
  });
});

module.exports = router;
