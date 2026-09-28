/**
 * 結算 hold —— `DEC-28`（attribution-first 三層階梯）＋ `DEC-33`（暫停，不重置）。
 *
 * ## hold 為什麼不是 ledger 分錄
 *
 * 若以「先負後正」兩筆分錄表達，hold 期間的 carried balance 會顯示為 0，
 * 而 `DEC-32` §P3 規定餘額歸零即重置 ageing —— 那正是 `DEC-33` 明文禁止的。
 * 獨立實體 ＋ 自身區間是唯一能同時滿足兩者的模型。
 *
 * ## 部分金額 hold ＝ 切片再分割（`DEC-33` §P7a）
 *
 * 「hold 之外仍為正數的 eligible carried payable 照常 ageing；被 hold 的部分
 * 於 hold 期間不 ageing；釋出時自其保留的既有 ageing 狀態續計」——
 * 而 §P7(b) 又禁止「把各自獨立 ageing 的餘額塌縮成單一計數器」，
 * 因此「部分金額 hold 就暫停整個切片」是**被排除**的。
 *
 * 唯一合規的機制是**依金額把切片再分割為子切片**：未被 hold 的子切片照常 ageing，
 * 被 hold 的子切片暫停。兩者共用 lineage，因此都繼承父在分割當下的 ageing 狀態。
 * **append-only**：插入子切片，永不更新父切片。
 */

const { writeActivityLog } = require("../utils/activityLog");
const {
  CREATOR_SHARE_NUMERATOR,
  CREATOR_SHARE_DENOMINATOR,
} = require("../utils/settlementMoney");
const { cycleIdForInstant, cycleBounds } = require("../utils/settlementPolicy");

/** 確保期間列存在（切片的 `split_in_cycle_id` 有 FK）。冪等。 */
async function ensureCycle(client, cycleId) {
  const bounds = cycleBounds(cycleId);
  await client.query(
    `INSERT INTO payout_cycles (id, starts_at, cutoff_at, payout_due_at)
     VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
    [cycleId, bounds.startsAt, bounds.cutoffAt, bounds.payoutDueAt]
  );
  return cycleId;
}

/**
 * 某訂單／品項下、**尚可被 hold** 的 leaf 切片。
 *
 * 排除三者：已被其他未解除 hold 佔用的金額、已被撥款消耗的金額、
 * 以及 residue 切片（`order_item_id IS NULL` —— 不歸屬任何品項，
 * 故任何品項層級的爭議都碰不到它）。
 */
async function availableSlices(client, { orderId, orderItemId = null }) {
  const { rows } = await client.query(
    `SELECT s.id,
            s.amount,
            s.order_item_id,
            s.settlement_cycle_id,
            e.creator_id,
            e.id AS ledger_entry_id,
            COALESCE(held.total, 0)::int AS held_amount,
            COALESCE(paid.total, 0)::int AS paid_amount
       FROM creator_payable_slices s
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
       LEFT JOIN LATERAL (
         SELECT SUM(a.held_amount) AS total
           FROM settlement_hold_allocations a
           JOIN settlement_holds h ON h.id = a.hold_id
          WHERE a.payable_slice_id = s.id AND h.released_at IS NULL
       ) held ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(p.amount) AS total
           FROM payout_allocations p
          WHERE p.payable_slice_id = s.id
       ) paid ON TRUE
      WHERE e.order_id = $1
        AND s.order_item_id IS NOT NULL
        AND ($2::text IS NULL OR s.order_item_id = $2)
        AND NOT EXISTS (
          SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = s.id
        )
      ORDER BY s.id`,
    [orderId, orderItemId]
  );
  return rows
    .map((row) => ({ ...row, available: row.amount - row.held_amount - row.paid_amount }))
    .filter((row) => row.available > 0);
}

/**
 * 決定 hold 範圍 —— `DEC-28` 的三層階梯，取**最窄的安全層級**。
 *
 * 帳號層級（無 `order_id`）**不得**自動 hold：必須由 Admin 明示指認受影響訂單，
 * 呼叫端因此一定帶得出 `orderId`；帶不出來就 fail closed。
 */
function resolveScope({ orderId, orderItemId, manual = false }) {
  if (!orderId) {
    throw new Error(
      "settlement hold: an account-level case cannot be auto-held; an admin must name the affected order(s) (DEC-28 L3)"
    );
  }
  if (manual) return "manual";
  return orderItemId ? "item" : "order";
}

/**
 * 把一個 leaf 切片依金額再分割為「未被 hold」與「被 hold」兩個子切片。
 *
 * append-only：**只插入子列，永不更新父列**。「已被分割」由 `EXISTS(children)`
 * 推導，因此不需要 status 欄位。子切片繼承父的 `order_item_id` 與（若已指派的）
 * `settlement_cycle_id`；`split_in_cycle_id` 記下分割發生的期間，
 * 使 ageing 得以「父在分割前的合格期數 ＋ 子自該期起的合格期數」推導。
 */
async function splitSlice(client, { slice, portionAmount, cycleId }) {
  if (portionAmount <= 0 || portionAmount >= slice.amount) {
    throw new Error(
      `splitSlice: portion ${portionAmount} must be strictly inside slice ${slice.id} (${slice.amount})`
    );
  }
  const insert = async (amount) => {
    const { rows } = await client.query(
      `INSERT INTO creator_payable_slices
         (ledger_entry_id, parent_slice_id, order_item_id, amount, settlement_cycle_id, split_in_cycle_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        slice.ledger_entry_id,
        slice.id,
        slice.order_item_id,
        amount,
        slice.settlement_cycle_id,
        cycleId,
      ]
    );
    return rows[0];
  };
  // 先插剩餘的部分，再插被指定的部分；兩者加總 ＝ 父金額（invariant 15，
  // 由 deferred constraint trigger 於 commit 時驗證）。
  const remainder = await insert(slice.amount - portionAmount);
  const portion = await insert(portionAmount);
  return { remainder, portion };
}

