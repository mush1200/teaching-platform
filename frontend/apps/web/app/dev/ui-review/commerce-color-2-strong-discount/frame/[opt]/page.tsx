import { notFound } from "next/navigation";
import { StrongContext } from "../../StrongReview";
import { optionByKey } from "../../strong";

/**
 * 單一 ≥30% 候選的真實情境（**dev-only**），供審閱頁以 iframe 在 390／768／1440 呈現。
 * 產品 fixture 沒有折扣，因此以真元件＋指定原價示範，不改任何資料。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */
export default async function StrongDiscountFramePage({ params }: { params: Promise<{ opt: string }> }) {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  const { opt } = await params;
  const option = optionByKey(opt);
  if (!option) notFound();

  return (
    <div className="mx-auto w-full max-w-[1100px] px-page-mobile py-4 sm:px-page-tablet lg:px-page-desktop">
      <h1 className="mb-3 text-title text-ds-heading">
        ≥30% 方案 {option.key}（{option.bg} ＋ {option.text}）
      </h1>
      <StrongContext option={option} />
    </div>
  );
}
