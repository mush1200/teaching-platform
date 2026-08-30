/**
 * 退款／補救案件（P1-09 Gate 14）。
 *
 * ## 這裡沒有法律判斷
 *
 * 本模組**不決定**法定解除是否成立、退款是否應該核准、金額應該是多少。
 * 那些取決於個案事實與 External Legal Gate（`L-09` / `L-12` / `L-20`）尚未完成的部分。
 *
 * 這裡提供的是：**一個可稽核、狀態明確、與訂單狀態機分離的案件容器**。
 *
 * ## 三個刻意的分離
 *
 *   1. **不改 `orders.status`** —— 建立或核准案件都不動訂單狀態機。
 *      「訂單成立過」與「後來發生了退款案件」是兩件事。
 *   2. **不自動執行 entitlement 轉移** —— `entitlement_action` 只記錄
 *      「這個案件**應該**對授權做什麼」。實際轉移一律經
 *      `services/entitlement.service.js`，由人明示操作。
 *      是否暫停或撤銷取決於案件類型與尚未完成的法律／業務決定。
 *   3. **不含稅務欄位** —— 憑證沖銷是 `P14` 的另一條流程，
 *      其三維決策樹尚待會計師填寫。為形狀未知的流程預留欄位只會猜錯。
 *
 * ## `approved` ≠ 退款完成
 *
 * 狀態機讓 `approved` 必須再經 `remedy_pending` 才能到 `completed`。
 * 「責任已核准」與「錢真的退了 / 補救真的做了」是兩件事 ——
 * 用同一個狀態表示，帳務與客服都會立刻失準。
 * DB 另有 `rrc_refund_paid_requires_completed` 擋住「未完成卻已有退款時間」。
 */

const db = require("../config/db");
const { writeActivityLog } = require("../utils/activityLog");

const CASE_TYPES = Object.freeze([
  "statutory_rescission",
  "duplicate_payment",
  "wrong_material",
  "corrupted_or_unusable_file",
  "access_failure",
  "material_takedown",
  "platform_nonperformance",
  "other",
]);

const STATUSES = Object.freeze([
  "requested",
  "under_review",
  "approved",
  "rejected",
  "remedy_pending",
  "completed",
  "cancelled",
]);

