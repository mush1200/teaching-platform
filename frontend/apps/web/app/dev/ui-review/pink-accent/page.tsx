import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * 粉色強調色候選比較頁（**dev-only**，`UI-QA-A11Y-03`，2026-09-29）。
 *
 * 現行粉 `#FF6B73` 被當成**白字的底色**使用（買家總覽 Hero CTA、結帳步驟的目前步驟、
 * 購物車數量徽章），白字只有 2.76:1。本頁把現行色與三個候選並排在真實元件樣式上，
 * 供 Owner 選 A／B／C。**本頁不改任何 token、不替換任何既有色值；axe 的 `UI-QA-A11Y-03` 例外維持不動。**
 *
 * ## 候選色的產生方式
 *
 * OKLCH（感知均勻）中降低亮度直到白字 ≥ 4.5，彩度略提高以維持鮮豔度：
 *   - A：色相不變（19.7°）—— 最接近現行，但會靠近結帳主 CTA 的紅 `#EA000D`
 *   - B：往玫瑰方向轉 12°（7.8°）—— 保留粉的暖度，與紅明確分開
 *   - C：往覆盆子方向轉 20°（359°）—— 最深、最偏粉紫，與紅最遠
 * 每一欄同時放上品牌紫 `#5C4EEA` 與結帳紅，才看得出「是否還分得開」。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。純靜態展示，
 * 沒有任何登入繞道、不發 API、不寫 cookie／storage。
 */

type Swatch = {
  key: string;
  label: string;
  hex: string;
  rgb: string;
  onWhite: number;
  hue: string;
  deltaFromRed: string;
  character: string;
};

/* 數值：WCAG 2.x 相對亮度公式；色相與 ΔE 為 OKLCH／OKLab。 */
const SWATCHES: Swatch[] = [
  { key: "current", label: "現行", hex: "#FF6B73", rgb: "255, 107, 115", onWhite: 2.76, hue: "19.7°", deltaFromRed: "—", character: "現行粉（淺、亮）" },
  { key: "A", label: "A", hex: "#DD2E47", rgb: "221, 46, 71", onWhite: 4.61, hue: "19.5°", deltaFromRed: "4.8", character: "同色相壓暗 —— 最接近現行，但靠近結帳紅" },
  { key: "B", label: "B", hex: "#D62A63", rgb: "214, 42, 99", onWhite: 4.8, hue: "7.8°", deltaFromRed: "8.7", character: "玫瑰粉 —— 保留暖度，與紅分得開" },
  { key: "C", label: "C", hex: "#C81E6E", rgb: "200, 30, 110", onWhite: 5.43, hue: "359.4°", deltaFromRed: "12.3", character: "覆盆子粉 —— 最深、最偏粉紫" },
];

const AA = 4.5;
const BRAND_PURPLE = "#5C4EEA";
const FLOW_RED = "#EA000D";

function columnStyle(hex: string): CSSProperties {
  return { "--p": hex } as CSSProperties;
}

