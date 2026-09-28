/**
 * 結算報表 —— 互不含混的金額線（設計 §16 ＋ `DEC-37` 報表要求）。
 *
 * ## 為什麼需要一個專門的模組
 *
 * `DEC-37` 要求報表**須能區分「創作者已歸屬／平台抽成／未歸屬懸記」三者**，
 * 且**不得讓懸記埋在 order-level 彙總中而無能見度**。把這件事散在各個查詢裡，
 * 遲早會有一條路把懸記算進平台收入 —— 那正是 `DEC-37` 明文禁止的。
 *
 * ## 用語邊界（`mvp_rules.md` §18.4）
 *
 * 「**營收**」一詞保留給 Admin 的 **recognized order revenue**
 * （`orders.total_amount`，訂單層級、折扣後）。本模組**不重新定義它、不重算它、
 * 也不在創作者側重用該詞**。這裡的每一條線都是創作者結算側的量。
 *
 * ## 懸記不是平台收入
 *
 * `unattributedSuspense` 自成一行，**永遠不**併入 `platformCommission`，
 * 也**永遠不**併入任何創作者的應付。它反映**歸屬未決**，不是所有權已定。
 * 最終會計／法律處置是外部事項（`O19`、`AD-10`），本模組不預設任何答案。
 *
 * ## 可檢查的恆等式
 *
 * ```text
 * creatorEarnings + negativeAdjustments = paid + held + pendingPayable
 * ```
 *
 * 三個去向（已付／凍結中／尚待撥付）恰好用掉全部已產生的創作者應付。
 * `verifyIdentity()` 會把它算出來，差額不為 0 即代表資料有問題。
 */

/**
 * 全部金額線。傳 `creatorId` 取單一創作者，不傳取全平台。
 *
 * 每一條線都直接從**不可變的金額事實**推導，不讀 `creator_cycle_statements`
 * （那是快照，不是權威）。
 */
async function settlementLines(executor, { creatorId = null } = {}) {
  const { rows } = await executor.query(
    `WITH scoped_entries AS (
       SELECT * FROM creator_ledger_entries WHERE ($1::text IS NULL OR creator_id = $1)
     ),
     leaf_slices AS (
       SELECT s.id, s.amount, e.creator_id
         FROM creator_payable_slices s
         JOIN scoped_entries e ON e.id = s.ledger_entry_id
        WHERE NOT EXISTS (
          SELECT 1 FROM creator_payable_slices c WHERE c.parent_slice_id = s.id
        )
     )
     SELECT
       -- 銷售側：只有帶歸屬的收益列（earning ＋ 對帳產生的 opening）有分潤欄位。
       COALESCE((SELECT SUM(creator_net_sales) FROM scoped_entries
                  WHERE entry_type IN ('earning','opening')), 0)::int   AS creator_net_sales,
       COALESCE((SELECT SUM(amount) FROM scoped_entries
                  WHERE entry_type IN ('earning','opening')), 0)::int   AS creator_earnings,
       COALESCE((SELECT SUM(platform_commission) FROM scoped_entries
                  WHERE entry_type IN ('earning','opening')), 0)::int   AS platform_commission,

       -- 負向調整（DEC-21 窄例外）。payout_consumption 不算 —— 那是撥款，不是調整。
       COALESCE((SELECT SUM(amount) FROM scoped_entries
                  WHERE amount < 0 AND entry_type <> 'payout_consumption'), 0)::int
                                                                        AS negative_adjustments,

       -- 已撥付：以 allocation 為準（逐切片的事實），不是以 payout_items 彙總。
       COALESCE((SELECT SUM(p.amount) FROM payout_allocations p
                  JOIN leaf_slices ls ON ls.id = p.payable_slice_id), 0)::int AS paid,

       -- 凍結中：未解除的 hold 所覆蓋的金額。**仍為創作者所有**（hold != extinguishment）。
       COALESCE((SELECT SUM(a.held_amount)
                   FROM settlement_hold_allocations a
                   JOIN settlement_holds h ON h.id = a.hold_id AND h.released_at IS NULL
                   JOIN leaf_slices ls ON ls.id = a.payable_slice_id), 0)::int AS held,

       -- 未歸屬懸記：**獨立一行**，永不併入上面任何一條（DEC-37）。
       -- 全平台才有意義 —— 依定義它不屬於任何創作者。
       CASE WHEN $1::text IS NULL THEN
         COALESCE((SELECT SUM(net_amount) FROM unattributed_suspense_entries
                    WHERE state = 'open'), 0)
       ELSE 0 END::int                                                  AS unattributed_suspense`,
    [creatorId]
  );

  const row = rows[0];
  const creatorEarnings = row.creator_earnings;
  const negativeAdjustments = row.negative_adjustments;
  const pendingPayable = creatorEarnings + negativeAdjustments - row.paid - row.held;

  return {
    scope: creatorId ? { creatorId } : { creatorId: null, platformWide: true },
    creatorNetSales: row.creator_net_sales,
    creatorEarnings,
    platformCommission: row.platform_commission,
    negativeAdjustments,
    held: row.held,
    paid: row.paid,
    pendingPayable,
    unattributedSuspense: row.unattributed_suspense,
    notes: {
      // 明確寫出來，免得日後有人把這兩件事接起來。
      recognizedOrderRevenue:
        "not computed here — recognized order revenue stays the existing Admin metric (mvp_rules.md §18.3/§18.4)",
      unattributedSuspense:
        "attribution undetermined; never creator payable and never platform revenue (DEC-37)",
    },
  };
}

/**
 * 恆等式檢查：已產生的創作者應付必須恰好等於「已付 ＋ 凍結中 ＋ 尚待撥付」。
 *
 * 差額不為 0 就是資料有問題，不是四捨五入 —— 全部都是整數 TWD。
 */
async function verifyIdentity(executor, { creatorId = null } = {}) {
  const lines = await settlementLines(executor, { creatorId });
  const left = lines.creatorEarnings + lines.negativeAdjustments;
  const right = lines.paid + lines.held + lines.pendingPayable;
  return { ok: left === right, left, right, difference: left - right, lines };
}

/** 逐創作者的報表列（Admin 清單用）。 */
async function perCreatorLines(executor) {
  const { rows } = await executor.query(
    `SELECT DISTINCT creator_id FROM creator_ledger_entries ORDER BY creator_id`
  );
  const out = [];
  for (const row of rows) {
    out.push(await settlementLines(executor, { creatorId: row.creator_id }));
  }
  return out;
}

module.exports = { settlementLines, verifyIdentity, perCreatorLines };
