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
const reconciliationService = require("../services/settlementReconciliation.service");
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
    terminationOverrides: [],
  });
  return res.json(preview);
});

/**
 * 關閉一個結算期間。
 *
 * `terminationOverrides` 是 **Admin 明示提供**的 `{ creatorId, reason }` 清單，不由系統推導 ——
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

  const overrides = req.body?.terminationOverrides;
  if (overrides !== undefined && !Array.isArray(overrides)) {
    return res.status(400).json({
      code: "invalid_termination_overrides",
      message: "terminationOverrides must be an array of { creatorId, reason } when provided.",
    });
  }
  try {
    // 空白理由的 override 就是「無依據的勾選」，在進交易之前先擋掉。
    settlementService.normaliseTerminationOverrides(overrides ?? []);
  } catch (err) {
    return res.status(400).json({ code: "invalid_termination_overrides", message: err.message });
  }

  try {
    const result = await inTransaction((client) =>
      settlementService.closeCycle(client, {
        cycleId,
        actorId: req.user.userId,
        terminationOverrides: overrides ?? [],
      })
    );
    return res.status(201).json({
      cycleId,
      statementCount: result.statements.length,
      payoutItemCount: result.payoutItems.length,
      payoutTotal: result.payoutItems.reduce((sum, item) => sum + Number(item.amount), 0),
      terminationOverridesApplied: (overrides ?? []).length,
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
 * Hold 清單與其**來源案件** —— 「為什麼這筆錢被凍結」必須答得出來。
 *
 * 一個 order-scope 的 hold 可以涵蓋多位創作者，因此受影響者由 allocation
 * 指向的切片決定，而不是 hold 主表上的某個欄位。
 */
router.get("/settlement/holds", async (req, res) => {
  const openOnly = req.query.open === "true";
  const { rows } = await db.query(
    `SELECT h.id, h.scope, h.order_id, h.order_item_id, h.source_type, h.source_id,
            h.reason, h.opened_at, h.opened_by, h.released_at, h.released_by, h.release_reason,
            COALESCE(SUM(a.held_amount), 0)::int AS allocated_total,
            COUNT(a.id)::int AS allocation_count,
            COALESCE(
              ARRAY_AGG(DISTINCT e.creator_id) FILTER (WHERE e.creator_id IS NOT NULL),
              ARRAY[]::text[]
            ) AS affected_creators
       FROM settlement_holds h
       LEFT JOIN settlement_hold_allocations a ON a.hold_id = h.id
       LEFT JOIN creator_payable_slices s ON s.id = a.payable_slice_id
       LEFT JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE ($1::boolean IS NOT TRUE OR h.released_at IS NULL)
      GROUP BY h.id
      ORDER BY h.opened_at DESC, h.id`,
    [openOnly]
  );
  return res.json({ holds: rows });
});

/** 過失分類（`DEC-35`）—— 含書面依據與更正軌跡。 */
router.get("/settlement/fault-classifications", async (req, res) => {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId : null;
  const { rows } = await db.query(
    `SELECT c.*, (
              SELECT s.id FROM creator_fault_classifications s WHERE s.supersedes_id = c.id
            ) AS superseded_by
       FROM creator_fault_classifications c
      WHERE ($1::text IS NULL OR c.creator_id = $1)
      ORDER BY c.decided_at DESC, c.id DESC`,
    [creatorId]
  );
  return res.json({ classifications: rows });
});

/**
 * 負向調整與沖正 —— `DEC-21` 的窄例外。
 *
 * 每一筆都帶出其分類依據；**沒有分類就不可能存在**（DB CHECK 擋住）。
 */
router.get("/settlement/adjustments", async (req, res) => {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId : null;
  const { rows } = await db.query(
    `SELECT e.id, e.creator_id, e.entry_type, e.amount, e.order_id, e.order_item_id,
            e.source_type, e.source_id, e.reverses_entry_id, e.occurred_at, e.created_by,
            c.result, c.reason_code, c.written_basis, c.evidence_reference, c.decided_by
       FROM creator_ledger_entries e
       LEFT JOIN creator_fault_classifications c ON c.id = e.fault_classification_id
      WHERE e.entry_type IN ('adjustment', 'reversal')
        AND ($1::text IS NULL OR e.creator_id = $1)
      ORDER BY e.occurred_at DESC, e.id DESC`,
    [creatorId]
  );
  return res.json({ adjustments: rows });
});

/**
 * 未歸屬懸記（`DEC-37`）。
 *
 * **不是**平台收入、**不是**任何創作者的應付。最終處置為外部事項（`O19`），
 * 因此這裡只讀，沒有任何「結案」動作。
 */
