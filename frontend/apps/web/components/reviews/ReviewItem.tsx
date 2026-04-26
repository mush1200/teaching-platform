import type { MockReview } from "../../lib/mock-data";
import { IconStar, IconThumbsUp } from "../ui/icons";

const accentMap: Record<MockReview["avatarAccent"], string> = {
  violet: "bg-[#E8E4FF] text-[#6C63FF]",
  coral: "bg-[#FFE4E6] text-[#FF6B73]",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
};

type Props = {
  review: MockReview;
};

export function ReviewItem({ review }: Props) {
  return (
    <article className="rounded-3xl border border-[#E5E7EB]/80 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${accentMap[review.avatarAccent]}`}
          aria-hidden
        >
          {review.userName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#1F2937]">{review.userName}</span>
            <span className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <IconStar key={i} className={`size-3.5 ${i < review.rating ? "opacity-100" : "opacity-20"}`} />
              ))}
            </span>
            <time className="text-xs text-[#9CA3AF]" dateTime={review.date}>
              {review.date}
            </time>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">{review.content}</p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] px-3 py-1 text-xs font-medium text-[#6B7280] hover:border-[#6C63FF]/30 hover:text-[#6C63FF]"
          >
            <IconThumbsUp className="size-3.5" />
            {review.likes}
          </button>
        </div>
      </div>
    </article>
  );
}
