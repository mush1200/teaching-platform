import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IframeVariants } from "../_review/IframeVariants";
import type { Variant } from "../_review/IframeVariants";
import { BadgeComparison, CombinedMatrix, PriceComparison, PromoComparison } from "./CommerceColor2Review";
import { BADGE_OPTIONS, CURRENT, PRICE_OPTIONS, PROMO_OPTIONS, routeCss } from "./options";

/**
 * 價格／數量徽章／折扣 的配色方案比較（**dev-only**，`UI-QA-COMMERCE-COLOR-2`，2026-09-30）。
 *
 * 已鎖定（Owner）：品牌紫 `#5C4EEA`、加入購物車＝紫＋白、立即購買＝`#FE8742` ＋ `#111827`、Inter ＋ Noto Sans TC。
 * 這一頁只回答剩下的三個顏色問題；比較用的都是**真的**產品元件與真實路由，
 * 候選色只在本頁容器／預覽 iframe 內以 CSS 覆寫套上 —— **不改任何 canonical token**。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */

const CATEGORIES: Array<[string, string, string, string]> = [
  ["1. 錯誤／危險", "表單錯誤、失敗狀態、退回、凍結、登出 hover、刪除（intent=danger、edu-error、feedback-error*、status-rejected*、rose-600/700/800）", "全部合格（最低 4.40 為 16px 圖示，非文字門檻 3:1）", "KEEP 紅色"],
  ["2. 警示／急迫狀態", "逾期標記、已下架通知、創作者待回覆案件數、待付款狀態（#BE123C on #FFE4E6 5.24）", "合格", "KEEP（與購買語意分開）"],
  ["3. 價格", "教材詳情主價格、sticky 合計、買家首頁商品卡價格（text-edu-cta #EA000D）", "白底 4.66；淺紫頁面 4.19（18px 以下不合格）", "REVIEW → 本頁「價格」"],
  ["4. 折扣／促銷", "教材詳情「% OFF」（#EA000D on 10% 淡底）、教材卡「% OFF」（#B91C1C on #FF6B73/10）", "詳情 3.92 不合格；卡片 5.85", "REVIEW → 本頁「折扣」"],
  ["5. 數量徽章", "買家頂欄購物車（#FF6B73）、買家側欄導覽徽章（#FF6B7A），白字", "2.76／2.75 不合格", "REVIEW → 本頁「徽章」"],
  ["6. 非購買主要動作", "探索、上傳付款憑證、新增教材、送出回饋、下載、檢舉送出、登入／探索連結（intent=flow #EA000D 白字）", "4.66 合格", "KEEP（依 Owner 指示不自動改橘）"],
  ["7. 裝飾／圖表／legacy", "圖表 active 長條、連結 hover 變紅、flow 按鈕的舊粉陰影、封面漸層、Google 標誌、legacy Tamagui token", "非文字；legacy pendingPayment #ff6b73 on #ffe4e6 2.30（CardBadge 無呼叫端）", "REVIEW／DEPRECATE（不在本頁決定）"],
];

const PRICE_ROUTE: Variant[] = [
  { key: "current", label: "現況" },
  ...PRICE_OPTIONS.map((o) => ({ key: o.key, label: `價格 ${o.key}`, css: routeCss({ price: o }) })),
];
const BADGE_ROUTE: Variant[] = [
  { key: "current", label: "現況" },
  ...BADGE_OPTIONS.map((o) => ({ key: o.key, label: `徽章 ${o.key}`, css: routeCss({ badge: o }) })),
];

