"use client";

import { MaterialDetailPurchasePanel } from "../../../../components/materials/detail/MaterialDetailPurchasePanel";
import { MaterialCard } from "../../../../components/materials/MaterialCard";
import { discountPercent, discountTier } from "../../../../lib/commerce";
import type { MockMaterial } from "../../../../lib/view-models";

/**
 * 折扣渲染路徑的驗證 fixture（dev-only，`UI-QA-COMMERCE-COLOR-2` 已決定並實作）。
 *
 * 產品目前**不會**出現折扣（`lib/material-mapper.ts` 的 `originalPrice: price`），
 * 所以這裡以真元件＋指定原價呈現 Owner 的範例百分比，確認 `lib/commerce.ts` 的門檻與 token。
 * **不是選項頁**，也不會寫入任何資料。
 */

const CASES: Array<[number, number]> = [
  [200, 200],
  [180, 200],
  [160, 200],
  [142, 200],
  [140, 200],
  [120, 200],
  [100, 200],
];

const noop = () => {};

function material(price: number, originalPrice: number): MockMaterial {
  return {
    id: `fixture_${price}_${originalPrice}`,
    title: `示範教材（NT$${originalPrice} → NT$${price}）`,
    ageLabel: "6-8歲",
    category: "math",
    price,
    originalPrice,
    rating: 4.8,
    reviewCount: 12,
    isPurchasable: true,
    coverGradient: "from-violet-200 to-indigo-100",
    durationHours: 0,
    units: 0,
    learners: 0,
    description: "",
    outline: [],
    learnPoints: [],
  };
}

export function DiscountFixture() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {CASES.map(([price, original]) => {
          const percent = discountPercent(price, original);
          return (
            <div key={`${price}-${original}`}>
              <p className="mb-1 text-meta font-semibold text-ds-body" data-testid="fixture-tier">
                {percent}% → {discountTier(percent)}
              </p>
              <MaterialCard material={material(price, original)} />
            </div>
          );
        })}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[
          [160, 200],
          [120, 200],
        ].map(([price, original]) => (
          <div key={price} className="rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card">
            <MaterialDetailPurchasePanel
              price={price}
              originalPrice={original}
              discountPercent={discountPercent(price, original)}
              quantity={1}
              busy={false}
              feedback={null}
              onDecrease={noop}
              onIncrease={noop}
              onAddToCart={noop}
              onBuyNow={noop}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
