import Link from "next/link";
import { notFound } from "next/navigation";
import { IframeVariants } from "../_review/IframeVariants";
import type { Variant } from "../_review/IframeVariants";

/**
 * `/materials` 雙頂欄的方案比較（**dev-only**，`UI-REV-E`，2026-09-30）。
 *
 * 以真實的 `/materials`（UI Review fixture，未登入）在 390／768／1440 並排呈現「現況」與三個方案。
 * 方案只在預覽 iframe 內以 CSS／具名 DOM 調整模擬，**不改任何 canonical 導覽** —— Owner 選定後才實作。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */

const GLOBAL_BAR = 'header:has([data-testid="nav-drawer-trigger"])';
const ROUTE_BAR = 'header:has(button[aria-label="選單"])';

const VARIANTS: Variant[] = [
  { key: "current", label: "現況" },
  { key: "A", label: "方案 A", css: `${ROUTE_BAR}{display:none !important}` },
  {
    key: "B",
    label: "方案 B",
    css: `${GLOBAL_BAR}{display:none !important} @media (min-width:1024px){${ROUTE_BAR}{display:none !important}}`,
  },
  { key: "C", label: "方案 C", css: `${ROUTE_BAR}{display:none !important}`, mutate: "merge-cart-into-global-bar" },
];

const WIDTHS = [
  { w: 390, h: 760, scale: 0.62 },
  { w: 768, h: 900, scale: 0.4 },
  { w: 1440, h: 900, scale: 0.26 },
];

const OPTIONS = [
  {
    key: "A",
    title: "保留全站頂欄，移除路由自帶頂欄",
    keeps: "全站頂欄（EDUMARKET 探索教材 ＋ 選單）；桌機只剩左側欄；390 的底部導覽不變",
    removes: "`app/materials/page.tsx` 自帶的 `MobileHeader`（EduMarket／搜尋／購物車）與它專屬的抽屜",
    nav: "首頁、教材列表、登入、註冊、聯絡平台都在全站選單。失去頂欄的「購物車」捷徑（390 仍在底部導覽；未登入者進購物車本來就會被導去登入）。「搜尋」按鈕目前沒有任何功能，移除沒有實際損失",
    complexity: "低 —— 只改 `app/materials/page.tsx`：拿掉 `AppShell`／`MobileHeader`／自帶抽屜",
    shared: "無（不動任何共用外殼）",
  },
  {
    key: "B",
    title: "保留路由頂欄，在此路由隱藏全站頂欄",
    keeps: "路由頂欄（EduMarket／搜尋／購物車）；桌機：左側欄，路由頂欄隱藏",
    removes: "此路由 1024 以下的全站頂欄",
    nav: "路由自帶的抽屜沒有「註冊」與「聯絡平台」（未登入者唯一的客服入口，`PRE-14`）—— 實作時必須補上，否則會失去入口。搜尋按鈕仍無功能，需另行接上或移除",
    complexity: "中 —— `RoleShell` 需要「此路由不渲染行動頂欄」的例外，且要同步兩份抽屜內容",
    shared: "有：`RoleShell` 多一個路由例外，與「外殼擁有導覽」的規則相反",
  },
  {
    key: "C",
    title: "合併為一條：全站頂欄接手購物車捷徑",
    keeps: "一條全站頂欄（選單 ＋ 品牌 ＋ 右側購物車）；桌機只剩左側欄",
    removes: "路由自帶的 `MobileHeader` 與抽屜；無功能的搜尋按鈕",
    nav: "所有全站選單項目保留；購物車捷徑保留在頂欄（所有非 Admin 路由一致）",
    complexity: "中 —— `NavDrawer` 的 `MobileNavBar` 增加右側動作區（`RoleShell` 決定何時顯示購物車），並拿掉路由自帶頂欄",
    shared: "有：`MobileNavBar` 也用於 Creator 外殼 —— 右側動作區需依角色決定（創作者不顯示購物車）",
  },
];

export default function MaterialsTopbarOptionsPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-REV-E</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">/materials 頂欄方案比較</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          請在 A／B／C 之中選一個。下方每一格都是<strong>真實的 /materials</strong>（未登入狀態）——
          請用<strong>未登入</strong>的瀏覽器視窗開啟本頁，已登入的買家會被導向 /explore。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">現況與根因</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>全站頂欄</strong>：`RoleShell`（未登入外殼）在 1024 以下渲染「EDUMARKET 探索教材 ＋ 選單」，選單為首頁／教材列表／登入／註冊／聯絡平台；1024 以上改為左側欄。
          </li>
          <li>
            <strong>路由頂欄</strong>：`app/materials/page.tsx` 自己再包一層 `AppShell` ＋ `MobileHeader`（EduMarket／搜尋／購物車 ＋ 另一個選單），<strong>在所有寬度都顯示</strong> ——
            所以 390／768 是兩條頂欄、兩個內容不同的選單；1440 是左側欄再加一條頂欄。
          </li>
          <li>路由頂欄的「搜尋」按鈕<strong>沒有任何功能</strong>（無 handler）。</li>
          <li>分類：IA／導覽擁有權衝突（路由重做了外殼已擁有的 chrome），不是斷點錯誤。</li>
        </ul>
      </section>

      <div className="mb-10 grid gap-4 lg:grid-cols-3">
        {OPTIONS.map((o) => (
          <section key={o.key} className="rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
            <h2 className="text-title text-ds-heading">
              方案 {o.key}：{o.title}
            </h2>
            <dl className="mt-3 space-y-2">
              {[
                ["保留", o.keeps],
                ["移除", o.removes],
                ["導覽能力", o.nav],
                ["實作複雜度", o.complexity],
                ["共用外殼影響", o.shared],
              ].map(([term, desc]) => (
                <div key={term}>
                  <dt className="font-semibold text-ds-heading">{term}</dt>
                  <dd>{desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <IframeVariants src="/materials" variants={VARIANTS} widths={WIDTHS} />
    </div>
  );
}