function OptionCard({ title, swatch, rows }: { title: string; swatch: ReactNode; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 text-sm text-ds-body">
      <div className="mb-3">{swatch}</div>
      <p className="text-lg font-bold text-ds-heading">{title}</p>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="inline font-semibold text-ds-heading">{k}：</dt>
            <dd className="inline">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-title text-ds-heading">{title}</h2>
      {note ? <p className="mt-1 max-w-3xl text-sm text-ds-body">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function CommerceColor2Page() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-COMMERCE-COLOR-2</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">價格、數量徽章、折扣 配色方案比較</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          請各選一個：<strong>價格 A／B／C</strong>、<strong>徽章 A／B／C</strong>、<strong>折扣 A／B／C</strong>。
          已鎖定、不在本題：品牌紫 <code>#5C4EEA</code>、加入購物車（紫＋白）、立即購買（<code>#FE8742</code> ＋ <code>#111827</code>）、字型。
          下方都是真的產品元件；候選色只在本頁套用，產品目前仍是「現況」。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <section className="rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">現況與盤點（紅／粉，依語意分類）</h2>
        <p className="mt-1">
          現況：價格 <code>{CURRENT.price.hex}</code>（{CURRENT.price.contrast}；{CURRENT.price.note}）；徽章 {CURRENT.badge.bg} ＋ 白字 {CURRENT.badge.contrast}；
          折扣：{CURRENT.promo.detail}、{CURRENT.promo.card}。完整逐行清單見 <code>docs/ui-commerce-color-2-inventory.md</code>。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-black/10 text-ds-heading">
                <th className="py-2 pr-4">類別</th>
                <th className="py-2 pr-4">用在哪裡</th>
                <th className="py-2 pr-4">對比</th>
                <th className="py-2">處置</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(([c, w, k, a]) => (
                <tr key={c} className="border-b border-black/[0.05] align-top">
                  <td className="py-2 pr-4 font-semibold text-ds-heading">{c}</td>
                  <td className="py-2 pr-4">{w}</td>
                  <td className="py-2 pr-4">{k}</td>
                  <td className="py-2">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Section title="價格 A／B／C" note="教材詳情購買區（真元件：價格＋紫色加入購物車＋橘色立即購買）與教材卡；手機 sticky 購買列見下方真實路由預覽（390）。價格不是按鈕 —— 它應該是清楚的商業資訊，不像錯誤、也不和立即購買搶焦點。">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          {PRICE_OPTIONS.map((o) => (
            <OptionCard
              key={o.key}
              title={`價格 ${o.key} · ${o.hex}`}
              swatch={<p className="text-3xl font-extrabold" style={{ color: o.hex }}>NT$120</p>}
              rows={[
                ["名稱", o.name],
                ["RGB", o.rgb],
                ["對比", o.contrast],
                ["視覺", o.character],
                ["與立即購買", o.competes],
              ]}
            />
          ))}
        </div>
        <PriceComparison options={PRICE_OPTIONS} />
      </Section>

      <Section title="數量徽章 A／B／C" note="買家頂欄（真元件 Topbar，購物車 2 與 12）、買家側欄導覽徽章、前往結帳；購物車品項見下方真實路由預覽。徽章 10px 粗體，白字必須 ≥ 4.5:1。">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          {BADGE_OPTIONS.map((o) => (
            <OptionCard
              key={o.key}
              title={`徽章 ${o.key} · ${o.bg}`}
              swatch={
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold" style={{ background: o.bg, color: o.text }}>
                  12
                </span>
              }
              rows={[
                ["名稱", o.name],
                ["文字", o.text],
                ["RGB", o.rgb],
                ["對比", o.contrast],
                ["視覺", o.character],
                ["撞色風險（ΔE_ok）", o.collisions],
              ]}
            />
          ))}
        </div>
        <BadgeComparison options={BADGE_OPTIONS} />
      </Section>

      <Section
        title="折扣 A／B／C"
        note="目前折扣標籤與徽章共用舊粉色，但語意不同（折扣是購買動機，徽章是數量提醒），因此分開選；不強迫與徽章同色。"
      >
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          {PROMO_OPTIONS.map((o) => (
            <OptionCard
              key={o.key}
              title={`折扣 ${o.key}`}
              swatch={
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: o.bg, color: o.text }}>
                  20% OFF
                </span>
              }
              rows={[
                ["名稱", o.name],
                ["底／字", `${o.bg} ／ ${o.text}`],
                ["對比", o.contrast],
                ["視覺", o.character],
              ]}
            />
          ))}
        </div>
        <PromoComparison options={PROMO_OPTIONS} />
      </Section>

      <Section title="組合：價格 × 徽章" note="九個組合，每一格同時有：數量徽章、價格、紫色加入購物車、橘色立即購買 —— 用來判斷整體配色，而不是單一顏色。">
        <CombinedMatrix prices={PRICE_OPTIONS} badges={BADGE_OPTIONS} />
      </Section>

      <Section
        title="真實路由預覽"
        note="以下是真實頁面，只在預覽框內套用候選色。買家首頁與購物車需要買家身分：請先在另一個分頁以 buyer@ui-review.local 從 /login 登入（密碼在 Backend/.ui-review-credentials.txt）。結帳頁的小計／合計本來就是深色字，與本題無關，因此不列。"
      >
        <h3 className="text-title text-ds-heading">教材詳情（價格）</h3>
        <IframeVariants
          src="/materials/uir_mat_baseline"
          variants={PRICE_ROUTE}
          widths={[
            { w: 390, h: 780, scale: 0.5 },
            { w: 1440, h: 900, scale: 0.22 },
          ]}
        />
        <h3 className="mt-8 text-title text-ds-heading">買家首頁（頂欄徽章、側欄徽章、商品卡價格）</h3>
        <IframeVariants
          src="/dashboard"
          variants={BADGE_ROUTE}
          widths={[
            { w: 390, h: 780, scale: 0.5 },
            { w: 1440, h: 900, scale: 0.22 },
          ]}
        />
        <h3 className="mt-8 text-title text-ds-heading">購物車（徽章、品項價格、前往結帳）</h3>
        <IframeVariants
          src="/cart"
          variants={BADGE_ROUTE}
          widths={[
            { w: 390, h: 780, scale: 0.5 },
            { w: 1440, h: 900, scale: 0.22 },
          ]}
        />
      </Section>
    </div>
  );
}
