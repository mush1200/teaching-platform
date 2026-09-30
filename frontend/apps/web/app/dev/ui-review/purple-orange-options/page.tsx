import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IframeVariants } from "../_review/IframeVariants";
import type { Variant } from "../_review/IframeVariants";

/**
 * 紫＋橘商業配色方案比較（**dev-only**，`UI-QA-COMMERCE-COLOR`，2026-09-30）。
 *
 * Owner 已鎖定：品牌紫 `#5C4EEA`、加入購物車＝紫、**立即購買方向＝橘**、購買 CTA 不得像危險紅、
 * 字型 Inter ＋ Noto Sans TC、登入／註冊 CTA 漸層不變。本頁提供四個完整的橘色方案供 Owner 選 A／B／C／D。
 * **本頁不建立任何 token、不改任何元件** —— 上方為靜態樣本，下方「真實路由預覽」只在預覽 iframe 內注入 CSS。
 *
 * 色值由 OKLCH 推導並以 WCAG 2.x 相對亮度驗證（數值寫死於下方，產生方式見 tracker `UI-QA-COMMERCE-COLOR`）。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由 `ui-review-dev-guard.spec.ts` 自動納管。
 */

type Option = {
  key: string;
  name: string;
  base: string;
  rgb: string;
  oklch: string;
  text: string;
  textContrast: string;
  hover: string;
  hoverContrast: string;
  active: string;
  activeContrast: string;
  tint: string;
  character: string;
  separation: string;
  caveat?: string;
};

const PURPLE = "#5C4EEA";
const DARK = "#1F2937";

const CURRENT: Option = {
  key: "current",
  name: "現行（紅）",
  base: "#EA000D",
  rgb: "234, 0, 13",
  oklch: "oklch(0.589 0.241 28.4)",
  text: "#FFFFFF",
  textContrast: "4.66",
  hover: "#D1000C",
  hoverContrast: "5.54",
  active: "#D1000C",
  activeContrast: "5.54",
  tint: "#FFE4E6",
  character: "現行結帳紅 —— 與 danger（#DE1313）僅 ΔE 1.8，Owner 已決定不再用於購買",
  separation: "danger ΔE 1.8",
};

const OPTIONS: Option[] = [
  {
    key: "A",
    name: "Bright / Friendly",
    base: "#FE8742",
    rgb: "254, 135, 66",
    oklch: "oklch(0.744 0.166 48.1)",
    text: DARK,
    textContrast: "6.12",
    hover: "#FE7512",
    hoverContrast: "5.43",
    active: "#F16D02",
    activeContrast: "4.84",
    tint: "#FFF0E9",
    character: "明亮、友善、活潑；深色文字",
    separation: "warning 文字 ΔE 19.0｜琥珀 ΔE 6.8｜結帳紅 ΔE 18.6｜danger ΔE 19.5｜粉 ΔE 9.9｜紫 ΔE 41.0",
  },
  {
    key: "B",
    name: "Balanced Commerce",
    base: "#FF6917",
    rgb: "255, 105, 23",
    oklch: "oklch(0.700 0.200 43.0)",
    text: DARK,
    textContrast: "5.09",
    hover: "#F36002",
    hoverContrast: "4.53",
    active: "#F36002",
    activeContrast: "4.53",
    tint: "#FEF0EB",
    character: "飽和、有力的電商橘；深色文字",
    separation: "warning 文字 ΔE 15.6｜琥珀 ΔE 11.5｜結帳紅 ΔE 13.1｜danger ΔE 14.3｜粉 ΔE 8.9｜紫 ΔE 40.9",
    caveat: "深色文字的餘裕最小（5.09），hover 與按下只能壓暗一次（4.53）—— 按壓回饋需靠陰影／位移",
  },
  {
    key: "C",
    name: "Warm Burnt",
    base: "#CB4601",
    rgb: "203, 70, 1",
    oklch: "oklch(0.574 0.180 40.0)",
    text: "#FFFFFF",
    textContrast: "4.76",
    hover: "#BD4102",
    hoverContrast: "5.36",
    active: "#AF3C03",
    activeContrast: "6.05",
    tint: "#FEF0EB",
    character: "較深、沉穩的焦橘；白色文字（唯一白字方案）",
    separation: "warning 文字 ΔE 4.6｜danger ΔE 6.2｜結帳紅 ΔE 7.6｜琥珀 ΔE 21.5｜粉 ΔE 15.8｜紫 ΔE 35.4",
    caveat: "白字要過 AA 必須壓到這個深度 —— 與 warning 文字色（#B45309）ΔE 只有 4.6、與 danger ΔE 6.2，語意區分最弱",
  },
  {
    key: "D",
    name: "Soft Education",
    base: "#FF985B",
    rgb: "255, 152, 91",
    oklch: "oklch(0.776 0.145 49.9)",
    text: DARK,
    textContrast: "6.92",
    hover: "#F48E51",
    hoverContrast: "6.18",
    active: "#EA8547",
    activeContrast: "5.55",
    tint: "#FFF0E8",
    character: "柔和、溫暖的杏橘；深色文字；四個中最柔",
    separation: "warning 文字 ΔE 22.0｜琥珀 ΔE 5.8｜結帳紅 ΔE 22.1｜danger ΔE 23.1｜粉 ΔE 11.6｜紫 ΔE 41.4",
    caveat: "與琥珀色（星等）最接近（ΔE 5.8）；按鈕填色與淺紫頁面底色的非文字對比最低",
  },
];

