/**
 * 商業語意規則（`UI-QA-COMMERCE-COLOR-2`，2026-10-01，**Owner 決定**）。
 *
 * **折扣強度門檻的唯一實作。** 其他地方一律呼叫這裡，不得自行寫 `>= 30`。
 *
 * - `< 30%`  → 溫和折扣（`commerce.discountMild`：#FFF0E9 ＋ #111827）
 * - `>= 30%` → 強折扣（`commerce.discountStrong`：#FFD4B8 ＋ #7C2D12）—— 30% 本身屬於強折扣
 *
 * 30% 是本平台的 UI 規則，不是數學或業界標準。判定依據是**畫面上顯示的整數百分比**
 * （`discountPercent()` 與元件用同一個 `Math.round`），避免「顯示 30% 卻套溫和樣式」。
 *
 * ⚠️ 目前產品上**不會**出現折扣：`lib/material-mapper.ts` 把 `originalPrice` 設為 `price`
 * （後端沒有原價欄位），所以百分比恆為 0。渲染路徑已就緒，等真實原價資料存在時自動生效；
 * **不得**為了讓標籤出現而捏造原價。
 */

export const STRONG_DISCOUNT_THRESHOLD = 30;

export type DiscountTier = "none" | "mild" | "strong";

/** 顯示用的整數折扣百分比；沒有折扣（或資料不合理）時回 0。 */
export function discountPercent(price: number, originalPrice: number): number {
  if (!(originalPrice > price) || !(price >= 0) || !(originalPrice > 0)) return 0;
  return Math.round((1 - price / originalPrice) * 100);
}

export function discountTier(percent: number): DiscountTier {
  if (!(percent > 0)) return "none";
  return percent >= STRONG_DISCOUNT_THRESHOLD ? "strong" : "mild";
}

/** 折扣標籤的語意 class（`none` 時不應渲染標籤）。 */
export const DISCOUNT_CHIP_CLASS: Record<Exclude<DiscountTier, "none">, string> = {
  mild: "bg-commerce-discountMild text-commerce-discountMildText",
  strong: "bg-commerce-discountStrong text-commerce-discountStrongText",
};
