import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IframeVariants } from "../_review/IframeVariants";
import type { Variant } from "../_review/IframeVariants";
import { Cards, DetailPanels, Headers, SemanticRow } from "./FinalReview";
import { CONCERNS, CONTRAST, RULES, priceAndBadgeCss } from "./rules";

/**
 * `UI-QA-COMMERCE-COLOR-2` 提案規則的最終 Owner 審閱（**dev-only**，2026-10-01）。
 *
 * **只審閱、不實作**：提案色只在本頁容器與預覽 iframe 內以 CSS 覆寫套上，
 * 產品的 canonical token 與視覺基準都沒有變。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */

const WIDTHS = [
  { w: 390, h: 780, scale: 0.42 },
  { w: 768, h: 900, scale: 0.3 },
  { w: 1440, h: 900, scale: 0.2 },
];

/** 真實路由：現況 vs 提案（價格＋購物車／待處理訂單徽章；fixture 沒有折扣，折扣見上方真元件示範）。 */
const ROUTE_VARIANTS: Variant[] = [
  { key: "current", label: "現況" },
  { key: "proposed", label: "提案", css: priceAndBadgeCss(":root") },
];

const RULE_ROWS: Array<[string, string, string]> = [
  ["價格", `文字 ${RULES.price.text}`, "一般價格／商業資訊。不是危險、不是警示、不是 CTA"],
  ["購物車徽章", `${RULES.cartBadge.bg} ＋ ${RULES.cartBadge.text}`, "只用於購物車數量與購買相關的待處理數（例如待付款／被退回的訂單）"],
  ["一般通知徽章", `${RULES.notificationBadge.bg} ＋ ${RULES.notificationBadge.text}`, "只用於未讀／新通知數等一般資訊提醒（產品目前沒有此用途）"],
  ["折扣 <30%", `${RULES.promoMild.bg} ＋ ${RULES.promoMild.text}`, "一般折扣、溫和促銷"],
  ["折扣 ≥30%", `${RULES.promoStrong.bg} ＋ ${RULES.promoStrong.text}`, "只用於 ≥30% 的真實折扣標籤"],
  ["門檻", `${RULES.threshold}%`, "平台規則（不是數學或業界標準）；以畫面顯示的整數百分比判定"],
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

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm text-ds-body">
        <thead>
          <tr className="border-b border-black/10 text-ds-heading">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-black/[0.05] align-top">
              {r.map((c, i) => (
                <td key={i} className={`py-2 pr-4 ${i === 0 ? "font-semibold text-ds-heading" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CommerceColor2FinalReviewPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-COMMERCE-COLOR-2 · FINAL REVIEW</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">商業配色語意規則 —— 最終審閱</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          這一頁審閱一整套提案規則（尚未核准、尚未實作）。所有區塊都是真的產品元件；提案色只在本頁套用，產品目前仍是現況。
          已鎖定、不在本題：品牌紫 <code>#5C4EEA</code>、加入購物車（紫＋白）、立即購買（<code>#FE8742</code> ＋ <code>#111827</code>）。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <section className="rounded-2xl border border-black/[0.06] bg-white p-5">
        <h2 className="text-title text-ds-heading">提案規則</h2>
        <div className="mt-3">
          <Table head={["項目", "顏色", "用途"]} rows={RULE_ROWS} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border-2 border-status-pendingReviewText/40 bg-white p-5">
        <h2 className="text-title text-ds-heading">再稽核：發現的疑慮</h2>
        <div className="mt-3">
          <Table head={["疑慮", "證據", "建議"]} rows={CONCERNS} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-5">
        <h2 className="text-title text-ds-heading">對比（WCAG 2.x 計算，不只靠 axe）</h2>
        <div className="mt-3">
          <Table head={["組合", "實際字級／門檻", "對比", "結果"]} rows={CONTRAST} />
        </div>
      </section>

      <Section title="C1. 教材詳情" note="同一畫面：頂欄購物車徽章（3）、標題、價格、紫色加入購物車、橘色立即購買、折扣標籤。版本 1 為 20%（溫和），版本 2 為 40%（強）。">
        <DetailPanels />
      </Section>

      <Section title="C2. 教材卡" note="真元件 MaterialCard：價格、原價（刪除線）、折扣標籤。A 無折扣／B 15%／C 30%（門檻）／D 45%。">
        <Cards />
      </Section>

      <Section title="C3. 頂欄與徽章" note="真元件 Topbar（購物車 1／3／9／120）與側欄徽章；通知徽章為示意（產品目前沒有此用途）。手機版見下方真實路由 390。">
        <Headers />
      </Section>

      <Section title="C4. 語意比較" note="確認：促銷不像錯誤、購物車徽章不像危險、通知徽章不像購買、立即購買仍是最明確的購買動作。">
        <SemanticRow />
      </Section>

      <Section
        title="C5. 真實路由預覽（現況 vs 提案）"
        note="價格與購物車／待處理訂單徽章以提案色套在真實頁面上。fixture 沒有折扣（產品目前也不會顯示折扣），折扣以上方真元件示範。買家頁需要先在另一個分頁以 buyer@ui-review.local 從 /login 登入。結帳頁的合計本來就是深色字，只有頂欄徽章受影響。"
      >
        {[
          ["教材詳情", "/materials/uir_mat_baseline"],
          ["教材列表", "/materials"],
          ["買家首頁（頂欄＋側欄徽章）", "/dashboard"],
          ["購物車", "/cart"],
          ["結帳", "/checkout"],
        ].map(([title, src]) => (
          <div key={src} className="mt-6">
            <h3 className="text-title text-ds-heading">{title}</h3>
            <IframeVariants src={src} variants={ROUTE_VARIANTS} widths={WIDTHS} />
          </div>
        ))}
      </Section>
    </div>
  );
}