function Row({ title, note, children }: { title: string; note?: string; children: (s: Swatch) => ReactNode }) {
  return (
    <>
      <div className="col-span-full mt-6 border-t border-black/[0.06] pt-4">
        <h2 className="text-title text-ds-heading">{title}</h2>
        {note ? <p className="mt-0.5 text-meta text-ds-body">{note}</p> : null}
      </div>
      {SWATCHES.map((s) => (
        <div key={s.key} style={columnStyle(s.hex)} className="flex flex-wrap items-center gap-2">
          {children(s)}
        </div>
      ))}
    </>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6 fill-none stroke-current stroke-2">
      <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6" />
      <circle cx="10" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}

export default function PinkAccentComparisonPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-A11Y-03</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">粉色強調色候選比較</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          請在 A／B／C 之中選一個。每一欄是同一組實際元件，只有粉色不同；每一欄也放了品牌紫
          <code className="mx-1">{BRAND_PURPLE}</code>與結帳紅<code className="mx-1">{FLOW_RED}</code>，
          方便判斷粉色是否仍與它們分得開。「現行」欄只作對照 —— 它的白字對比未達 AA。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white p-5">
        <div className="grid min-w-[960px] grid-cols-4 gap-x-6 gap-y-3">
          {SWATCHES.map((s) => (
            <div key={s.key} style={columnStyle(s.hex)}>
              <div className="h-16 rounded-xl bg-[var(--p)]" aria-hidden />
              <p className="mt-2 text-lg font-bold text-ds-heading">
                {s.key === "current" ? "現行" : `候選 ${s.label}`}
                <span className="ml-2 font-mono text-sm font-medium text-ds-body">{s.hex}</span>
              </p>
              <p className="text-meta text-ds-body">rgb({s.rgb})</p>
              <p className="text-meta text-ds-body">
                色相 {s.hue} · 與結帳紅差距 ΔE {s.deltaFromRed}
              </p>
              <p className="text-meta text-ds-body">{s.character}</p>
              <p className="mt-1 text-sm">
                白字對比 <strong className="font-mono">{s.onWhite.toFixed(2)}:1</strong>{" "}
                {s.onWhite >= AA ? (
                  <span className="rounded-full bg-status-approvedBg px-2 py-0.5 text-xs font-semibold text-status-approvedText">
                    AA 通過
                  </span>
                ) : (
                  <span className="rounded-full bg-[var(--color-feedback-error-bg)] px-2 py-0.5 text-xs font-semibold text-edu-error">
                    AA 未通過
                  </span>
                )}
              </p>
            </div>
          ))}

          <Row title="1. 買家總覽 Hero CTA" note="components/parent/Hero.tsx —— 淺紫卡片上的「立即探索」">
            {() => (
              <div className="w-full rounded-[20px] bg-gradient-to-r from-[#EDE9FE] to-[#F4F1FF] p-4">
                <p className="text-base font-bold text-ds-heading">探索適合你的教材</p>
                <p className="mb-3 text-xs text-ds-body">為你的教學與學習提供靈感</p>
                <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--p)] px-3.5 text-[14px] font-semibold text-white">
                  立即探索
                </span>
              </div>
            )}
          </Row>

          <Row title="2. 結帳步驟指示" note="components/checkout/CheckoutStepper.tsx —— 已完成（品牌紫）／目前（粉）／未開始">
            {() => (
              <ol className="flex w-full items-start justify-between">
                {[
                  ["✓", "帳單資訊", "done"],
                  ["2", "付款方式", "current"],
                  ["3", "審核確認", "todo"],
                ].map(([mark, label, state]) => (
                  <li key={label} className="flex flex-col items-center text-center">
                    <span
                      className={`flex size-9 items-center justify-center rounded-full text-xs font-bold ${
                        state === "done"
                          ? "bg-edu-primary text-white"
                          : state === "current"
                            ? "bg-[var(--p)] text-white ring-4 ring-[color-mix(in_srgb,var(--p)_20%,transparent)]"
                            : "border border-[#E5E7EB] bg-white text-ds-textSubtle"
                      }`}
                    >
                      {mark}
                    </span>
                    <span className="mt-2 text-[11px] font-semibold text-ds-body">{label}</span>
                  </li>
                ))}
              </ol>
            )}
          </Row>

          <Row title="3. 數量徽章" note="Topbar 購物車徽章與買家側欄的數量徽章（10px 白字）">
            {() => (
              <div className="flex items-center gap-6">
                <span className="relative inline-flex size-10 items-center justify-center rounded-full text-ds-heading">
                  <CartIcon />
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--p)] px-1 text-[10px] font-bold text-white">
                    2
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-sm text-ds-body">
                  購物車
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--p)] px-1 text-[10px] font-semibold leading-none text-white">
                    12
                  </span>
                </span>
              </div>
            )}
          </Row>

          <Row title="4. 折扣標籤（淡底）" note="MaterialCard 的「% OFF」—— 粉色只當 10% 底色，文字維持錯誤紅 token">
            {() => (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--p)_10%,white)] px-2 py-0.5 text-xs font-bold text-feedback-errorText">
                20% OFF
              </span>
            )}
          </Row>

          <Row title="5. 與品牌紫、結帳紅並排" note="同一畫面上的三種強調色：粉（本題）、品牌紫 action、結帳紅 flow">
            {() => (
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--p)] px-3.5 text-sm font-semibold text-white">立即探索</span>
                <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--color-intent-action)] px-3.5 text-sm font-semibold text-white">加入購物車</span>
                <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--color-intent-flow)] px-3.5 text-sm font-semibold text-white">立即購買</span>
              </div>
            )}
          </Row>

          <Row title="6. Hover 與 Focus（靜態示意）" note="hover 以 brightness-95 壓暗（對比只會更高）；focus 為 2px ds-focus outline">
            {() => (
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--p)] px-3.5 text-sm font-semibold text-white brightness-95">
                  Continue · 繼續
                </span>
                <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--p)] px-3.5 text-sm font-semibold text-white outline outline-2 outline-offset-2 outline-ds-focus">
                  Save · 儲存
                </span>
              </div>
            )}
          </Row>

          <Row title="7. 淺紫頁面底色上" note="edu-page（#F4F1FF）">
            {() => (
              <div className="w-full rounded-xl bg-edu-page p-3">
                <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--p)] px-3.5 text-sm font-semibold text-white">
                  立即探索
                </span>
              </div>
            )}
          </Row>
        </div>
      </div>

      <section className="mt-6 max-w-3xl text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">這一頁沒有改動的東西</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            現行粉目前寫死在 <code>Hero.tsx</code>、<code>CheckoutStepper.tsx</code>、<code>Topbar.tsx</code>（<code>#FF6B73</code>）與
            <code>Sidebar.tsx</code>（相近的 <code>#FF6B7A</code>），另有 <code>MaterialCard.tsx</code> 的 10% 淡底與 <code>--shadow-button-flow</code> 的 rgba。
            選定後才會收斂成一個 token 並替換。
          </li>
          <li>品牌紫 <code>#5C4EEA</code>、字型（Inter ＋ Noto Sans TC）、登入／註冊的 CTA 漸層都不在本題範圍。</li>
          <li>axe gate 的 <code>UI-QA-A11Y-03</code> 例外維持不動，選定並套用後才會移除。</li>
        </ul>
      </section>
    </div>
  );
}
