/**
 * Ageing 與資格判定 —— `DEC-25`／`DEC-28`／`DEC-29`／`DEC-32`／`DEC-33`。
 *
 * 這些函式刻意是**純的**（吃一個不可變歷程物件，吐一個數字），
 * 所以 Owner 決定裡的每一個情境都能一比一寫成測試，不需要資料庫。
 *
 * 測的重點有三個，全都是設計審查抓出來的錯誤來源：
 *   1. **CUTOFF-STATE**：判準是期末狀態，不是期間內的 hold 歷程；
 *   2. **hold 暫停但不重置**；只有撥款消滅才重置；
 *   3. **六期 off-by-one**：第 1～6 期合格 → 第 7 期帶入的計數才是 6。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isEligibleAtCutoff,
  isExtinguishedAtCutoff,
  ageingBefore,
  lineageMemberAt,
  lineageOf,
  isLeaf,
} = require("../utils/settlementAgeing");
const { cycleBounds } = require("../utils/settlementPolicy");

/** 一個「正常、可結算」的切片骨架：已核准、已付款、退款窗口早就過了。 */
function slice(overrides = {}) {
  return {
    id: "s1",
    parent_slice_id: null,
    ledger_entry_id: "e1",
    order_item_id: "i1",
    amount: 100,
    settlement_cycle_id: null,
    split_in_cycle_id: null,
    created_at: "2025-12-01T00:00:00.000Z",
    entry_type: "earning",
    order_id: "o1",
    order_status: "approved",
    order_paid_at: "2025-12-01T00:00:00.000Z",
    refund_window_end: "2025-12-08T15:59:59.999Z",
    ...overrides,
  };
}

function history({ slices = [], holds = [], payouts = [], entries = [] } = {}) {
  return { slices, holds, payouts, entries };
}

const CUTOFF = (cycleId) => cycleBounds(cycleId).cutoffAt;

test("DEC-25 §4: an order that is not approved is never eligible", () => {
  const s = slice({ order_status: "pending_payment" });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), history({ slices: [s] })), false);
});

test("DEC-27 §K4: paid_at IS NULL fails closed — it is not silently treated as eligible", () => {
  const s = slice({ order_paid_at: null });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), history({ slices: [s] })), false);
});

test("DEC-26: an earning with no persisted refund_window_end is not eligible", () => {
  const s = slice({ refund_window_end: null });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), history({ slices: [s] })), false);
});

test("DEC-30 §3: a refund window ending after the cutoff belongs to the NEXT cycle", () => {
  const s = slice({ refund_window_end: "2026-02-03T15:59:59.999Z" });
  const h = history({ slices: [s] });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), h), false);
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-02"), h), true);
});

test("legacy opening entries do not require a refund window, but a recorded one is still honoured", () => {
  const legacy = slice({ entry_type: "opening", refund_window_end: null, order_paid_at: null });
  assert.equal(isEligibleAtCutoff(legacy, CUTOFF("2026-01"), history({ slices: [legacy] })), true);

  // 上線後補歸屬的品項訂單**有**期限 —— 那就必須等窗口屆滿。
  const postLaunch = slice({ entry_type: "opening", refund_window_end: "2026-02-03T00:00:00.000Z" });
  assert.equal(
    isEligibleAtCutoff(postLaunch, CUTOFF("2026-01"), history({ slices: [postLaunch] })),
    false
  );
});

test("design §10 scenario 1: held mid-cycle but free at cutoff → the cycle COUNTS", () => {
  const s = slice();
  const h = history({
    slices: [s],
    holds: [
      {
        payable_slice_id: "s1",
        held_amount: 100,
        opened_at: "2026-01-03T00:00:00.000Z",
        released_at: "2026-01-09T00:00:00.000Z",
      },
    ],
  });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), h), true);
  assert.equal(ageingBefore(s, "2026-02", h, ["2026-01"]), 1);
});

test("design §10 scenario 2: free all cycle but held AT the cutoff → the cycle does NOT count", () => {
  const s = slice();
  const h = history({
    slices: [s],
    holds: [
      {
        payable_slice_id: "s1",
        held_amount: 100,
        opened_at: "2026-01-31T10:00:00.000Z",
        released_at: null,
      },
    ],
  });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), h), false);
  assert.equal(ageingBefore(s, "2026-02", h, ["2026-01"]), 0);
});

