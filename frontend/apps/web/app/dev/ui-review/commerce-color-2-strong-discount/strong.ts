/**
 * `UI-QA-COMMERCE-COLOR-2` —— 折扣 ≥30% 的三個候選（dev-only，**未核准、未實作**）。
 *
 * 已鎖定（本輪不變）：價格 `#111827`、購物車徽章 `#C81E6E`＋白、通知徽章 `#5C4EEA`＋白、
 * 折扣 <30% `#FFF0E9`＋`#111827`、門檻 30%。前一版提案 `#FFF0F1`＋`#B91C1C` 因與錯誤樣式相同（ΔE 0.0）而排除。
 *
 * 數字：WCAG 2.x 對比；ΔE 為 OKLab ×100。折扣標籤實際字級 12px 粗體 → 文字需 4.5:1。
 */

export type StrongOption = {
  key: "A" | "B" | "C";
  bg: string;
  text: string;
  rgb: string;
  name: string;
  contrast: string;
  character: string;
  salience: string;
  vsError: string;
  vsBuyNow: string;
};

export const MILD = { bg: "#FFF0E9", text: "#111827" } as const;
export const PRICE = "#111827";
export const CART_BADGE = { bg: "#C81E6E", text: "#FFFFFF" } as const;

export const STRONG_OPTIONS: StrongOption[] = [
  {
    key: "A",
    bg: "#FFD4B8",
    text: "#7C2D12",
    rgb: "底 255, 212, 184／字 124, 45, 18",
    name: "Warm apricot ＋ burnt brown",
    contrast: "6.85",
    character: "溫和但明顯加深的杏橘底、焦棕字；與 <30% 同一個家族，像是「升一級」",
    salience: "比 <30% 明顯（兩個底色 ΔE 7.8；前一版替代只有 3.4）；底色對白 1.37，仍是淡色標籤",
    vsError: "低：字與錯誤文字 ΔE 12.5、底與錯誤底 ΔE 8.8、與退回底 5.5 —— 色相是橘棕，不是紅",
    vsBuyNow: "低：底色與立即購買 ΔE 18.8；淡底不像按鈕",
  },
  {
    key: "B",
    bg: "#FDBA8C",
    text: "#431407",
    rgb: "底 253, 186, 140／字 67, 20, 7",
    name: "Saturated peach ＋ espresso",
    contrast: "9.37",
    character: "飽和的蜜桃橘底、深咖啡字；三者中最「促銷」、最有能量",
    salience: "最明顯的淡色方案（與 <30% ΔE 14.8；底色對白 1.67）",
    vsError: "很低：字與錯誤文字 ΔE 26.6、底與錯誤底 15.7",
    vsBuyNow: "中：底色與立即購買 ΔE 11.9 —— 三者中最接近，標籤放在按鈕附近時會呼應按鈕色",
  },
  {
    key: "C",
    bg: "#111827",
    text: "#FFB788",
    rgb: "底 17, 24, 39／字 255, 183, 136",
    name: "Ink solid ＋ apricot text",
    contrast: "10.46",
    character: "實心深墨底、杏橘字；像價格標籤一樣俐落，和價格／立即購買文字同一個墨色",
    salience: "最醒目（實心，對白 17.74）；與兩種淡色標籤形狀相同、明暗相反，一眼就分得出強弱",
    vsError: "最低：字與錯誤文字 ΔE 34.8、底與錯誤底 76.1 —— 完全不在紅色語意裡",
    vsBuyNow: "低：底色與立即購買 ΔE 56.8；但實心深色標籤比淡色更搶眼，會與價格爭一點注意力",
  },
];

export const CONTRAST_ROWS: Array<[string, string, string]> = [
  ["折扣 <30%（鎖定）", "#111827 on #FFF0E9", "15.96"],
  ["≥30% A", "#7C2D12 on #FFD4B8", "6.85"],
  ["≥30% B", "#431407 on #FDBA8C", "9.37"],
  ["≥30% C", "#FFB788 on #111827", "10.46"],
  ["排除：前一版提案", "#B91C1C on #FFF0F1（= 錯誤樣式）", "5.85（對比合格，但語意撞色）"],
];

const PRICE_SEL = [".text-edu-cta"];
const BADGE_SEL = ['span[class*="bg-[#FF6B73]"]:not([class*="/10"])', 'span[class*="bg-[#FF6B7A]"]'];
const PROMO_SEL = ['span[class*="bg-edu-cta/10"]', 'span[class*="bg-[#FF6B73]/10"]'];

const sel = (scope: string, sels: string[]) => sels.map((x) => `${scope} ${x}`).join(", ");

/** 鎖定規則（價格＋購物車徽章）＋ 指定的折扣樣式，限定在 scope 內。 */
export function contextCss(scope: string, promo: { bg: string; text: string }) {
  return [
    `${sel(scope, PRICE_SEL)}{color:${PRICE} !important}`,
    `${sel(scope, BADGE_SEL)}{background:${CART_BADGE.bg} !important;color:${CART_BADGE.text} !important}`,
    `${sel(scope, PROMO_SEL)}{background:${promo.bg} !important;color:${promo.text} !important}`,
  ].join("\n");
}

export function optionByKey(key: string) {
  return STRONG_OPTIONS.find((o) => o.key === key) ?? null;
}
