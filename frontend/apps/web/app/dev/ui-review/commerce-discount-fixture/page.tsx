import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscountFixture } from "./DiscountFixture";

/**
 * 折扣渲染路徑的驗證 fixture（**dev-only**，`UI-QA-COMMERCE-COLOR-2` 已決定並實作，2026-10-01）。
 *
 * 產品資料目前不產生折扣，這一頁以真元件呈現 0／10／20／29／30／40／50%，
 * 驗證 `lib/commerce.ts` 的 30% 門檻與 `commerce.discount*` token。不是選項頁。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */
export default function CommerceDiscountFixturePage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-COMMERCE-COLOR-2 · FIXTURE</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">折扣標籤驗證 fixture</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          已決定並已實作（不是選項）：&lt;30% <code>#FFF0E9</code> ＋ <code>#111827</code>；≥30% <code>#FFD4B8</code> ＋ <code>#7C2D12</code>。
          產品資料目前沒有原價，因此真實頁面不會出現折扣標籤；這裡以真元件＋指定原價驗證門檻（29% 溫和、30% 強）。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>
      <DiscountFixture />
    </div>
  );
}
