/**
 * 結算算術 —— `DEC-23`（折扣分攤）＋ `DEC-24`（20／80）＋ `DEC-31`（取整）。
 *
 * 這個模組**只做算術**，不碰資料庫、不做資格判定、不知道期間為何物。
 * 因此每一條規則都能以純函式測試，而且 shadow 模式可以在不寫入任何東西的
 * 情況下跑出與正式路徑**完全相同**的數字。
 *
 * ## 三個不可混用的量（`DEC-24` 明文禁止拿錯基數）
 *
 *   * `item_subtotal`      折扣前的品項小計（`order_items.subtotal`）
 *   * `item_net_amount`    分攤訂單層級折扣**之後**的品項金額 —— **分潤的唯一基數**
 *   * `creator_net_sales`  該創作者在**該訂單**的 `item_net_amount` 總和
 *
 * **禁止**以折扣前 gross subtotal、`orders` 層級 subtotal、未分攤的訂單折扣，
 * 或前台顯示的標價為基數。
 *
 * ## 順序中立（`DEC-31` §6）
 *
 * 所有取整都是 floor 或 round-half-up 的**逐列獨立**運算，餘數一律歸平台或歸
 * residue 切片，**沒有任何一步取決於列的先後**。因此不存在「因品項或 seller 排序
 * 而多給或少給某創作者 NT$1」的情形。
 *
 * ## 為什麼用整數有理數算術而不是浮點
 *
 * `Math.round(97 * 0.8)` 會經過二進位浮點；在 20／80 之下剛好沒事，但費率一旦
 * 改動就可能在 `.5` 邊界上失準。這裡一律以 `floor((2·n·num + den) / (2·den))`
 * 求 round-half-up，全程整數，**與費率無關地正確**。
 */

/** 創作者份額 ＝ 4/5（`DEC-24`：平台 20%／創作者 80%）。 */
const CREATOR_SHARE_NUMERATOR = 4;
const CREATOR_SHARE_DENOMINATOR = 5;

