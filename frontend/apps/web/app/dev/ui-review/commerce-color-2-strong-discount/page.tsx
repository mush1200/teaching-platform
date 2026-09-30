import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IframeVariants } from "../_review/IframeVariants";
import { SemanticComparison, StrongContext } from "./StrongReview";
import { CONTRAST_ROWS, MILD, STRONG_OPTIONS } from "./strong";

/**
 * 折扣 ≥30% 樣式的三個候選（**dev-only**，`UI-QA-COMMERCE-COLOR-2`，2026-10-01）。
 *
 * 只審閱、不實作：候選色只在本頁容器與 `frame/[opt]`（同樣 guarded）內套用，
 * canonical token 與視覺基準都沒有變。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */

const WIDTHS = [
  { w: 390, h: 1500, scale: 0.4 },
  { w: 768, h: 1300, scale: 0.36 },
  { w: 1440, h: 1100, scale: 0.26 },
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-title text-ds-heading">{title}</h2>
      {note ? <p className="mt-1 max-w-3xl text-sm text-ds-body">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function StrongDiscountReviewPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-COMMERCE-COLOR-2 · 強折扣</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">折扣 ≥30% 樣式：三個候選</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          請選一個 ≥30% 的折扣樣式。其餘規則本輪不變：價格 <code>#111827</code>、購物車徽章 <code>#C81E6E</code>＋白、
          通知徽章 <code>#5C4EEA</code>＋白、折扣 &lt;30% <code>{MILD.bg}</code>＋<code>{MILD.text}</code>、門檻 30%。
          前一版提案 <code>#FFF0F1</code>＋<code>#B91C1C</code> 因與錯誤樣式相同而排除。候選色只在本頁套用，產品未改。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {STRONG_OPTIONS.map((o) => (
          <div key={o.key} className="rounded-2xl border border-black/[0.06] bg-white p-4 text-sm text-ds-body">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: MILD.bg, color: MILD.text }}>
                20% OFF
              </span>
              <span className="text-meta">→</span>
              <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: o.bg, color: o.text }}>
                40% OFF
              </span>
            </div>
            <p className="text-lg font-bold text-ds-heading">
              方案 {o.key} · {o.name}
            </p>
            <dl className="mt-2 space-y-1">
              {(
                [
                  ["底／字", `${o.bg} ／ ${o.text}`],
                  ["RGB", o.rgb],
                  ["對比", `${o.contrast}:1（12px 粗體需 4.5，合格）`],
                  ["視覺", o.character],
                  ["相對 <30% 的醒目度", o.salience],
                  ["與錯誤撞色風險", o.vsError],
                  ["與立即購買撞色風險", o.vsBuyNow],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="inline font-semibold text-ds-heading">{k}：</dt>
                  <dd className="inline">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">對比（WCAG 2.x 計算）</h2>
        <table className="mt-2 w-full min-w-[600px] text-left">
          <thead>
            <tr className="border-b border-black/10 text-ds-heading">
              <th className="py-2 pr-4">樣式</th>
              <th className="py-2 pr-4">組合</th>
              <th className="py-2">對比</th>
            </tr>
          </thead>
          <tbody>
            {CONTRAST_ROWS.map(([a, b, c]) => (
              <tr key={a} className="border-b border-black/[0.05]">
                <td className="py-2 pr-4 font-semibold text-ds-heading">{a}</td>
                <td className="py-2 pr-4">{b}</td>
                <td className="py-2">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Section
        title="同一畫面比較"
        note="判斷三件事：≥30% 是否比 <30% 更醒目、是否不像錯誤、是否不會和立即購買搶。"
      >
        <SemanticComparison />
      </Section>

      <Section
        title="真實情境（桌機寬度，本頁內）"
        note="每一欄：頂欄購物車徽章、價格 #111827、紫色加入購物車、橘色立即購買、40% 折扣標籤，下方為教材卡（無折扣／20%／40%）。"
      >
        <div className="grid gap-6 xl:grid-cols-3">
          {STRONG_OPTIONS.map((o) => (
            <div key={o.key}>
              <p className="mb-2 text-sm font-bold text-ds-heading">
                方案 {o.key} <span className="font-mono font-medium text-ds-body">{o.bg} ＋ {o.text}</span>
              </p>
              <StrongContext option={o} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="390／768／1440"
        note="同一組真元件在三種寬度下的排版（iframe 載入 guarded 的 frame 頁；產品 fixture 沒有折扣，不修改任何資料）。"
      >
        {STRONG_OPTIONS.map((o) => (
          <div key={o.key} className="mt-6">
            <h3 className="text-title text-ds-heading">
              方案 {o.key}（{o.bg} ＋ {o.text}）
            </h3>
            <IframeVariants
              src={`/dev/ui-review/commerce-color-2-strong-discount/frame/${o.key}`}
              variants={[{ key: o.key, label: `方案 ${o.key}` }]}
              widths={WIDTHS}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}
