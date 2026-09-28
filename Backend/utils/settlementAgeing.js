/**
 * 結算資格與 ageing 的**推導規則** —— `DEC-25`／`DEC-28`／`DEC-29`／`DEC-32`／`DEC-33`。
 *
 * ## 為什麼是 utils 而不是 service
 *
 * 這裡全部是純函式：吃一份**不可變歷程**（切片 ＋ hold 區間 ＋ 撥款配置），
 * 吐出「這個期間算不算」。不碰資料庫、不寫入、不記 log ——
 * 因此 Owner 決定裡的每一個示例都能一比一寫成測試，而 shadow 模式與正式路徑
 * 用的是**同一段程式碼**，不是兩份會漂移的實作。
 * 取資料的部分在 `services/settlement.service.js`。
 *
 * ## 選定方案：由不可變歷程推導，於期間關閉時物化
 *
 * 明確計數器會 drift 且更正後無法重算；first-carried-cycle 標記在 `DEC-33` 的
 * pause 之下失效（**經過的期數 ≠ 合格的期數**）。`DEC-30` 讓輸入（已關閉期間、
 * 不可變分錄、hold 區間）永久穩定，因此推導永遠可重算、可稽核。
 *
 * ## CUTOFF-STATE，不是 ANY-HOLD-DURING-CYCLE
 *
 * `DEC-32` §P1 的原文是**期末**判準。若改成「期間內只要被 hold 過就不計」，
 * 一連串短暫的 hold 就能無限期阻止 ageing —— 正好製造 `DEC-29` 要防的結果。
 */

const { cycleBounds } = require("./settlementPolicy");

/** 一個切片是否為 leaf（沒有子切片）。「已被分割」由 `EXISTS` 推導，不設 status 欄位。 */
function isLeaf(slice, slices) {
  return !slices.some((candidate) => candidate.parent_slice_id === slice.id);
}

/** 由 leaf 往上走出完整的 lineage（root 在前）。 */
function lineageOf(slice, byId) {
  const chain = [];
  let cursor = slice;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parent_slice_id ? byId.get(cursor.parent_slice_id) : null;
  }
  return chain;
}

/**
 * 在期間 `cycleId` 的時點上，這條 lineage 由哪一個成員代表這筆錢。
 *
 * 分割以**期間**為單位（`split_in_cycle_id`），不引入分數期間：
 * 分割期間**之前**算父的歷程，分割期間**起**算子自己的。
 */
function lineageMemberAt(chain, cycleId) {
  let member = chain[0];
  for (const candidate of chain.slice(1)) {
    if (candidate.split_in_cycle_id && candidate.split_in_cycle_id <= cycleId) {
      member = candidate;
    } else {
      break;
    }
  }
  return member;
}

function heldAt(slice, cutoffAt, history) {
  return history.holds
    .filter((hold) => hold.payable_slice_id === slice.id)
    .filter(
      (hold) =>
        new Date(hold.opened_at).getTime() <= cutoffAt.getTime() &&
        (hold.released_at === null || new Date(hold.released_at).getTime() > cutoffAt.getTime())
    )
    .reduce((sum, hold) => sum + Number(hold.held_amount), 0);
}

function consumedAt(slice, cutoffAt, history) {
  return history.payouts
    .filter((payout) => payout.payable_slice_id === slice.id)
    .filter((payout) => new Date(payout.created_at).getTime() <= cutoffAt.getTime())
    .reduce((sum, payout) => sum + Number(payout.amount), 0);
}

/**
 * 某切片於某 cutoff 時點是否 settlement-eligible。
 *
 * ⚠️ **不得沿用 `teacherSales` 的 `ELIGIBLE_SALE`** —— 後者會靜默丟棄
 * `paid_at IS NULL` 的列，而 `DEC-27` §K4 要求那些列必須 fail closed 並被顯示出來。
 */
function isEligibleAtCutoff(slice, cutoffAt, history) {
  // `earning` 一律走完整 predicate。
  //
  // `opening`（legacy 對帳期初）與 `adjustment`（更正）的資格在其產生時就已由
  // 對帳／分類流程判定，因此**不要求** `refund_window_end` 存在 ——
  // `DEC-27` §K1 明文禁止 backfill 歷史訂單的期限，要求它等於要求 backfill。
  //
  // ⚠️ 但**只要訂單有期限就一定尊重它**：對帳若發生在一筆**上線後**的訂單上
  // （例如事後補上歸屬），該訂單本來就有 `refund_window_end`，此時仍必須等窗口
  // 屆滿才 eligible。「legacy 無期限」是豁免的理由，「對帳過」不是。
  if (slice.entry_type === "earning" || slice.refund_window_end) {
    if (slice.order_status !== "approved") return false;
    if (!slice.order_paid_at) return false;
    if (!slice.refund_window_end) return false;
    if (new Date(slice.refund_window_end).getTime() > cutoffAt.getTime()) return false;
  }
  if (new Date(slice.created_at).getTime() > cutoffAt.getTime()) return false;

  // `hold ≠ 消滅`：被 hold 只是不 eligible，餘額仍在（`DEC-32` §P3）。
  return (
    Number(slice.amount) - heldAt(slice, cutoffAt, history) - consumedAt(slice, cutoffAt, history) >
    0
  );
}

/** 某切片是否已被撥款完全消滅 —— `DEC-32` §P3 唯一的 reset 條件。 */
function isExtinguishedAtCutoff(slice, cutoffAt, history) {
  return consumedAt(slice, cutoffAt, history) >= Number(slice.amount);
}

/**
 * 一個 leaf 切片截至（不含）`cycleId` 的 ageing ——
 * 亦即 `DEC-29` override 判斷所用的 **`ageing_before`（帶入本期的計數）**。
 *
 * 只計**已關閉**的合格期間：ageing 於期間關閉時遞增（`DEC-32`）。
 * 被撥款消滅之後計數歸零（§P3），而 hold 期間**不前進亦不歸零**（`DEC-33`）——
 * 後者是 CUTOFF-STATE 判準的自然結果，不需要額外規則。
 */
function ageingBefore(leafSlice, cycleId, history, closedCycleIds) {
  const byId = new Map(history.slices.map((slice) => [slice.id, slice]));
  const chain = lineageOf(leafSlice, byId);
  let count = 0;
  for (const closedCycleId of closedCycleIds) {
    if (closedCycleId >= cycleId) break;
    const { cutoffAt } = cycleBounds(closedCycleId);
    const member = lineageMemberAt(chain, closedCycleId);
    if (isExtinguishedAtCutoff(member, cutoffAt, history)) {
      count = 0;
      continue;
    }
    if (isEligibleAtCutoff(member, cutoffAt, history)) count += 1;
  }
  return count;
}

module.exports = {
  isLeaf,
  lineageOf,
  lineageMemberAt,
  isEligibleAtCutoff,
  isExtinguishedAtCutoff,
  ageingBefore,
};