test("design §10 scenario 3: held from before until day 20, free at cutoff → COUNTS", () => {
  const s = slice();
  const h = history({
    slices: [s],
    holds: [
      {
        payable_slice_id: "s1",
        held_amount: 100,
        opened_at: "2025-12-15T00:00:00.000Z",
        released_at: "2026-01-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), h), true);
});

test("design §10 scenario 4: two slices of one entry age independently", () => {
  const free = slice({ id: "s_free", amount: 60, order_item_id: "i1" });
  const held = slice({ id: "s_held", amount: 40, order_item_id: "i2" });
  const h = history({
    slices: [free, held],
    holds: [
      {
        payable_slice_id: "s_held",
        held_amount: 40,
        opened_at: "2026-01-10T00:00:00.000Z",
        released_at: null,
      },
    ],
  });
  assert.equal(isEligibleAtCutoff(free, CUTOFF("2026-01"), h), true);
  assert.equal(isEligibleAtCutoff(held, CUTOFF("2026-01"), h), false);
  assert.equal(ageingBefore(free, "2026-02", h, ["2026-01"]), 1);
  assert.equal(ageingBefore(held, "2026-02", h, ["2026-01"]), 0);
});

test("DEC-33 §2: a hold pauses the count — it neither advances nor resets it", () => {
  const s = slice();
  const closed = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  const h = history({
    slices: [s],
    holds: [
      {
        payable_slice_id: "s1",
        held_amount: 100,
        // 第 4 期整期被 hold（cutoff 當下仍在），第 5 期之前解除。
        opened_at: "2026-04-01T00:00:00.000Z",
        released_at: "2026-05-02T00:00:00.000Z",
      },
    ],
  });
  // 第 1～3 期合格 → 帶入第 4 期的計數是 3
  assert.equal(ageingBefore(s, "2026-04", h, closed), 3);
  // 第 4 期被 hold → 帶入第 5 期的計數**維持 3**，不歸零
  assert.equal(ageingBefore(s, "2026-05", h, closed), 3);
  // 第 5 期又合格 → 帶入第 6 期的計數推進為 4，**不是從 0 重新開始**
  assert.equal(ageingBefore(s, "2026-06", h, closed), 4);
});

test("DEC-32 §P3: only actual extinguishment resets the count", () => {
  const s = slice();
  const closed = ["2026-01", "2026-02", "2026-03"];
  const h = history({
    slices: [s],
    payouts: [{ payable_slice_id: "s1", amount: 100, created_at: "2026-02-20T00:00:00.000Z" }],
  });
  assert.equal(isExtinguishedAtCutoff(s, CUTOFF("2026-01"), h), false);
  assert.equal(isExtinguishedAtCutoff(s, CUTOFF("2026-02"), h), true);
  // 第 1 期計 1；第 2 期被撥款消滅 → 歸零；第 3 期仍為消滅狀態 → 維持 0
  assert.equal(ageingBefore(s, "2026-02", h, closed), 1);
  assert.equal(ageingBefore(s, "2026-04", h, closed), 0);
});

test("DEC-32 §P2 worked example: NT$50 from cycle 1, no new sales → cycle 7 carries a count of 6", () => {
  const s = slice({ amount: 50 });
  const closed = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const h = history({ slices: [s] });
  assert.equal(ageingBefore(s, "2026-06", h, closed), 5, "the sixth cycle carries in 5 — not yet");
  assert.equal(ageingBefore(s, "2026-07", h, closed), 6, "the seventh cycle carries in 6 — release");
});

test("DEC-32 §P1: a cycle with no new sales still counts, as long as the balance is positive", () => {
  const s = slice();
  const closed = ["2026-01", "2026-02", "2026-03"];
  // 完全沒有任何 hold、payout 或新分錄 —— 純粹放著。
  assert.equal(ageingBefore(s, "2026-04", history({ slices: [s] }), closed), 3);
});

test("only CLOSED cycles advance the count — ageing increments at cycle close", () => {
  const s = slice();
  assert.equal(ageingBefore(s, "2026-06", history({ slices: [s] }), []), 0);
  assert.equal(ageingBefore(s, "2026-06", history({ slices: [s] }), ["2026-01"]), 1);
});

test("a slice created after a cutoff cannot qualify for that cycle", () => {
  const s = slice({ created_at: "2026-02-10T00:00:00.000Z" });
  const h = history({ slices: [s] });
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-01"), h), false);
  assert.equal(isEligibleAtCutoff(s, CUTOFF("2026-02"), h), true);
});

test("DEC-33 §P7a lineage: a child inherits the parent's history up to the split cycle", () => {
  const parent = slice({ id: "root", amount: 100 });
  const freeChild = slice({
    id: "child_free",
    parent_slice_id: "root",
    amount: 60,
    split_in_cycle_id: "2026-04",
    created_at: "2026-04-05T00:00:00.000Z",
  });
  const heldChild = slice({
    id: "child_held",
    parent_slice_id: "root",
    amount: 40,
    split_in_cycle_id: "2026-04",
    created_at: "2026-04-05T00:00:00.000Z",
  });
  const closed = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  const h = history({
    slices: [parent, freeChild, heldChild],
    holds: [
      {
        payable_slice_id: "child_held",
        held_amount: 40,
        opened_at: "2026-04-05T00:00:00.000Z",
        released_at: null,
      },
    ],
  });

  assert.equal(isLeaf(parent, h.slices), false);
  assert.equal(isLeaf(freeChild, h.slices), true);
  assert.deepEqual(
    lineageOf(freeChild, new Map(h.slices.map((s) => [s.id, s]))).map((s) => s.id),
    ["root", "child_free"]
  );
  // 分割**之前**的期間看父，分割期間**起**看子。
  assert.equal(lineageMemberAt([parent, freeChild], "2026-03").id, "root");
  assert.equal(lineageMemberAt([parent, freeChild], "2026-04").id, "child_free");

  // 第 1～3 期由父累積 3；第 4、5 期未被 hold 的子繼續累積 → 帶入第 6 期為 5。
  assert.equal(ageingBefore(freeChild, "2026-06", h, closed), 5);
  // 被 hold 的子**保留**父的 3，hold 期間不前進也不歸零。
  assert.equal(ageingBefore(heldChild, "2026-06", h, closed), 3);
});
