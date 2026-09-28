/**
 * Creator 收益／撥款的自助查詢（`PRE-18` Batch 3，Part I）。
 *
 * ## 與既有 `/teacher/sales` 的分工
 *
 * `/teacher/sales` 是 **Creator Gross Sales** —— 折扣**前**的銷售統計，
 * 語意見 `mvp_rules.md` §18，**本 router 不動它、不取代它**。
 * 這裡提供的是折扣**後**的結算側金額：Net Sales／Earnings／Held／
 * Pending Payable／Paid／Negative Adjustments。
 *
 * ## 只看得到自己
 *
 * 每一支 endpoint 都以 `req.user.userId` 為範圍，**不接受**任何
 * `creatorId` 參數 —— 接受了就等於開一條讀別人金流的路。
 *
 * ## 刻意不揭露的三件事
 *
 *   1. **Platform Commission** —— 那是平台側指標，屬 Admin／報表脈絡。
 *      創作者看到的是自己的 net sales 與 earnings，兩者已足以自行核對。
 *   2. **Unattributed Suspense** —— 依定義**不屬於任何創作者**（`DEC-37`），
 *      放進創作者頁面等於暗示它是某人的錢。
 *   3. **銀行資訊與稅務／扣繳** —— `AD-09` 與稅務皆未決（`AD-10`），
 *      在這裡寫任何一行都是替未決事項下結論。
 */

const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middlewares/auth");
const reportingService = require("../services/settlementReporting.service");
const { MIN_PAYOUT_AMOUNT_TWD, AGEING_OVERRIDE_CYCLES } = require("../utils/settlementPolicy");

const router = express.Router();
router.use(requireAuth, requireRole("teacher"));

/** 結算側的金額摘要。 */
router.get("/summary", async (req, res) => {
  const creatorId = req.user.userId;
  const lines = await reportingService.settlementLines(db, { creatorId });

  return res.json({
    // `unattributedSuspense` 與 `platformCommission` 刻意不外露（見檔頭）。
    creatorNetSales: lines.creatorNetSales,
    creatorEarnings: lines.creatorEarnings,
    negativeAdjustments: lines.negativeAdjustments,
    held: lines.held,
    pendingPayable: lines.pendingPayable,
    paid: lines.paid,
    policy: {
      minPayoutAmount: MIN_PAYOUT_AMOUNT_TWD,
      ageingOverrideCycles: AGEING_OVERRIDE_CYCLES,
      note:
        "Balances below the minimum are carried forward, never forfeited; " +
        "after six qualifying cycles they are released regardless of amount.",
    },
  });
});

/** 逐期間的結算 statement（只含自己）。 */
router.get("/statements", async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.cycle_id, s.opening_balance, s.earnings, s.adjustments, s.held_amount,
            s.eligible_balance, s.ageing_qualified, s.ageing_cycles_before,
            s.ageing_cycles_after, s.payout_triggered_reason, s.created_at,
            c.cutoff_at, c.payout_due_at, c.status AS cycle_status
       FROM creator_cycle_statements s
       JOIN payout_cycles c ON c.id = s.cycle_id
      WHERE s.creator_id = $1
      ORDER BY s.cycle_id DESC`,
    [req.user.userId]
  );
  return res.json({ statements: rows });
});

/**
 * 撥款紀錄。
 *
 * ⚠️ **`bank_reference` 不外露** —— 它是平台自己的轉帳憑據，不是創作者的資料；
 * 創作者需要知道的是「付了沒、多少、什麼時候」。
 */
router.get("/payouts", async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, cycle_id, amount, status, trigger_reason, paid_at, notified_at, created_at
       FROM payout_items
      WHERE creator_id = $1
      ORDER BY cycle_id DESC, created_at DESC`,
    [req.user.userId]
  );
  return res.json({ payouts: rows });
});

/**
 * 被凍結的金額與其來源案件。
 *
 * 「為什麼這一期少了一筆」必須答得出來，否則創作者只會看到一個無法解釋的數字。
 */
router.get("/holds", async (req, res) => {
  const { rows } = await db.query(
    `SELECT h.id, h.scope, h.order_id, h.order_item_id, h.reason,
            h.opened_at, h.released_at, h.release_reason,
            a.held_amount
       FROM settlement_hold_allocations a
       JOIN settlement_holds h ON h.id = a.hold_id
       JOIN creator_payable_slices s ON s.id = a.payable_slice_id
       JOIN creator_ledger_entries e ON e.id = s.ledger_entry_id
      WHERE e.creator_id = $1
      ORDER BY h.opened_at DESC, h.id`,
    [req.user.userId]
  );
  return res.json({ holds: rows });
});

/**
 * 負向調整（`DEC-21` 窄例外）。
 *
 * 一併附上分類的 `reason_code` 與書面依據 —— `DEC-35` §Q3 要求可稽核，
 * 而「可稽核」對創作者而言就是**看得到理由**。
 */
router.get("/adjustments", async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.id, e.amount, e.order_id, e.order_item_id, e.occurred_at,
            c.result, c.reason_code, c.written_basis, c.decided_at
       FROM creator_ledger_entries e
       LEFT JOIN creator_fault_classifications c ON c.id = e.fault_classification_id
      WHERE e.creator_id = $1 AND e.entry_type IN ('adjustment', 'reversal')
      ORDER BY e.occurred_at DESC, e.id DESC`,
    [req.user.userId]
  );
  return res.json({ adjustments: rows });
});

module.exports = router;