/** 合法轉移。`rejected` / `completed` / `cancelled` 為終態。 */
const TRANSITIONS = Object.freeze({
  requested: ["under_review", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  // 刻意**不允許** approved → completed：必須經 remedy_pending，
  // 讓「已核准」與「已完成」在結構上就分得開。
  approved: ["remedy_pending", "cancelled"],
  remedy_pending: ["completed", "cancelled"],
  rejected: [],
  completed: [],
  cancelled: [],
});

const ENTITLEMENT_ACTIONS = Object.freeze([
  "no_action",
  "suspend",
  "restore",
  "revoke_pending",
  "revoke_final",
]);

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

/**
 * 建立案件。
 *
 * `buyer_id` 自訂單帶入（不信任呼叫端傳入的值），
 * 並驗證 `orderItemId`（若有）確實屬於該訂單。
 */
async function createCase({
  orderId,
  orderItemId = null,
  caseType,
  buyerStatement = null,
  requestedAmount = null,
  evidenceReference = null,
  actorId,
  actorRole = null,
} = {}) {
  if (!orderId) return fail("order_required", "orderId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  if (!CASE_TYPES.includes(caseType)) {
    return fail("invalid_case_type", `caseType must be one of: ${CASE_TYPES.join(", ")}`);
  }
  if (requestedAmount != null && !(Number.isInteger(requestedAmount) && requestedAmount > 0)) {
    return fail("invalid_amount", "requestedAmount must be a positive integer");
  }

  const order = await db.query(`SELECT id, user_id FROM orders WHERE id = $1`, [String(orderId)]);
  if (order.rows.length === 0) return fail("order_not_found", "order not found");
  const buyerId = order.rows[0].user_id;

  if (orderItemId) {
    const item = await db.query(`SELECT id FROM order_items WHERE id = $1 AND order_id = $2`, [
      String(orderItemId),
      String(orderId),
    ]);
    if (item.rows.length === 0) {
      return fail("order_item_mismatch", "orderItemId does not belong to this order");
    }
  }

  const { rows } = await db.query(
    `INSERT INTO refund_remedy_cases(
       order_id, order_item_id, buyer_id, case_type, status,
       buyer_statement, requested_amount, evidence_reference, created_by
     )
     VALUES ($1, $2, $3, $4, 'requested', $5, $6, $7, $8)
     RETURNING *`,
    [
      String(orderId),
      orderItemId ? String(orderItemId) : null,
      buyerId,
      caseType,
      buyerStatement != null && String(buyerStatement).trim() !== "" ? String(buyerStatement).trim() : null,
      requestedAmount,
      evidenceReference,
      String(actorId),
    ]
  );

  await writeActivityLog({
    actorId,
    actorRole,
    targetType: "refund_remedy_case",
    targetId: rows[0].id,
    action: "remedy_case.requested",
    meta: { orderId: String(orderId), caseType },
  });

  return { ok: true, case: rows[0] };
}

/**
 * 變更案件狀態。
 *
 * `note` 為必填 —— 每一個影響買家救濟的決定都必須說得出理由。
 * **本函式不執行任何 entitlement 轉移，也不執行任何實際匯款。**
 */
async function transition({
  caseId,
  toStatus,
  note,
  approvedAmount = null,
  entitlementAction = null,
  refundPaidAt = null,
  actorId,
  actorRole = null,
} = {}) {
  if (!caseId) return fail("case_required", "caseId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  if (!STATUSES.includes(toStatus)) {
    return fail("invalid_status", `toStatus must be one of: ${STATUSES.join(", ")}`);
  }
  const cleanNote = note != null && String(note).trim() !== "" ? String(note).trim() : null;
  if (!cleanNote) {
    return fail("note_required", "note is required — a remedy decision must be explainable");
  }
  if (entitlementAction != null && !ENTITLEMENT_ACTIONS.includes(entitlementAction)) {
    return fail("invalid_entitlement_action", `entitlementAction must be one of: ${ENTITLEMENT_ACTIONS.join(", ")}`);
  }
  if (approvedAmount != null && !(Number.isInteger(approvedAmount) && approvedAmount > 0)) {
    return fail("invalid_amount", "approvedAmount must be a positive integer");
  }
  if (refundPaidAt != null) {
    // 執行證據只能由 `executeRefund()` 原子寫入 —— 見該函式的說明。
    return fail(
      "use_execute_refund",
      "payment evidence must be written by executeRefund(), not by a plain transition"
    );
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT * FROM refund_remedy_cases WHERE id = $1 FOR UPDATE`, [
      String(caseId),
    ]);
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("case_not_found", "case not found");
    }
    const from = found.rows[0].status;
    if (from === toStatus) {
      await client.query("ROLLBACK");
      return fail("already_in_state", `case is already ${toStatus}`, { from });
    }
    if (!TRANSITIONS[from].includes(toStatus)) {
      await client.query("ROLLBACK");
      return fail("invalid_transition", `cannot move case from ${from} to ${toStatus}`, {
        from,
        allowed: TRANSITIONS[from],
      });
    }
    // 已核准**金錢**退款的案件不得經由一般轉移完成 ——
    // 那會產生一段「宣稱已退款但拿不出憑據」的期間。走 `executeRefund()`。
    // 非金錢補救（`approved_amount IS NULL`，例如重新交付）不受此限。
    if (toStatus === "completed" && found.rows[0].approved_amount != null) {
      await client.query("ROLLBACK");
      return fail(
        "use_execute_refund",
        "a case with an approved cash amount can only be completed through executeRefund()"
      );
    }

    const updated = await client.query(
      `UPDATE refund_remedy_cases
          SET status = $2,
              admin_note = $3,
              approved_amount   = COALESCE($4, approved_amount),
              entitlement_action = COALESCE($5, entitlement_action),
              review_started_at = CASE WHEN $2 = 'under_review' THEN NOW() ELSE review_started_at END,
              decision_at       = CASE WHEN $2 IN ('approved', 'rejected') THEN NOW() ELSE decision_at END,
              completed_at      = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
              reviewed_by       = CASE WHEN $2 IN ('under_review', 'approved', 'rejected') THEN $6 ELSE reviewed_by END,
              completed_by      = CASE WHEN $2 = 'completed' THEN $6 ELSE completed_by END
        WHERE id = $1
        RETURNING *`,
      [String(caseId), toStatus, cleanNote, approvedAmount, entitlementAction, String(actorId)]
    );
    await client.query("COMMIT");

    await writeActivityLog({
      actorId,
      actorRole,
      targetType: "refund_remedy_case",
      targetId: String(caseId),
      action: "remedy_case.status_changed",
      meta: { from, to: toStatus, note: cleanNote, entitlementAction: entitlementAction ?? null },
    });

    return { ok: true, from, to: toStatus, case: updated.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Phase 1 唯一的退款方式：人工銀行匯回（沒有金流服務，也沒有第二條管道）。 */
const REFUND_METHOD_MANUAL_BANK = "manual_bank_transfer";

/**
 * 記錄一筆**已經實際完成**的人工銀行退款。
 *
 * ## 這個函式不會匯錢
 *
 * Phase 1 沒有退款 API。實際匯款由 Admin 在行外（網銀／臨櫃）完成，
 * 這裡保存的是**事後的稽核憑據**：退了多少、用什麼方式、什麼時候、
 * 銀行端的交易參考、誰執行的。
 *
 * ## 為什麼不是 `transition({ toStatus: 'completed' })`
 *
 * 那條路可以在**沒有任何付款證據**的情況下把案件標成完成，
 * 之後再「補」reference —— 中間那段時間帳上會有一筆宣稱已退款卻拿不出憑據的紀錄。
 * 因此金錢退款的完成收斂到這一個原子操作，
 * 且 DB 另有 `rrc_refund_execution_atomic` 與 `rrc_cash_completion_requires_evidence`
 * 兩條 CHECK 在服務層被繞過時仍然擋得住。
 *
 * ## 三件事仍然分離
 *
 *   1. **不動 `orders.status` / `paid_at` / `payment_received_at`** ——
 *      退款完成不等於訂單沒發生過。交易歷史必須保留。
 *   2. **不自動變更 entitlement** —— 即使 case 指定了 `entitlement_action`，
 *      這裡也只把它回報給呼叫端，實際轉移仍須經
 *      `services/entitlement.service.js` 由人明示操作。
 *   3. **不碰稅務憑證與 Creator 報酬** —— `P14` 憑證沖銷與 `P10` ledger
 *      都不存在，且 `refund_paid_at` 已填**不得**被解讀為憑證已沖銷。
 */
async function executeRefund({
  caseId,
  amount,
  paymentReference,
  paidAt = null,
  note = null,
  actorId,
  actorRole = null,
} = {}) {
  if (!caseId) return fail("case_required", "caseId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  if (!Number.isInteger(amount) || amount <= 0) {
    return fail("invalid_amount", "amount must be a positive integer");
  }
  const reference =
    paymentReference != null && String(paymentReference).trim() !== ""
      ? String(paymentReference).trim()
      : null;
  if (!reference) {
    // 沒有交易參考的「已退款」不是憑據，是宣稱。
    return fail("payment_reference_required", "paymentReference is required as refund evidence");
  }
  const cleanNote = note != null && String(note).trim() !== "" ? String(note).trim() : null;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT * FROM refund_remedy_cases WHERE id = $1 FOR UPDATE`, [
      String(caseId),
    ]);
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("case_not_found", "case not found");
    }
    const row = found.rows[0];

    // 只有「已核准且正在等待補救」的案件可以執行退款。
    if (row.status !== "remedy_pending") {
      await client.query("ROLLBACK");
      return fail("invalid_state", `refund can only be executed from remedy_pending (case is ${row.status})`, {
        status: row.status,
      });
    }
    // 決定必須先做過 —— `decision_at` 是 `approved` 才會寫入的。
    if (row.decision_at == null) {
      await client.query("ROLLBACK");
      return fail("case_not_approved", "case has no recorded approval decision");
    }
    // `approved_amount IS NULL` = 非金錢補救（例如重新交付）。沒有錢可退。
    if (row.approved_amount == null) {
      await client.query("ROLLBACK");
      return fail("non_cash_remedy", "this case has no approved cash amount — no bank refund to execute");
    }
    if (amount > row.approved_amount) {
      await client.query("ROLLBACK");
      return fail("amount_exceeds_approved", "refund amount exceeds the approved amount", {
        approvedAmount: row.approved_amount,
      });
    }
    if (row.refund_paid_at != null) {
      await client.query("ROLLBACK");
      return fail("already_executed", "a refund has already been recorded for this case");
    }

    // 狀態與證據在**同一個 UPDATE** 內寫入 —— 不存在「已完成但還沒有憑據」的中間狀態。
    const updated = await client.query(
      `UPDATE refund_remedy_cases
          SET status = 'completed',
              refund_amount = $2,
              refund_method = $3,
              refund_reference = $4,
              refund_paid_at = COALESCE($5::timestamp, NOW()),
              completed_at = NOW(),
              completed_by = $6,
              admin_note = COALESCE($7, admin_note)
        WHERE id = $1
        RETURNING *`,
      [String(caseId), amount, REFUND_METHOD_MANUAL_BANK, reference, paidAt, String(actorId), cleanNote]
    );
    await client.query("COMMIT");

    const result = updated.rows[0];
    await writeActivityLog({
      actorId,
      actorRole,
      targetType: "refund_remedy_case",
      targetId: String(caseId),
      action: "refund.executed",
      meta: {
        caseId: String(caseId),
        orderId: result.order_id,
        buyerId: result.buyer_id,
        amount,
        approvedAmount: result.approved_amount,
        method: REFUND_METHOD_MANUAL_BANK,
        paymentReference: reference,
        executedBy: String(actorId),
        executedAt: result.refund_paid_at,
        note: cleanNote,
      },
    });

    return {
      ok: true,
      case: result,
      // 只是把案件先前記錄的**意圖**回報給呼叫端，**不代表已執行**。
      pendingEntitlementAction: result.entitlement_action ?? null,
    };
  } catch (err) {
    // 執行紀錄寫入失敗 → 案件保持 remedy_pending，什麼都沒發生。
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function getCase(caseId) {
  const { rows } = await db.query(`SELECT * FROM refund_remedy_cases WHERE id = $1`, [String(caseId)]);
  return rows[0] ?? null;
}

/** 依買家、訂單或狀態列出案件（新到舊）。 */
async function listCases({ buyerId = null, orderId = null, status = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (buyerId) add("buyer_id = ?", String(buyerId));
  if (orderId) add("order_id = ?", String(orderId));
  if (status) add("status = ?", String(status));
  params.push(Math.min(Number(limit) || 50, 200));

  const { rows } = await db.query(
    `SELECT * FROM refund_remedy_cases
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY requested_at DESC, created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

/** 狀態變更歷程，來自既有的 `activity_logs`（不另建 event table）。 */
async function listHistory(caseId) {
  const { rows } = await db.query(
    `SELECT actor_id, actor_role, action, meta, created_at
       FROM activity_logs
      WHERE target_type = 'refund_remedy_case' AND target_id = $1
      ORDER BY created_at DESC, id DESC`,
    [String(caseId)]
  );
  return rows;
}

module.exports = {
  CASE_TYPES,
  STATUSES,
  TRANSITIONS,
  ENTITLEMENT_ACTIONS,
  REFUND_METHOD_MANUAL_BANK,
  createCase,
  transition,
  executeRefund,
  getCase,
  listCases,
  listHistory,
};