const ALL = [CURRENT, ...OPTIONS];

function vars(o: Option): CSSProperties {
  return { "--o": o.base, "--o-text": o.text, "--o-hover": o.hover, "--o-active": o.active, "--o-tint": o.tint } as CSSProperties;
}

const BUY =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition bg-[var(--o)] text-[color:var(--o-text)] " +
  "hover:bg-[var(--o-hover)] active:bg-[var(--o-active)] disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";
const CART =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition bg-[var(--color-intent-action)] hover:brightness-95 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";

function Row({ title, note, children }: { title: string; note?: string; children: (o: Option) => ReactNode }) {
  return (
    <>
      <div className="col-span-full mt-6 border-t border-black/[0.06] pt-4">
        <h2 className="text-title text-ds-heading">{title}</h2>
        {note ? <p className="mt-0.5 text-meta text-ds-body">{note}</p> : null}
      </div>
      {ALL.map((o) => (
        <div key={o.key} style={vars(o)} className="flex flex-wrap items-center gap-2">
          {children(o)}
        </div>
      ))}
    </>
  );
}

function PurchaseStrip({ bg }: { bg: string }) {
  return (
    <div className={`w-full rounded-xl p-3 ${bg}`}>
      <p className="text-lg font-extrabold text-ds-heading">NT$120</p>
      <div className="mt-2 flex flex-col gap-2">
        <span className={`${CART} min-h-11 px-4 text-sm`}>加入購物車</span>
        <span className={`${BUY} min-h-11 px-4 text-sm`}>立即購買</span>
      </div>
    </div>
  );
}

/** 依 Owner 已鎖定的原則推導出的用途對應（兩個以上方案都相同，只有橘色的值不同）。 */
const MAPPING: Array<[string, string, string]> = [
  ["1. 直接購買 CTA", "立即購買、前往結帳、結帳的「下一步／確認送出訂單」（`intent=\"flow\"` 的購買路徑）", "→ 商業橘（新的獨立 token，不沿用 warning）"],
  ["2. 加入購物車／品牌動作", "加入購物車、篩選、審核等 `intent=\"action\"`", "紫 `#5C4EEA`（不變）"],
  ["3. 錯誤／危險", "`intent=\"danger\"`、錯誤訊息", "紅（不變）"],
  ["4. 成功／警告／資訊", "status 徽章與訊息", "不變"],
  ["5. 裝飾性強調", "圖表 active 長條（`fill-edu-cta`）、連結 hover 變紅（`hover:text-edu-cta`）", "→ 品牌紫系（紅不再承擔裝飾角色）"],
  ["6. 數量／通知徽章", "Topbar 購物車徽章 `#FF6B73`、買家側欄徽章 `#FF6B7A`（白字僅 2.7）", "→ 品牌紫（白字 5.63）"],
  ["7. 結帳步驟指示", "`CheckoutStepper` 目前步驟 `#FF6B73`", "→ 商業橘（屬購買流程）"],
  ["8. 非購買的主要動作", "新增教材、上傳付款憑證、查看教材、送出回饋、Hero「立即探索」、首頁「開始逛教材」、Admin 凍結帳號等（目前也是紅）", "→ 品牌紫（紅只留給危險、橘只留給購買）"],
  ["9. 價格文字", "`text-edu-cta`（目前紅字價格）", "→ 深色標題字（橘色當文字在白底上只有 2.1–2.9，達不到 AA）"],
  ["10. 折扣標籤", "「% OFF」", "→ 商業橘淡底 ＋ 深色文字"],
];

function routeCss(o: Option) {
  const flowBtn = '[class*="bg-[var(--color-intent-flow)]"],[class*="bg-intent-flow"]';
  return [
    `:root{--color-intent-flow:${o.base};--color-brand-cta:${o.base};--color-brand-cta-hover:${o.hover};--shadow-button-flow:0 8px 24px rgba(${o.rgb},0.28)}`,
    `${flowBtn}{color:${o.text} !important}`,
    `span[aria-current="step"][class*="FF6B73"]{background:${o.base} !important;color:${o.text} !important}`,
    `span.rounded-full[class*="FF6B7"]{background:${PURPLE} !important}`,
    `.text-edu-cta{color:${DARK} !important}`,
  ].join("\n");
}

