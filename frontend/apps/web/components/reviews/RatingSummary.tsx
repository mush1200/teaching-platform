import { IconStar } from "../ui/icons";
import { mockStarDistribution } from "../../lib/mock-data";

type Props = {
  average: number;
  reviewCount: number;
};

export function RatingSummary({ average, reviewCount }: Props) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB]/80 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <p className="text-5xl font-bold text-[#1F2937]">{average.toFixed(1)}</p>
          <div>
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <IconStar key={i} className={i < Math.round(average) ? "opacity-100" : "opacity-25"} />
              ))}
            </div>
            <p className="mt-1 text-sm text-[#6B7280]">{reviewCount} 個評價</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {mockStarDistribution.map((pct, idx) => {
            const stars = 5 - idx;
            return (
              <div key={stars} className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 text-[#6B7280]">{stars} 星</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F3F4F6]">
                  <div className="h-full rounded-full bg-[#6C63FF]/70" style={{ width: `${pct * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-[#9CA3AF]">{Math.round(pct * 100)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
