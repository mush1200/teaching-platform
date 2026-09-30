/**
 * `UI-QA-COMMERCE-COLOR-2` 提案規則（**未核准、未實作**）與再稽核數據（dev-only）。
 *
 * 選擇器對應日後要改的確切 class（與 `../commerce-color-2/options.ts` 相同）：
 *   價格 `text-edu-cta`；購物車／訂單待處理徽章 `bg-[#FF6B73]`（Topbar）與 `bg-[#FF6B7A]`（Sidebar）；
 *   折扣 `bg-edu-cta/10`（詳情）與 `bg-[#FF6B73]/10`（卡片）。
 */

export const RULES = {
  price: { text: "#111827" },
  cartBadge: { bg: "#C81E6E", text: "#FFFFFF" },
  notificationBadge: { bg: "#5C4EEA", text: "#FFFFFF" },
  promoMild: { bg: "#FFF0E9", text: "#111827" },
  promoStrong: { bg: "#FFF0F1", text: "#B91C1C" },
  threshold: 30,
} as const;

/** 再稽核後的建議替代（只在比較列示範，不是提案的一部分）。 */
export const STRONG_ALT = { bg: "#FFE4D4", text: "#9A3412" } as const;

const PRICE_SEL = [".text-edu-cta"];
const BADGE_SEL = ['span[class*="bg-[#FF6B73]"]:not([class*="/10"])', 'span[class*="bg-[#FF6B7A]"]'];
const PROMO_SEL = ['span[class*="bg-edu-cta/10"]', 'span[class*="bg-[#FF6B73]/10"]'];

const sel = (scope: string, sels: string[]) => sels.map((x) => `${scope} ${x}`).join(", ");

export function priceAndBadgeCss(scope: string) {
  return [
    `${sel(scope, PRICE_SEL)}{color:${RULES.price.text} !important}`,
    `${sel(scope, BADGE_SEL)}{background:${RULES.cartBadge.bg} !important;color:${RULES.cartBadge.text} !important}`,
  ].join("\n");
}

export function promoCss(scope: string, style: { bg: string; text: string }) {
  return `${sel(scope, PROMO_SEL)}{background:${style.bg} !important;color:${style.text} !important}`;
}

/** 門檻以**畫面上顯示的整數百分比**判定（與元件的 `Math.round` 一致），避免「顯示 30% 卻是溫和樣式」。 */
export function promoFor(percent: number) {
  return percent >= RULES.threshold ? RULES.promoStrong : RULES.promoMild;
}

export const CONTRAST: Array<[string, string, string, string]> = [
  ["購物車徽章 白字 on #C81E6E", "10px 粗體（需 4.5）", "5.43", "合格"],
  ["通知徽章 白字 on #5C4EEA", "10px 粗體（需 4.5）", "5.63", "合格"],
  ["折扣 <30% #111827 on #FFF0E9", "12px 粗體（需 4.5）", "15.96", "合格"],
  ["折扣 ≥30% #B91C1C on #FFF0F1", "12px 粗體（需 4.5）", "5.85", "合格"],
  ["價格 #111827 on 白", "詳情 30–32px 特粗（需 3）／商品卡 18px 粗（需 4.5）", "17.74", "合格"],
  ["價格 #111827 on 淺紫頁面 #F4F1FF／卡片 #FAF8FF", "同上", "15.94／16.84", "合格"],
  ["購物車徽章 vs 側欄 active 列底 #EBEAFC", "非文字（需 3）", "4.58", "合格"],
  ["通知徽章 vs 側欄 active 列底 #EBEAFC", "非文字（需 3）", "4.74", "合格"],
];

export const CONCERNS: Array<[string, string, string]> = [
  [
    "折扣 ≥30% ＝ 錯誤樣式",
    "文字 #B91C1C 與全站錯誤文字（feedback-errorText／status-rejectedText）完全相同（ΔE 0.0）；底色 #FFF0F1 與錯誤底 #FEF2F2 ΔE 0.5、與退回底 #FEE2E2 ΔE 3.5。放在錯誤訊息旁幾乎無法分辨（見下方「語意比較」）。",
    "有疑慮 —— 建議改為同一個購買暖色家族的加強版，例如 #FFE4D4 ＋ #9A3412（6.02，與錯誤文字 ΔE 6.6、與購買橘同家族）",
  ],
  [
    "折扣 <30% 與 ≥30% 的底色幾乎相同",
    "#FFF0E9 與 #FFF0F1 ΔE 僅 1.1 —— 30% 門檻只靠文字顏色（深 vs 紅）表現；兩個淡底貼在白色卡片上的對比都只有 1.11。",
    "若採用上面的替代，強折扣改為較深的橘底（#FFE4D4），兩級差異會出現在底色而不只是字色",
  ],
  [
    "通知徽章目前沒有使用處",
    "平台沒有通知系統（BUY-06 已移除假的通知鈕與紅點）。買家側欄的兩個徽章是「購物車數量」與「待處理訂單（待付款＋被退回）」—— 依提案規則兩者都屬「購買相關的待處理數」，應用購物車徽章色。",
    "可以核准為保留規則，但它今天不會出現在任何畫面；不要為了用它而新增通知功能",
  ],
  [
    "折扣目前不會出現在產品上",
    "lib/material-mapper.ts 把 originalPrice 設為 price，後端沒有原價欄位 —— MaterialCard／教材詳情的「% OFF」永遠不會渲染。30% 門檻在真實資料上無法驗證；本頁以真元件＋指定原價示範。",
    "可以核准為保留規則；門檻以畫面顯示的整數百分比判定",
  ],
  [
    "購物車徽章仍屬紅粉家族",
    "#C81E6E 與 danger #DE1313 ΔE 11.2、與強折扣文字 ΔE 10.8 —— 可分辨，但同一頁若同時有強折扣與錯誤，紅粉色會出現三次。",
    "單獨看沒有問題（頂欄只有一顆徽章）；若強折扣採替代色，這個疑慮同時消失",
  ],
  [
    "徽章上限不一致（非顏色問題）",
    "Topbar 購物車徽章上限顯示「99+」，側欄徽章上限「9+」。",
    "記錄；與配色無關，不在本題",
  ],
];