const ROUTE_VARIANTS: Variant[] = ALL.map((o) => ({
  key: o.key,
  label: o.key === "current" ? "現行" : `方案 ${o.key}`,
  css: o.key === "current" ? undefined : routeCss(o),
}));

export default function PurpleOrangeOptionsPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-COMMERCE-COLOR</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">紫＋橘商業配色方案比較</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          <strong>已決定（Owner，2026-09-30）：方案 A <code>#FE8742</code>。</strong>本頁保留作為決策紀錄；
          下一題「橘色上的文字色」見 <Link href="/dev/ui-review/orange-cta-text" className="text-ds-textAccent underline">/dev/ui-review/orange-cta-text</Link>。
          原題：請在 A／B／C／D 之中選一個「立即購買」的橘色。加入購物車維持品牌紫 <code>{PURPLE}</code>。
          「現行」欄只作對照（現行結帳紅）。每一欄最下方也放了 warning／error／success／粉色，方便判斷語意是否分得開。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white p-5">
        <div className="grid min-w-[1180px] grid-cols-5 gap-x-5 gap-y-3">
          {ALL.map((o) => (
            <div key={o.key} style={vars(o)}>
              <div className="h-14 rounded-xl bg-[var(--o)]" aria-hidden />
              <p className="mt-2 text-lg font-bold text-ds-heading">
                {o.key === "current" ? "現行" : `方案 ${o.key}`}
                <span className="ml-2 font-mono text-sm font-medium text-ds-body">{o.base}</span>
              </p>
              <p className="text-meta text-ds-body">{o.name}</p>
              <p className="text-meta text-ds-body">rgb({o.rgb})</p>
              <p className="text-meta text-ds-body">{o.oklch}</p>
              <p className="mt-1 text-sm">
                文字 <code>{o.text}</code>：<strong className="font-mono">{o.textContrast}:1</strong>
              </p>
              <p className="text-meta text-ds-body">
                hover <code>{o.hover}</code> {o.hoverContrast}｜按下 <code>{o.active}</code> {o.activeContrast}
              </p>
              <p className="text-meta text-ds-body">淡底 <code>{o.tint}</code> ＋ 深色文字 13.2</p>
              <p className="mt-1 text-meta text-ds-body">{o.character}</p>
              <p className="mt-1 text-meta text-ds-body">{o.separation}</p>
              {o.caveat ? <p className="mt-1 text-meta font-semibold text-status-pendingReviewText">注意：{o.caveat}</p> : null}
            </div>
          ))}

          <Row title="1. 加入購物車（紫）＋ 立即購買（本題）" note="教材詳情購買區的主要組合">
            {() => (
              <>
                <span className={`${CART} min-h-11 px-4 text-sm`}>加入購物車</span>
                <span className={`${BUY} min-h-11 px-4 text-sm`}>立即購買</span>
              </>
            )}
          </Row>
          <Row title="2. 大型 CTA" note="購物車「前往結帳」">
            {() => <span className={`${BUY} min-h-12 w-full px-6 text-base`}>前往結帳 · NT$240 →</span>}
          </Row>
          <Row title="3. 小型 CTA" note="sm 尺寸（觸控目標仍 ≥ 44px）">
            {() => (
              <>
                <span className={`${BUY} min-h-11 px-3 text-sm`}>購買</span>
                <span className={`${BUY} min-h-11 px-3 text-sm`}>Buy now</span>
              </>
            )}
          </Row>
          <Row title="4. 結帳送出" note="結帳最後一步">
            {() => <span className={`${BUY} min-h-12 w-full px-6 text-base`}>確認送出訂單 · NT$240</span>}
          </Row>
          <Row title="5. 購買條（白底／淺紫底／卡片）" note="價格用深色字（橘色當文字過不了 AA）">
            {() => (
              <div className="w-full space-y-2">
                <PurchaseStrip bg="bg-white border border-black/10" />
                <PurchaseStrip bg="bg-edu-page" />
                <PurchaseStrip bg="bg-ds-surface shadow-ds-card" />
              </div>
            )}
          </Row>
          <Row title="6. Hover／按下／Focus／Disabled（靜態示意）">
            {() => (
              <div className="flex flex-col gap-2">
                <span className={`${BUY} min-h-11 px-4 text-sm !bg-[var(--o-hover)]`}>Hover 立即購買</span>
                <span className={`${BUY} min-h-11 px-4 text-sm !bg-[var(--o-active)]`}>按下 立即購買</span>
                <span className={`${BUY} min-h-11 px-4 text-sm outline outline-2 outline-offset-2 outline-ds-focus`}>Focus 立即購買</span>
                <button type="button" disabled className={`${BUY} min-h-11 px-4 text-sm`}>
                  Disabled 立即購買
                </button>
              </div>
            )}
          </Row>
          <Row title="7. 手機購買列（390 底部固定列）">
            {() => (
              <div className="w-full rounded-xl border border-black/10 bg-white p-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[4.5rem] flex-1">
                    <p className="text-meta text-ds-body">合計</p>
                    <p className="text-base font-extrabold text-ds-heading">NT$120</p>
                  </div>
                  <span className={`${CART} min-h-11 px-3 text-sm`}>購物車</span>
                  <span className={`${BUY} min-h-11 px-3 text-sm`}>立即購買</span>
                </div>
              </div>
            )}
          </Row>
          <Row title="8. 結帳步驟、折扣標籤、數量徽章" note="步驟目前格＝商業橘；折扣＝淡底＋深字；徽章＝品牌紫（見下方對應表）">
            {() => (
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--o)] text-xs font-bold text-[color:var(--o-text)] ring-4 ring-[color-mix(in_srgb,var(--o)_20%,transparent)]">
                  2
                </span>
                <span className="rounded-full bg-[var(--o-tint)] px-2 py-0.5 text-xs font-bold text-ds-heading">20% OFF</span>
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-edu-primary px-1 text-[10px] font-semibold text-white">
                  2
                </span>
              </div>
            )}
          </Row>
          <Row title="9. 語意鄰居" note="同一畫面上的 warning／error／success／粉色，本題的橘必須與它們分得開">
            {() => (
              <div className="flex flex-col items-start gap-1.5">
                <span className={`${BUY} min-h-9 px-3 text-xs`}>立即購買</span>
                <span className="rounded-full bg-status-pendingReviewBg px-2 py-0.5 text-xs font-semibold text-status-pendingReviewText">待審核（warning）</span>
                <span className="rounded-full bg-[var(--color-feedback-error-bg)] px-2 py-0.5 text-xs font-semibold text-edu-error">錯誤（error）</span>
                <span className="rounded-full bg-status-approvedBg px-2 py-0.5 text-xs font-semibold text-status-approvedText">已核准（success）</span>
                <span className="rounded-full bg-[#FF6B7A] px-2 py-0.5 text-xs font-semibold text-white">裝飾粉（現行）</span>
              </div>
            )}
          </Row>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">用途對應（現有紅／粉的分類，四個方案共用）</h2>
        <p className="mt-1 max-w-3xl">
          並非所有現在的紅／粉都變成橘。下表依已鎖定的原則推導：紅只留給危險、橘只留給購買、品牌動作用紫。
          選定方案只決定「商業橘」的值；若對某一列的對應有不同意見，選擇時一併註明即可。
        </p>
        <table className="mt-3 w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-black/10 text-ds-heading">
              <th className="py-2 pr-4">類別</th>
              <th className="py-2 pr-4">目前在哪裡</th>
              <th className="py-2">提案</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map(([cat, where, to]) => (
              <tr key={cat} className="border-b border-black/[0.05] align-top">
                <td className="py-2 pr-4 font-semibold text-ds-heading">{cat}</td>
                <td className="py-2 pr-4">{where}</td>
                <td className="py-2">{to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-title text-ds-heading">真實路由預覽</h2>
        <p className="mt-1 max-w-3xl text-sm text-ds-body">
          以下是真實頁面，只在預覽框內套用方案（購買 CTA、結帳步驟、徽章、價格文字依上表）。
          購物車與結帳需要買家身分：請先在另一個分頁以 <code>buyer@ui-review.local</code> 從 <code>/login</code> 登入。
        </p>
        <h3 className="mt-6 text-title text-ds-heading">教材詳情</h3>
        <IframeVariants
          src="/materials/uir_mat_baseline"
          variants={ROUTE_VARIANTS}
          widths={[
            { w: 390, h: 780, scale: 0.46 },
            { w: 1440, h: 900, scale: 0.2 },
          ]}
        />
        <h3 className="mt-8 text-title text-ds-heading">購物車（手機）</h3>
        <IframeVariants src="/cart" variants={ROUTE_VARIANTS} widths={[{ w: 390, h: 780, scale: 0.46 }]} />
        <h3 className="mt-8 text-title text-ds-heading">結帳（手機）</h3>
        <IframeVariants src="/checkout" variants={ROUTE_VARIANTS} widths={[{ w: 390, h: 780, scale: 0.46 }]} />
      </section>
    </div>
  );
}
