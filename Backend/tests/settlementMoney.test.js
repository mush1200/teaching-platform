/**
 * `DEC-23`（折扣分攤）／`DEC-24`（20／80）／`DEC-31`（取整）的算術測試。
 *
 * 這些是**純函式**，因此可以把 Owner 決定裡的每一個示例直接寫成斷言 ——
 * 政策文字與程式碼之間沒有中間層可以走樣。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  roundHalfUpRatio,
  allocateOrderDiscount,
  splitCreatorShare,
  computeOrderSettlement,
  CREATOR_SHARE_NUMERATOR,
  CREATOR_SHARE_DENOMINATOR,
} = require("../utils/settlementMoney");

test("DEC-31 §2 worked example: 97 × 80% rounds half-up to 78, platform takes the residual 19", () => {
  const split = splitCreatorShare(97);
  assert.equal(split.creatorEarnings, 78);
  assert.equal(split.platformCommission, 19);
  assert.equal(split.creatorEarnings + split.platformCommission, split.creatorNetSales);
});

test("DEC-31 §3 identity holds exactly for every net-sales value in a wide range", () => {
  for (let netSales = 0; netSales <= 2000; netSales += 1) {
    const split = splitCreatorShare(netSales);
    assert.equal(
      split.creatorEarnings + split.platformCommission,
      netSales,
      `identity broke at ${netSales}`
    );
    assert.ok(Number.isInteger(split.creatorEarnings));
    assert.ok(Number.isInteger(split.platformCommission));
  }
});

test("round-half-up is genuinely half-up, not floor — checked at a rate that produces .5", () => {
  // 20／80 之下小數部分只可能是 .0/.2/.4/.6/.8，**永遠不會**出現 .5，
  // 所以在當前費率下這條規則測不出差別。用 85% 的 10 元（＝ 8.5）才看得見。
  assert.equal(roundHalfUpRatio(10, 17, 20), 9);
  assert.equal(roundHalfUpRatio(1, 1, 2), 1);
  assert.equal(roundHalfUpRatio(3, 1, 2), 2);
  // 而在正式費率下確認沒有 .5：
  for (let n = 0; n <= 500; n += 1) {
    const exact = (n * CREATOR_SHARE_NUMERATOR) / CREATOR_SHARE_DENOMINATOR;
    assert.notEqual(Math.abs(exact % 1), 0.5);
  }
});

test("DEC-23 §1: discount is allocated pro-rata by pre-discount subtotal, floored per item", () => {
  const result = allocateOrderDiscount({
    items: [
      { id: "a", subtotal: 100, sellerId: "c1" },
      { id: "b", subtotal: 200, sellerId: "c2" },
    ],
    orderDiscount: 50,
  });
  // 100/300 × 50 = 16.66… → 16 ; 200/300 × 50 = 33.33… → 33
  assert.deepEqual(
    result.items.map((item) => item.discountShare),
    [16, 33]
  );
  assert.deepEqual(
    result.items.map((item) => item.itemNetAmount),
    [84, 167]
  );
  // 未分配完的 1 元由平台承擔（負餘數）。
  assert.equal(result.platformRoundingResidue, -1);
});

test("DEC-23 §3 identity: Σ item_net_amount + platform residue = order total_amount", () => {
  const subtotals = [[100, 200], [33, 67, 1], [999, 1], [7, 7, 7, 7]];
  for (const set of subtotals) {
    const orderSubtotal = set.reduce((sum, value) => sum + value, 0);
    for (let discount = 0; discount <= orderSubtotal; discount += 1) {
      const result = allocateOrderDiscount({
        items: set.map((subtotal, index) => ({ id: `i${index}`, subtotal, sellerId: "c" })),
        orderDiscount: discount,
      });
      const netTotal = result.items.reduce((sum, item) => sum + item.itemNetAmount, 0);
      assert.equal(
        netTotal + result.platformRoundingResidue,
        orderSubtotal - discount,
        `identity broke for ${JSON.stringify(set)} @ discount ${discount}`
      );
      assert.ok(result.platformRoundingResidue <= 0);
    }
  }
});

test("DEC-23: a 100% discount leaves every item at zero and never goes negative", () => {
  const result = allocateOrderDiscount({
    items: [
      { id: "a", subtotal: 100, sellerId: "c1" },
      { id: "b", subtotal: 201, sellerId: "c2" },
    ],
    orderDiscount: 301,
  });
  for (const item of result.items) {
    assert.ok(item.itemNetAmount >= 0, "item net amount must never go negative");
  }
  const netTotal = result.items.reduce((sum, item) => sum + item.itemNetAmount, 0);
  assert.equal(netTotal + result.platformRoundingResidue, 0);
});

test("a discount larger than the subtotal fails closed instead of being clamped", () => {
  assert.throws(
    () =>
      allocateOrderDiscount({
        items: [{ id: "a", subtotal: 100, sellerId: "c1" }],
        orderDiscount: 101,
      }),
    /exceeds order subtotal/
  );
});

test("DEC-31 §6: the result does not depend on row order", () => {
  const items = [
    { id: "i3", subtotal: 150, sellerId: "c2" },
    { id: "i1", subtotal: 100, sellerId: "c1" },
    { id: "i2", subtotal: 201, sellerId: "c1" },
  ];
  const forward = computeOrderSettlement({ items, orderDiscount: 77 });
  const reversed = computeOrderSettlement({ items: [...items].reverse(), orderDiscount: 77 });

  const normalise = (result) =>
    result.creators
      .map((creator) => ({
        creatorId: creator.creatorId,
        creatorNetSales: creator.creatorNetSales,
        creatorEarnings: creator.creatorEarnings,
        platformCommission: creator.platformCommission,
      }))
      .sort((a, b) => a.creatorId.localeCompare(b.creatorId));

  assert.deepEqual(normalise(forward), normalise(reversed));
  assert.equal(forward.platformRoundingResidue, reversed.platformRoundingResidue);
});

test("DEC-24: the split is applied to creator_net_sales, never to gross subtotal", () => {
  const result = computeOrderSettlement({
    items: [{ id: "i1", subtotal: 100, sellerId: "c1" }],
    orderDiscount: 20,
  });
  const creator = result.creators[0];
  assert.equal(creator.creatorNetSales, 80, "net sales must be post-discount");
  assert.equal(creator.creatorEarnings, 64, "80% of 80, not of 100");
  assert.equal(creator.platformCommission, 16);
});

test("leaf slices plus residue reconstruct the ledger entry amount exactly (invariant 14)", () => {
  const result = computeOrderSettlement({
    items: [
      { id: "i1", subtotal: 101, sellerId: "c1" },
      { id: "i2", subtotal: 103, sellerId: "c1" },
      { id: "i3", subtotal: 107, sellerId: "c1" },
    ],
    orderDiscount: 13,
  });
  const creator = result.creators[0];
  const sliceTotal = creator.slices.reduce((sum, slice) => sum + slice.amount, 0);
  assert.equal(sliceTotal + creator.residueAmount, creator.creatorEarnings);
  assert.ok(creator.residueAmount >= 0);
  assert.ok(
    creator.residueAmount <= creator.slices.length,
    "residue is bounded by the item count, not by NT$1, when a creator has several items"
  );
});

test("DEC-36: items with no seller_id are reported as unattributed, never folded into a creator", () => {
  const result = computeOrderSettlement({
    items: [
      { id: "i1", subtotal: 100, sellerId: "c1" },
      { id: "i2", subtotal: 200, sellerId: null },
    ],
    orderDiscount: 0,
  });
  assert.equal(result.creators.length, 1);
  assert.equal(result.creators[0].creatorId, "c1");
  assert.deepEqual(result.unattributed, [{ orderItemId: "i2", itemNetAmount: 200 }]);
  // 未歸屬的金額**不得**出現在任何創作者的 net sales。
  assert.equal(result.creators[0].creatorNetSales, 100);
});

test("splitCreatorShare refuses non-integer or negative net sales rather than coercing", () => {
  assert.throws(() => splitCreatorShare(10.5), /non-negative integer/);
  assert.throws(() => splitCreatorShare(-1), /non-negative integer/);
});

test("the denominator constants are the DEC-24 rate, not an arbitrary ratio", () => {
  assert.equal(CREATOR_SHARE_NUMERATOR / CREATOR_SHARE_DENOMINATOR, 0.8);
});

test("C: the slice residue bound is floor(4k/5 + 1/2) for k items, and never negative", () => {
  // 設計文件寫「差 ≤ NT$1」—— 那只在 k = 1 時成立。實際上界由取整誤差累積決定：
  //   Σ floor(n_j·4/5) >= N·4/5 − 4k/5，且 roundHalfUp(N·4/5) <= N·4/5 + 1/2
  //   ⇒ residue <= 4k/5 + 1/2，residue >= 0
  // 這是工程上的界限澄清，**不是政策變更**：機制、歸屬與恆等式都沒有動。
  const bound = (k) => Math.floor((4 * k) / 5 + 0.5);
  assert.deepEqual([1, 2, 3, 4, 5].map(bound), [1, 2, 2, 3, 4]);

  let worst = new Map();
  for (const k of [1, 2, 3, 4, 5]) {
    for (let trial = 0; trial < 400; trial += 1) {
      const items = Array.from({ length: k }, (_, index) => ({
        id: `i${index}`,
        subtotal: 1 + ((trial * 7 + index * 13) % 97),
        sellerId: "c1",
      }));
      const orderSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const result = computeOrderSettlement({
        items,
        orderDiscount: trial % (orderSubtotal + 1),
      });
      const creator = result.creators[0];
      const sliceTotal = creator.slices.reduce((sum, slice) => sum + slice.amount, 0);
      assert.equal(
        sliceTotal + creator.residueAmount,
        creator.creatorEarnings,
        "leaf slices plus residue must always reconstruct the entry exactly"
      );
      assert.ok(creator.residueAmount >= 0, "residue is never negative");
      assert.ok(
        creator.residueAmount <= bound(k),
        `residue ${creator.residueAmount} exceeded the bound ${bound(k)} for k=${k}`
      );
      worst.set(k, Math.max(worst.get(k) ?? 0, creator.residueAmount));
    }
  }
  // 多品項確實會超過 NT$1 —— 這正是設計文件敘述不精確之處。
  assert.ok(worst.get(3) > 1, "a three-item creator can genuinely exceed NT$1 of residue");
});

test("C: the slice residue is CREATOR money; only the discount residue is platform-borne", () => {
  const result = computeOrderSettlement({
    items: [
      { id: "i1", subtotal: 101, sellerId: "c1" },
      { id: "i2", subtotal: 103, sellerId: "c1" },
    ],
    orderDiscount: 7,
  });
  const creator = result.creators[0];
  // 切片 residue 仍屬創作者 —— 它是 creator_earnings 的一部分，只是不歸屬單一品項。
  assert.equal(
    creator.slices.reduce((sum, slice) => sum + slice.amount, 0) + creator.residueAmount,
    creator.creatorEarnings
  );
  // 平台承擔的是**折扣**餘數，那是另一個量（DEC-23 §3），永遠 <= 0。
  assert.ok(result.platformRoundingResidue <= 0);
  assert.equal(
    creator.creatorEarnings + creator.platformCommission + result.platformRoundingResidue,
    204 - 7,
    "DEC-24 two-stage identity"
  );
});
