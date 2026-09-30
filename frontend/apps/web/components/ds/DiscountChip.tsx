import { DISCOUNT_CHIP_CLASS, discountTier } from "../../lib/commerce";

/**
 * 折扣標籤（`UI-QA-COMMERCE-COLOR-2`）。強弱由 `lib/commerce.ts` 的唯一門檻決定：
 * `< 30%` 溫和（#FFF0E9 ＋ #111827）、`>= 30%` 強（#FFD4B8 ＋ #7C2D12）。
 * 強折扣是暖橘棕 —— **不得**改用 danger／error token（原提案因與錯誤樣式相同被否決）。
 * 沒有折扣時不渲染任何東西。
 */
export function DiscountChip({ percent, className = "" }: { percent: number; className?: string }) {
  const tier = discountTier(percent);
  if (tier === "none") return null;
  return (
    <span
      data-discount-tier={tier}
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${DISCOUNT_CHIP_CLASS[tier]} ${className}`.trim()}
    >
      {percent}% OFF
    </span>
  );
}
