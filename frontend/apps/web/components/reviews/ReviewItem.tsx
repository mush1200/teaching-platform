import type { MockReview } from "../../lib/view-models";
import { IconStar } from "../ui/icons";

const accentMap: Record<MockReview["avatarAccent"], string> = {
  violet: "bg-[#E8E4FF] text-[#6C63FF]",
  coral: "bg-[#FFE4E6] text-[#FF6B73]",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
};

type Props = {
  review: MockReview;
  /** Shown under the author row when listing reviews in mixed contexts */
  materialTitle?: string;
  compact?: boolean;
  showRoleBadge?: boolean;
  showAuthorName?: boolean;
};

const roleBadgeMap: Record<MockReview["audienceRole"], string> = {
  parent: "bg-sky-50 text-sky-700 border-sky-100",
  teacher: "bg-violet-50 text-violet-700 border-violet-100",
};

/*
 * 徽章文案。**key 是內部 role 常數，value 才是 UI 文案** ——
 * key 不得改（DB / API / 權限契約用的是 `parent` / `teacher`，見
 * `docs/ui-role-naming-checklist.md` 的 Scope），value 一律用 canonical 稱呼：
 * 購買者／創作者，不得出現「家長」「老師」（CLAUDE.md §2、`COR-04`）。
 */
const roleLabelMap: Record<MockReview["audienceRole"], string> = {
  parent: "購買者",
  teacher: "創作者",
};

export function ReviewItem({ review, materialTitle, compact = false, showRoleBadge = true, showAuthorName = true }: Props) {
  return (
    <article className={`border border-[#E5E7EB] bg-white ${compact ? "rounded-2xl p-5" : "rounded-[16px] p-5"} shadow-sm`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex text-amber-400" aria-label={`${review.rating} 星`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <IconStar key={i} className={`size-3.5 ${i < review.rating ? "opacity-100" : "opacity-20"}`} />
          ))}
        </span>
        {showRoleBadge ? (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeMap[review.audienceRole]}`}>
            {roleLabelMap[review.audienceRole]}
          </span>
        ) : null}
        {materialTitle ? (
          <span className="text-xs font-medium text-[#6C63FF]">《{materialTitle}》</span>
        ) : null}
        {!compact && review.date ? (
          <time className="ml-auto text-xs text-[#9CA3AF]" dateTime={review.date}>
            {review.date}
          </time>
        ) : null}
      </div>
      <p className={`${compact ? "mt-2 line-clamp-3 text-sm" : "mt-3 text-sm"} leading-relaxed text-[#4B5563]`}>{review.content}</p>
      <div className="mt-3 flex items-center gap-2">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${accentMap[review.avatarAccent]}`}
          aria-hidden
        >
          {showAuthorName ? review.userName.slice(0, 1) : "匿"}
        </div>
        {showAuthorName ? <span className="text-xs font-medium text-[#6B7280]">— {review.userName}</span> : null}
      </div>
    </article>
  );
}
