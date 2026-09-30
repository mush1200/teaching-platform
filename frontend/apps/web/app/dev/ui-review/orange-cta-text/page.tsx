import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "../../../../components/ui/Button";
import { IframeVariants } from "../_review/IframeVariants";
import type { Variant } from "../_review/IframeVariants";

/**
 * 「立即購買」橘色 CTA 的**文字色**方案比較（**dev-only**，`UI-QA-COMMERCE-COLOR`，2026-09-30）。
 *
 * 已鎖定（Owner）：立即購買底色 `#FE8742`、加入購物車 = 品牌紫 `#5C4EEA` ＋ 白字、字型 Inter ＋ Noto Sans TC。
 * 這一頁只回答「`#FE8742` 上的字用什麼顏色」。按鈕一律是**真的** `components/ui/Button`
 * （`intent="flow"`／`"action"`），只在本頁以 CSS 變數與 class 覆寫顏色 ——
 * **不改任何 canonical token**，關掉這一頁產品就是原樣。
 *
 * hover／按下的底色沿用紫＋橘比較頁方案 A 的推導值（`#FE7512`／`#F16D02`）：每個文字候選在
 * 三種底色上都必須 ≥ 4.5:1，這一頁的數字就是以這三個底色計算的。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */

const ORANGE = "#FE8742";
const ORANGE_HOVER = "#FE7512";
const ORANGE_ACTIVE = "#F16D02";
const PURPLE = "#5C4EEA";

type Candidate = {
  key: string;
  name: string;
  hex: string;
  rgb: string;
  /** 對 base／hover／active 三種底色的對比。 */
  contrast: [string, string, string];
  viable: boolean;
  /** Tailwind 需要字面 class 字串才會產生規則，所以每個候選寫死自己的 class。 */
  textClass: string;
  character: string;
  note?: string;
};

const CANDIDATES: Candidate[] = [
  {
    key: "A",
    name: "Near-black",
    hex: "#111111",
    rgb: "17, 17, 17",
    contrast: ["7.88", "6.98", "6.23"],
    viable: true,
    textClass: "!text-[#111111]",
    character: "最銳利、對比最高；中性、無色偏。像促銷標籤般直接有力 —— 在柔和的暖橘上也最「重」，可能略顯生硬",
    note: "純黑 #000000 為 8.76，更重；此處取近黑以稍微降低刺眼感",
  },
  {
    key: "B",
    name: "Dark neutral gray",
    hex: "#27272A",
    rgb: "39, 39, 42",
    contrast: ["6.21", "5.51", "4.91"],
    viable: true,
    textClass: "!text-[#27272A]",
    character: "柔和、現代、SaaS 感的中性深灰；最不搶戲。三個狀態中餘裕最小（按下 4.91），字重偏輕時會顯得略灰",
    note: "再淺一階（如 #374151／#3F3F46，本站內文色）只有 4.3，不合格",
  },
  {
    key: "C",
    name: "Blue-black（設計系統標題色）",
    hex: "#111827",
    rgb: "17, 24, 39",
    contrast: ["7.40", "6.56", "5.85"],
    viable: true,
    textClass: "!text-[#111827]",
    character: "冷調藍黑，與全站標題與價格同一個墨色（--ds-text-heading）；清楚但不像純黑那麼硬，冷調與品牌紫呼應",
    note: "不新增顏色：直接沿用既有 token",
  },
  {
    key: "D",
    name: "Warm espresso",
    hex: "#431407",
    rgb: "67, 20, 7",
    contrast: ["6.53", "5.79", "5.16"],
    viable: true,
    textClass: "!text-[#431407]",
    character: "暖調深咖啡（同色相的深橘棕），tone-on-tone、最溫暖友善、最有「教育／手作」感；不是中性色，遠看可能偏棕、較不俐落",
    note: "全站唯一使用處會是這顆按鈕（新顏色）",
  },
];

const WHITE_REFERENCE = {
  hex: "#FFFFFF",
  contrast: ["2.40", "2.70", "3.03"] as const,
};