router.get("/settlement/suspense", async (req, res) => {
  const state = req.query.state === "resolved" ? "resolved" : req.query.state === "open" ? "open" : null;
  const { rows } = await db.query(
    `SELECT u.*, e.creator_id AS resolved_creator_id, e.creator_net_sales,
            e.amount AS resolved_creator_earnings, e.platform_commission
       FROM unattributed_suspense_entries u
       LEFT JOIN creator_ledger_entries e ON e.id = u.resolved_entry_id
      WHERE ($1::text IS NULL OR u.state = $1)
      ORDER BY u.created_at DESC, u.id`,
    [state]
  );
  return res.json({
    suspense: rows,
    note: "attribution undetermined; never creator payable and never platform revenue (DEC-37); terminal disposition is external (O19)",
  });
});

/**
 * 對帳狀態 —— legacy census ＋ 歷次 reconciliation run。
 *
 * `approved` ＋ `paid_at IS NULL` 與 `seller_id IS NULL` 的存在**本身不是錯誤**；
 * `DEC-27` §K2／`DEC-36` 要求的是**逐筆明示處置**。這個端點讓 Admin 看得到
 * 還有多少筆待處置，而不是讓系統替他們決定。
 */
router.get("/settlement/reconciliation", async (req, res) => {
  const census = await reconciliationService.census(db);
  const { rows: runs } = await db.query(
    `SELECT id, run_scope, phase, status, note, started_at, completed_at, started_by
       FROM reconciliation_runs
      ORDER BY started_at DESC, id DESC
      LIMIT 50`
  );
  return res.json({
    census,
    runs,
    note: "rows needing disposition are not errors; DEC-27 K2 / DEC-36 require an explicit per-row decision",
  });
});

/**
 * 記錄一筆 `DEC-27` §K3 的逐筆處置。
 *
 * ⚠️ **刻意不受 `SETTLEMENT_WRITE_ENABLED` 約束。** 記錄處置不移動任何金錢，
 * 而且它是開啟旗標的**前置條件** —— 若也被旗標擋住就會死結：
 * 沒開旗標不能記處置，沒記處置不能開旗標。
 */
router.post("/settlement/reconciliation/dispositions", async (req, res) => {
  const { targetType, targetId, category, decision, writtenBasis, evidenceReference, runId, supersedesId } =
    req.body ?? {};

  if (!["order", "order_item"].includes(targetType)) {
    return res.status(400).json({ code: "invalid_target_type", message: "targetType must be order or order_item" });
  }
  if (!["approved_without_paid_at", "unattributed_order_item"].includes(category)) {
    return res.status(400).json({ code: "invalid_category", message: "unknown disposition category" });
  }
  if (!["include_with_evidence", "exclude_no_evidence", "suspense_recorded"].includes(decision)) {
    return res.status(400).json({ code: "invalid_decision", message: "unknown disposition decision" });
  }
  if (typeof writtenBasis !== "string" || !writtenBasis.trim()) {
    return res.status(400).json({
      code: "written_basis_required",
      message: "A written basis is required; an undocumented decision is exactly what DEC-35 Q8 forbids.",
    });
  }

  try {
    const disposition = await inTransaction((client) =>
      reconciliationService.recordDisposition(client, {
        targetType,
        targetId,
        category,
        decision,
        writtenBasis,
        evidenceReference: evidenceReference ?? null,
        decidedBy: req.user.userId,
        runId: runId ?? null,
        supersedesId: supersedesId ?? null,
      })
    );
    return res.status(201).json({ disposition });
  } catch (err) {
    if (/duplicate key/.test(err.message)) {
      return res.status(409).json({
        code: "disposition_already_recorded",
        message: "This row already has an effective disposition; record a correction with supersedesId.",
      });
    }
    if (/violates check constraint/.test(err.message) || /is required/.test(err.message)) {
      return res.status(400).json({ code: "invalid_disposition", message: err.message });
    }
    console.error("record reconciliation disposition failed:", err);
    return res.status(500).json({ message: "failed to record disposition" });
  }
});

/** 仍缺少明示處置的列 —— write-enable 閘門的判準來源。 */
router.get("/settlement/reconciliation/outstanding", async (req, res) => {
  const outstanding = await reconciliationService.outstandingDispositions(db);
  return res.json({
    outstanding,
    note:
      "DEC-27 K2 does not require these rows to disappear, but each one needs an explicit " +
      "auditable disposition before settlement writes may be enabled",
  });
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