/**
 * 開啟一個 hold。
 *
 * @param {object} client 已 BEGIN 的 pg client
 * @param {object} input
 * @param {string} input.orderId
 * @param {string|null} [input.orderItemId]
 * @param {number|null} [input.requestedAmount] 買方金額（`refund_remedy_cases.approved_amount`）
 * @param {boolean} [input.manual] Admin 明示指認（`DEC-28` §L3）
 */
async function openHold(
  client,
  {
    orderId,
    orderItemId = null,
    requestedAmount = null,
    sourceType,
    sourceId,
    reason,
    actorId = null,
    manual = false,
    now = new Date(),
  }
) {
  const scope = resolveScope({ orderId, orderItemId, manual });
  const cycleId = await ensureCycle(client, cycleIdForInstant(now));
  const slices = await availableSlices(client, { orderId, orderItemId });

  if (slices.length === 0) {
    // 沒有尚未撥付的可歸屬應付 —— `DEC-28` §L4：已撥付的金額一律轉入 `DEC-21`。
    // 這不是錯誤，但**必須留下軌跡**，否則案件會看起來「已處理」而其實沒有。
    await writeActivityLog({
      client,
      actorId,
      actorRole: actorId ? "admin" : null,
      targetType: "order",
      targetId: orderId,
      action: "hold.not_applicable",
      meta: {
        scope,
        order_item_id: orderItemId,
        source_type: sourceType,
        source_id: sourceId,
        note: "no unpaid attributable payable remains; post-payout remedies follow DEC-21",
      },
    });
    return { hold: null, allocations: [], scope, reason: "no_unpaid_payable" };
  }

  // `DEC-28` §L6：部分金額必須不大於該品項分攤後的 `item_net_amount`；
  // **超出即 fail closed 退回完整品項範圍**（不是直接拒絕，也不是靜默夾住）。
  //
  // ⚠️ **這裡不得發明第三套取整規則。** `DEC-31` 只授權兩種取整：品項折扣分攤的
  // floor，與分潤的 round-half-up。買方案件金額換算成創作者 payable 時，若結果
  // 不是整數，任何 `ceil`／`floor`／`round` 都是 `DEC-31` 之外的新政策。
  //
  // 因此規則是 **exact-or-fail-closed**：
  //
  //   * 買方金額 × 4/5 **正好是整數** → 該金額就是可證明的可歸屬 payable，精確 hold；
  //   * 否則（含大於品項淨額）→ **退回最窄的安全上層範圍 ＝ 整個品項**。
  //
  // 退回整個品項不會多凍到別人的錢：案件本來就指名這個品項，item scope 是
  // `DEC-28` 已經授權的範圍。反之「多凍一點點」需要一條沒有人批准的取整規則。
  let partial = null;
  let degradedToFullItem = false;
  let degradeReason = null;
  if (requestedAmount != null && scope === "item") {
    const { rows } = await client.query(`SELECT subtotal FROM order_items WHERE id = $1`, [
      orderItemId,
    ]);
    const itemSubtotal = rows.length > 0 ? Number(rows[0].subtotal) : 0;
    const exactPayable = (requestedAmount * CREATOR_SHARE_NUMERATOR) / CREATOR_SHARE_DENOMINATOR;

    if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
      degradedToFullItem = true;
      degradeReason = "amount_not_a_positive_integer";
    } else if (requestedAmount > itemSubtotal) {
      degradedToFullItem = true;
      degradeReason = "amount_exceeds_attributable_item"; // DEC-28 §L6 的字面情形
    } else if (!Number.isInteger(exactPayable)) {
      degradedToFullItem = true;
      degradeReason = "attributable_payable_not_exactly_representable";
    } else {
      partial = exactPayable;
    }
  }

  const { rows: holdRows } = await client.query(
    `INSERT INTO settlement_holds (scope, order_id, order_item_id, source_type, source_id, reason, opened_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [scope, orderId, scope === "order" ? null : orderItemId, sourceType, sourceId, reason, actorId]
  );
  const hold = holdRows[0];

  const allocations = [];
  let remaining = partial;

  for (const slice of slices) {
    if (remaining != null && remaining <= 0) break;
    const target = remaining == null ? slice.available : Math.min(remaining, slice.available);

    // **一個 leaf 切片要嘛整筆未被佔用，要嘛整筆被佔用** —— 部分佔用一律先分割。
    // 這個規則讓「哪一部分被 hold」永遠是切片身分的問題，不需要任何順序規則，
    // 也讓 `availableSlices` 回傳的切片必然 `available === amount`。
    let allocationSliceId = slice.id;
    if (target < slice.available) {
      const children = await splitSlice(client, { slice, portionAmount: target, cycleId });
      allocationSliceId = children.portion.id;
    }

    const { rows } = await client.query(
      `INSERT INTO settlement_hold_allocations (hold_id, payable_slice_id, held_amount)
       VALUES ($1, $2, $3) RETURNING *`,
      [hold.id, allocationSliceId, target]
    );
    allocations.push(rows[0]);
    if (remaining != null) remaining -= target;
  }

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "settlement_hold",
    targetId: hold.id,
    action: "hold.opened",
    meta: {
      scope,
      order_id: orderId,
      order_item_id: scope === "order" ? null : orderItemId,
      source_type: sourceType,
      source_id: sourceId,
      requested_amount: requestedAmount,
      degraded_to_full_item: degradedToFullItem,
      degrade_reason: degradeReason,
      held_total: allocations.reduce((sum, a) => sum + a.held_amount, 0),
      allocation_count: allocations.length,
    },
  });

  return { hold, allocations, scope, degradedToFullItem, degradeReason };
}

/**
 * 解除 hold。
 *
 * **不動 allocation** —— 它們是歷史事實（append-only）。解除的表達是 hold 本身
 * 的 `released_at`，因此「這筆錢當時被凍結了多久、多少」永遠查得出來，
 * 而 ageing 也因此可以由不可變歷程重新推導。
 */
async function releaseHold(client, { holdId, reason, actorId = null }) {
  if (!reason || !String(reason).trim()) {
    throw new Error("releaseHold: a release reason is required (audit trail)");
  }
  const { rows } = await client.query(
    `UPDATE settlement_holds
        SET released_at = NOW(), released_by = $2, release_reason = $3
      WHERE id = $1 AND released_at IS NULL
      RETURNING *`,
    [holdId, actorId, reason]
  );
  if (rows.length === 0) {
    throw new Error(`releaseHold: hold ${holdId} does not exist or is already released`);
  }

  await writeActivityLog({
    client,
    actorId,
    actorRole: actorId ? "admin" : null,
    targetType: "settlement_hold",
    targetId: holdId,
    action: "hold.released",
    meta: { reason },
  });

  return rows[0];
}

module.exports = {
  ensureCycle,
  availableSlices,
  resolveScope,
  splitSlice,
  openHold,
  releaseHold,
};