/** 對外揭露用的百分比（僅供文案／報表，計算一律用上面的有理數）。 */
const CREATOR_SHARE_PERCENT = 80;
const PLATFORM_COMMISSION_PERCENT = 20;

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (got ${value})`);
  }
}

/**
 * `n × num / den` 的 **round-half-up**（僅適用 `n >= 0`）。
 *
 * `floor((2·n·num + den) / (2·den))` —— 全整數運算。
 * 例：`97 × 4/5` → `(776 + 5) / 10 = 78.1` → **78**（`DEC-31` §2 的示例）。
 *
 * ⚠️ 在 20／80 之下小數部分只可能是 `.0/.2/.4/.6/.8`，**永遠不會**出現 `.5`；
 * 明寫 round-half-up 是為了讓費率日後改動（例如 85%，`10 × 0.85 = 8.5`）時
 * 規則已經定好，而不是等到那時才發明一個。
 */
function roundHalfUpRatio(n, numerator, denominator) {
  assertNonNegativeInteger(n, "roundHalfUpRatio value");
  return Math.floor((2 * n * numerator + denominator) / (2 * denominator));
}

/**
 * 依 `DEC-23` §1 把**訂單層級**折扣 pro-rata 分攤到品項。
 *
 * `item_discount_share = floor(order_discount × item_subtotal / order_subtotal)`
 *
 * 逐品項 **floor**，未分配完的餘數**由平台承擔**（`DEC-23` §3），
 * 不得指派給任何創作者。恆等式：
 *
 *   `Σ item_net_amount + platform_rounding_residue = orders.total_amount`
 *
 * 其中 `platform_rounding_residue <= 0`。
 *
 * @param {{items: Array<{id: string, subtotal: number, sellerId: string|null}>, orderDiscount: number}} input
 */
function allocateOrderDiscount({ items, orderDiscount }) {
  if (!Array.isArray(items)) throw new Error("allocateOrderDiscount: items must be an array");
  assertNonNegativeInteger(orderDiscount, "order discount");

  const orderSubtotal = items.reduce((sum, item) => {
    assertNonNegativeInteger(item.subtotal, `order item ${item.id} subtotal`);
    return sum + item.subtotal;
  }, 0);

  if (orderDiscount > orderSubtotal) {
    // fail closed：折扣大於小計代表上游資料已經不自洽，靜默夾住只會把錯誤帶進 ledger。
    throw new Error(
      `order discount ${orderDiscount} exceeds order subtotal ${orderSubtotal}; refusing to allocate`
    );
  }

  const allocated = items.map((item) => {
    const discountShare =
      orderSubtotal === 0 ? 0 : Math.floor((orderDiscount * item.subtotal) / orderSubtotal);
    return {
      id: item.id,
      sellerId: item.sellerId ?? null,
      subtotal: item.subtotal,
      discountShare,
      itemNetAmount: item.subtotal - discountShare,
    };
  });

  const distributedDiscount = allocated.reduce((sum, item) => sum + item.discountShare, 0);
  const undistributed = orderDiscount - distributedDiscount;

  return {
    orderSubtotal,
    orderDiscount,
    items: allocated,
    // 平台承擔的負餘數（`DEC-23` §3）。永遠 <= 0。
    platformRoundingResidue: -undistributed,
  };
}

/**
 * `DEC-24` ＋ `DEC-31` §2／§3：創作者份額 round-half-up，平台份額取**餘額**。
 *
 * 平台**不得**獨立取整 —— 那會讓恆等式在整數 TWD 上失準。
 */
function splitCreatorShare(creatorNetSales) {
  assertNonNegativeInteger(creatorNetSales, "creator_net_sales");
  const creatorEarnings = roundHalfUpRatio(
    creatorNetSales,
    CREATOR_SHARE_NUMERATOR,
    CREATOR_SHARE_DENOMINATOR
  );
  return {
    creatorNetSales,
    creatorEarnings,
    platformCommission: creatorNetSales - creatorEarnings,
  };
}

/**
 * 一張訂單的完整結算算術。
 *
 * 流程固定為 `DEC-31` §1 的順序：**先**分攤折扣至品項 → **再**逐創作者彙總
 * `creator_net_sales` → **最後**套 80／20 並取整。取整**不得**延到月結才做。
 *
 * ## 未歸屬品項（`seller_id IS NULL`）
 *
 * 一律**不**進入任何創作者的 `creator_net_sales`，改列入 `unattributed`
 * （`DEC-36`）。它們的金額仍保留在結果中，讓呼叫端得以寫入懸記
 * （`DEC-37`）而不是靜默消失。
 *
 * ## 切片（`creator_payable_slices`）
 *
 * 逐品項的 payable 貢獻 `floor(item_net_amount × 4/5)`；分錄金額是**分錄層級**
 * 的 round-half-up，因此兩者可能有差額，該差額放進 `order_item_id IS NULL` 的
 * residue 切片，使 leaf 切片精確加總回分錄金額（invariant 14）。
 *
 * ⚠️ 設計文件寫「差額 ≤ NT$1」—— 那在該創作者於此訂單只有**一個**品項時成立。
 * 多品項時差額上界是品項數（每品項至多各差 NT$1）。機制不變，僅界限敘述更精確。
 */
function computeOrderSettlement({ items, orderDiscount }) {
  const allocation = allocateOrderDiscount({ items, orderDiscount });

  const byCreator = new Map();
  const unattributed = [];

  for (const item of allocation.items) {
    if (item.sellerId == null) {
      unattributed.push({ orderItemId: item.id, itemNetAmount: item.itemNetAmount });
      continue;
    }
    if (!byCreator.has(item.sellerId)) byCreator.set(item.sellerId, []);
    byCreator.get(item.sellerId).push(item);
  }

  const creators = [];
  for (const [creatorId, creatorItems] of byCreator) {
    const creatorNetSales = creatorItems.reduce((sum, item) => sum + item.itemNetAmount, 0);
    const split = splitCreatorShare(creatorNetSales);

    const slices = creatorItems
      .map((item) => ({
        orderItemId: item.id,
        itemNetAmount: item.itemNetAmount,
        amount: Math.floor(
          (item.itemNetAmount * CREATOR_SHARE_NUMERATOR) / CREATOR_SHARE_DENOMINATOR
        ),
      }))
      // 金額為 0 的切片沒有意義（`amount > 0` 是 DB 約束）；其金額落入 residue。
      .filter((slice) => slice.amount > 0);

    const slicedTotal = slices.reduce((sum, slice) => sum + slice.amount, 0);
    const residueAmount = split.creatorEarnings - slicedTotal;
    if (residueAmount < 0) {
      // 不可能發生（floor 的總和不會超過 round-half-up 的總額）；真的發生代表
      // 算術假設被改壞了，寧可 fail closed 也不要寫進 ledger。
      throw new Error(
        `slice residue for creator ${creatorId} is negative (${residueAmount}); refusing to continue`
      );
    }

    creators.push({
      creatorId,
      ...split,
      slices,
      residueAmount,
      orderItemIds: creatorItems.map((item) => item.id),
    });
  }

  return {
    ...allocation,
    creators,
    unattributed,
  };
}

module.exports = {
  CREATOR_SHARE_NUMERATOR,
  CREATOR_SHARE_DENOMINATOR,
  CREATOR_SHARE_PERCENT,
  PLATFORM_COMMISSION_PERCENT,
  roundHalfUpRatio,
  allocateOrderDiscount,
  splitCreatorShare,
  computeOrderSettlement,
};
