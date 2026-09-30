/**
 * `UI-QA-COMMERCE-COLOR-2` 的候選值與 CSS 覆寫產生器（dev-only）。
 *
 * 獨立於 `"use client"` 元件，讓 guarded 的 server `page.tsx`（真實路由 iframe 預覽）與
 * client 比較元件共用同一份資料。選擇器對應日後要改的**確切 class**：
 *   - 價格：`text-edu-cta`（`MaterialDetailPurchasePanel` 主價格與 sticky 合計、`ProductCard` 價格）
 *   - 數量徽章：`bg-[#FF6B73]`（買家 `Topbar` 購物車）與 `bg-[#FF6B7A]`（買家 `Sidebar` 導覽徽章）
 *   - 折扣：`bg-edu-cta/10`（教材詳情）與 `bg-[#FF6B73]/10`（`MaterialCard`）
 *
 * 對比皆以 WCAG 2.x 相對亮度計算（見 `docs/ui-commerce-color-2-inventory.md`）。
 */

export type PriceOption = { key: string; hex: string; rgb: string; name: string; contrast: string; character: string; competes: string };
export type BadgeOption = { key: string; bg: string; text: string; rgb: string; name: string; contrast: string; character: string; collisions: string };
export type PromoOption = { key: string; bg: string; text: string; name: string; contrast: string; character: string };

export const CURRENT = {
  price: { hex: "#EA000D", contrast: "白 4.66／淺紫頁面 #F4F1FF 4.19／卡片 #FAF8FF 4.43", note: "與 danger（#DE1313）ΔE 2.3 —— 價格看起來像錯誤" },
  badge: { bg: "#FF6B73／#FF6B7A", text: "#FFFFFF", contrast: "2.76／2.75（不合格：10px 粗體需 4.5）" },
  promo: { detail: "#EA000D on 10% 淡底 3.92（不合格）", card: "#B91C1C on #FF6B73/10 5.85" },
};

export const PRICE_OPTIONS: PriceOption[] = [
  {
    key: "A",
    hex: "#111827",
    rgb: "17, 24, 39",
    name: "Heading ink（既有 --ds-text-heading）",
    contrast: "白 17.74／淺紫 15.94／卡片 16.84",
    character: "沉穩、清楚、最「資訊」；與按鈕文字（#111827）同墨色，整個購買區只有紫與橘兩個顏色",
    competes: "不競爭：中性色，不會和立即購買搶焦點",
  },
  {
    key: "B",
    hex: "#334155",
    rgb: "51, 65, 85",
    name: "Slate（slate-700）",
    contrast: "白 10.35／淺紫 9.31／卡片 9.83",
    character: "較柔和的冷灰藍；價格稍微退後，讓 CTA 更突出；大字粗體時仍然清楚",
    competes: "不競爭；但比 A 輕，價格的存在感最低",
  },
  {
    key: "C",
    hex: "#312E81",
    rgb: "49, 46, 129",
    name: "Deep brand ink（indigo-900）",
    contrast: "白 11.42／淺紫 10.27／卡片 10.84",
    character: "深紫墨色，與品牌紫同一家族，讓價格帶一點品牌感；比連結色（#4E42FF）深很多（ΔE 21.4），不像可點擊",
    competes: "不和橘競爭；與紫色「加入購物車」同家族 —— 價格與加入購物車在視覺上會被歸為一組",
  },
];

export const BADGE_OPTIONS: BadgeOption[] = [
  {
    key: "A",
    bg: "#C81E6E",
    text: "#FFFFFF",
    rgb: "200, 30, 110",
    name: "Raspberry（加深的粉）",
    contrast: "白字 5.43",
    character: "保留「粉色提醒」的熟悉感，但夠深、白字合格；醒目",
    collisions: "danger ΔE 11.2（可分辨但同屬紅粉家族）／購買橘 25.0／品牌紫 27.8",
  },
  {
    key: "B",
    bg: "#5C4EEA",
    text: "#FFFFFF",
    rgb: "92, 78, 234",
    name: "Brand purple",
    contrast: "白字 5.63",
    character: "與品牌一致、友善；徽章成為品牌色的一部分，不帶警示感",
    collisions: "danger 36.9／購買橘 41.0／品牌紫 0（刻意同色）；與連結色 ΔE 4.4 —— 徽章是實心圓點，不會被誤認為連結文字",
  },
  {
    key: "C",
    bg: "#111827",
    text: "#FFFFFF",
    rgb: "17, 24, 39",
    name: "Neutral ink",
    contrast: "白字 17.74",
    character: "最中性、最俐落（常見於電商與 SaaS）；小尺寸也最清楚；不增加任何新顏色",
    collisions: "danger 43.7／購買橘 56.8／品牌紫 37.9 —— 與任何語意色都不衝突",
  },
];

export const PROMO_OPTIONS: PromoOption[] = [
  {
    key: "A",
    bg: "#FFF0E9",
    text: "#111827",
    name: "購買橘淡底 ＋ 深色字",
    contrast: "15.96",
    character: "折扣屬於「購買動機」—— 與立即購買同一個暖色家族，但只是淡底，不會像按鈕",
  },
  {
    key: "B",
    bg: "#F3F4F6",
    text: "#111827",
    name: "中性灰底 ＋ 深色字",
    contrast: "16.12",
    character: "最低調；折扣只是資訊，不搶價格與 CTA",
  },
  {
    key: "C",
    bg: "#FFF0F1",
    text: "#B91C1C",
    name: "現行紅粉淡底（修正詳情頁不合格的那一個）",
    contrast: "5.85",
    character: "保留目前卡片上的促銷紅；詳情頁的 3.92 改為與卡片一致。紅色仍接近 danger 家族",
  },
];

const PRICE_SEL = [".text-edu-cta"];
const BADGE_SEL = ['span[class*="bg-[#FF6B73]"]:not([class*="/10"])', 'span[class*="bg-[#FF6B7A]"]'];
const PROMO_SEL = ['span[class*="bg-edu-cta/10"]', 'span[class*="bg-[#FF6B73]/10"]'];

type Pick = { price?: { hex: string }; badge?: { bg: string; text: string }; promo?: { bg: string; text: string } };

export function scopedCss(scope: string, o: Pick) {
  const s = (sels: string[]) => sels.map((x) => `${scope} ${x}`).join(", ");
  return [
    o.price ? `${s(PRICE_SEL)}{color:${o.price.hex} !important}` : "",
    o.badge ? `${s(BADGE_SEL)}{background:${o.badge.bg} !important;color:${o.badge.text} !important}` : "",
    o.promo ? `${s(PROMO_SEL)}{background:${o.promo.bg} !important;color:${o.promo.text} !important}` : "",
  ].join("\n");
}

/** 真實路由預覽（iframe 整份文件）用。 */
export function routeCss(o: Pick) {
  return scopedCss(":root", o);
}