/** 本頁內的 flow 按鈕改用 `#FE8742` 系列底色（只影響本頁 DOM 子樹）。 */
const ORANGE_SCOPE = {
  "--color-intent-flow": ORANGE,
  "--color-brand-cta-hover": ORANGE_HOVER,
} as CSSProperties;

/** 真實按鈕的按下底色（canonical flow 的 active 等於 hover；本題提案為再深一階）。 */
const ACTIVE_CLASS = "active:!bg-[#F16D02]";
/** `shadow-button-flow` 在 Tailwind 裡是寫死的粉紅 rgba（不是 CSS 變數），橘色按鈕必須另外覆寫。 */
const ORANGE_SHADOW = "!shadow-[0_8px_24px_rgba(254,135,66,0.28)]";
const FORCE_HOVER = "!bg-[#FE7512]";
const FORCE_ACTIVE = "!bg-[#F16D02]";
const FORCE_FOCUS = "outline outline-2 outline-offset-2 outline-ds-focus";

function BuyButton({
  c,
  children,
  className = "",
  ...rest
}: {
  c: Candidate;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  return (
    <Button intent="flow" className={`${c.textClass} ${ACTIVE_CLASS} ${ORANGE_SHADOW} ${className}`.trim()} {...rest}>
      {children}
    </Button>
  );
}

function CartButton({ children = "加入購物車", ...rest }: { children?: ReactNode; fullWidth?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <Button intent="action" {...rest}>
      {children}
    </Button>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-title text-ds-heading">{title}</h2>
      {note ? <p className="mt-1 max-w-3xl text-sm text-ds-body">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ title, children }: { title: string; children: (c: Candidate) => ReactNode }) {
  return (
    <>
      <p className="col-span-full mt-4 border-t border-black/[0.06] pt-3 text-sm font-semibold text-ds-heading">{title}</p>
      {CANDIDATES.map((c) => (
        <div key={c.key} className="min-w-0">
          {children(c)}
        </div>
      ))}
    </>
  );
}

function PurchasePanel({ c, surface }: { c: Candidate; surface: string }) {
  return (
    <div className={`rounded-2xl p-4 ${surface}`}>
      <p className="text-meta text-ds-body">教材價格</p>
      <p className="text-2xl font-extrabold text-ds-heading">NT$120</p>
      <div className="mt-3 flex flex-col gap-2">
        <CartButton fullWidth />
        <BuyButton c={c} fullWidth>
          立即購買
        </BuyButton>
      </div>
    </div>
  );
}

function routeCss(c: Candidate) {
  const flowBtn = '[class*="bg-[var(--color-intent-flow)]"]';
  return [
    `:root{--color-intent-flow:${ORANGE};--color-brand-cta:${ORANGE};--color-brand-cta-hover:${ORANGE_HOVER}}`,
    `${flowBtn}{color:${c.hex} !important;box-shadow:0 8px 24px rgba(254,135,66,0.28) !important}`,
    `${flowBtn}:active{background:${ORANGE_ACTIVE} !important}`,
    `span[aria-current="step"][class*="FF6B73"]{background:${ORANGE} !important;color:${c.hex} !important}`,
    `.text-edu-cta{color:#111827 !important}`,
  ].join("\n");
}

const ROUTE_VARIANTS: Variant[] = CANDIDATES.map((c) => ({
  key: c.key,
  label: `方案 ${c.key}（${c.hex}）`,
  css: routeCss(c),
}));

export default function OrangeCtaTextOptionsPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop" style={ORANGE_SCOPE}>
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-COMMERCE-COLOR</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">立即購買（橘）文字色方案比較</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          請在 A／B／C／D 之中選一個 <code>{ORANGE}</code> 上的文字色。底色、加入購物車（紫 <code>{PURPLE}</code> ＋ 白字）與字型都已鎖定，
          本頁不會改變它們。每個候選在底色、hover（<code>{ORANGE_HOVER}</code>）與按下（<code>{ORANGE_ACTIVE}</code>）三種狀態都通過 WCAG AA。
          按鈕都是真的元件：滑過、按下、Tab 聚焦都可以直接試。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CANDIDATES.map((c) => (
          <div key={c.key} className="rounded-2xl border border-black/[0.06] bg-white p-4 text-sm text-ds-body">
            <BuyButton c={c} fullWidth size="lg">
              立即購買
            </BuyButton>
            <p className="mt-3 text-lg font-bold text-ds-heading">
              方案 {c.key}
              <span className="ml-2 font-mono text-sm font-medium text-ds-body">{c.hex}</span>
            </p>
            <p className="text-meta">{c.name}</p>
            <p className="text-meta">rgb({c.rgb})</p>
            <p className="mt-1">
              對比 <strong className="font-mono">{c.contrast[0]}:1</strong>
              <span className="ml-1 rounded bg-status-approvedBg px-1.5 py-0.5 text-xs font-semibold text-status-approvedText">AA 通過</span>
            </p>
            <p className="text-meta">
              hover {c.contrast[1]}｜按下 {c.contrast[2]}
            </p>
            <p className="mt-2">{c.character}</p>
            {c.note ? <p className="mt-1 text-meta">{c.note}</p> : null}
          </div>
        ))}
        <div className="rounded-2xl border border-dashed border-black/20 bg-white p-4 text-sm text-ds-body">
          <span
            aria-hidden
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl text-base font-semibold text-white"
            style={{ background: ORANGE }}
          >
            立即購買
          </span>
          <p className="mt-3 text-lg font-bold text-ds-heading">
            參考：白字
            <span className="ml-2 font-mono text-sm font-medium text-ds-body">{WHITE_REFERENCE.hex}</span>
          </p>
          <p className="mt-1">
            對比 <strong className="font-mono">{WHITE_REFERENCE.contrast[0]}:1</strong>
            <span className="ml-1 rounded bg-[var(--color-feedback-error-bg)] px-1.5 py-0.5 text-xs font-semibold text-edu-error">AA 不合格</span>
          </p>
          <p className="text-meta">
            hover {WHITE_REFERENCE.contrast[1]}｜按下 {WHITE_REFERENCE.contrast[2]}
          </p>
          <p className="mt-2">只作對照，<strong>不是候選</strong>：白字在這個橘上連大字標準（3:1）都達不到。</p>
        </div>
      </div>

      <Section title="桌機" note="教材詳情桌機版的購買區寬度；按鈕高 44px（md）／48px（lg）。">
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white p-5">
          <div className="grid min-w-[1080px] grid-cols-4 gap-x-5 gap-y-3">
            {CANDIDATES.map((c) => (
              <p key={c.key} className="text-sm font-bold text-ds-heading">
                方案 {c.key} <span className="font-mono font-medium text-ds-body">{c.hex}</span>
              </p>
            ))}
            <Row title="1. 並排：加入購物車（紫）＋ 立即購買（橘）">
              {(c) => (
                <div className="flex gap-2">
                  <CartButton />
                  <BuyButton c={c}>立即購買</BuyButton>
                </div>
              )}
            </Row>
            <Row title="2. 狀態（第一顆是真的按鈕，可直接滑過／按下／Tab；其餘為靜態示意）">
              {(c) => (
                <div className="flex flex-col gap-2">
                  <BuyButton c={c}>一般 立即購買</BuyButton>
                  <BuyButton c={c} className={FORCE_HOVER}>
                    Hover 立即購買
                  </BuyButton>
                  <BuyButton c={c} className={FORCE_ACTIVE}>
                    按下 立即購買
                  </BuyButton>
                  <BuyButton c={c} className={FORCE_FOCUS}>
                    Focus 立即購買
                  </BuyButton>
                  <BuyButton c={c} disabled>
                    Disabled 立即購買
                  </BuyButton>
                </div>
              )}
            </Row>
            <Row title="3. 滿版 CTA（購物車「前往結帳」、結帳「確認送出訂單」）">
              {(c) => (
                <div className="flex flex-col gap-2">
                  <BuyButton c={c} fullWidth size="lg">
                    前往結帳 · NT$240 →
                  </BuyButton>
                  <BuyButton c={c} fullWidth>
                    確認送出訂單 · NT$240
                  </BuyButton>
                </div>
              )}
            </Row>
            <Row title="4. 購買區：白底／淺紫頁面底／卡片">
              {(c) => (
                <div className="space-y-3">
                  <PurchasePanel c={c} surface="border border-black/10 bg-white" />
                  <PurchasePanel c={c} surface="bg-edu-page" />
                  <PurchasePanel c={c} surface="bg-ds-surface shadow-ds-card" />
                </div>
              )}
            </Row>
          </div>
        </div>
      </Section>

      <Section title="手機（390 寬）" note="每一欄是一個 390px 寬的手機畫面；按鈕滿版堆疊，底部為固定購買列。">
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4">
            {CANDIDATES.map((c) => (
              <div key={c.key} className="w-[390px] shrink-0 rounded-[28px] border border-black/10 bg-edu-page p-4">
                <p className="text-sm font-bold text-ds-heading">
                  方案 {c.key} <span className="font-mono font-medium text-ds-body">{c.hex}</span>
                </p>
                <div className="mt-3 rounded-2xl bg-white p-4 shadow-ds-card">
                  <p className="text-base font-bold text-ds-heading">小一數學加減法練習單（20 以內）</p>
                  <p className="mt-1 text-2xl font-extrabold text-ds-heading">NT$120</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <CartButton fullWidth />
                    <BuyButton c={c} fullWidth>
                      立即購買
                    </BuyButton>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <BuyButton c={c} className={FORCE_HOVER}>
                    Hover
                  </BuyButton>
                  <BuyButton c={c} className={FORCE_ACTIVE}>
                    按下
                  </BuyButton>
                  <BuyButton c={c} className={FORCE_FOCUS}>
                    Focus
                  </BuyButton>
                  <BuyButton c={c} disabled>
                    Disabled
                  </BuyButton>
                </div>
                <div className="mt-3">
                  <BuyButton c={c} fullWidth size="lg">
                    前往結帳 · NT$240 →
                  </BuyButton>
                </div>
                <div className="mt-3 rounded-2xl border border-black/10 bg-white p-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center gap-2">
                    <div className="min-w-[4.5rem] flex-1">
                      <p className="text-meta text-ds-body">合計</p>
                      <p className="text-base font-extrabold text-ds-heading">NT$120</p>
                    </div>
                    <CartButton size="sm">購物車</CartButton>
                    <BuyButton c={c} size="sm">
                      立即購買
                    </BuyButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="真實路由預覽"
        note="以下是真實頁面，只在預覽框內把購買 CTA 改為 #FE8742 ＋ 該方案的文字色（結帳步驟目前格同樣套用；價格文字改深色）。購物車與結帳需要買家身分：請先在另一個分頁以 buyer@ui-review.local 從 /login 登入。"
      >
        <h3 className="text-title text-ds-heading">教材詳情</h3>
        <IframeVariants
          src="/materials/uir_mat_baseline"
          variants={ROUTE_VARIANTS}
          widths={[
            { w: 390, h: 780, scale: 0.5 },
            { w: 1440, h: 900, scale: 0.22 },
          ]}
        />
        <h3 className="mt-8 text-title text-ds-heading">購物車</h3>
        <IframeVariants
          src="/cart"
          variants={ROUTE_VARIANTS}
          widths={[
            { w: 390, h: 780, scale: 0.5 },
            { w: 1440, h: 900, scale: 0.22 },
          ]}
        />
        <h3 className="mt-8 text-title text-ds-heading">結帳</h3>
        <IframeVariants src="/checkout" variants={ROUTE_VARIANTS} widths={[{ w: 390, h: 780, scale: 0.5 }]} />
      </Section>
    </div>
  );
}
