import Link from "next/link";
import type { MockMaterial } from "../../lib/mock-data";

type Props = {
  material: MockMaterial;
  subtitle?: string;
};

export function ProductCard({ material, subtitle }: Props) {
  const href = `/materials/${material.id}`;
  const line =
    subtitle ??
    (material.description.length > 42 ? `${material.description.slice(0, 42)}…` : material.description);

  return (
    <article className="group">
      <div className="overflow-hidden rounded-3xl border border-[#E5E7EB]/80 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_18px_48px_rgba(108,99,255,0.15)]">
        <div className={`relative aspect-[4/3] bg-gradient-to-br ${material.coverGradient}`}>
          <Link href={href} className="absolute inset-0 z-0" aria-label={material.title} />
          <button
            type="button"
            className="relative z-10 ml-auto mr-3 mt-3 flex size-9 items-center justify-center rounded-full bg-white/95 text-[#9CA3AF] shadow-sm transition hover:text-[#FF6B73]"
            aria-label="收藏"
          >
            ♡
          </button>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
            {material.ageLabel.replace(/^適合\s*/, "").trim()}
          </div>
        </div>
        <Link href={href} className="flex flex-col gap-1.5 p-4">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-[#1F2937] group-hover:text-[#6C63FF]">
            {material.title}
          </h3>
          <p className="line-clamp-2 text-xs text-[#6B7280]">{line}</p>
          <div className="flex items-center gap-1 text-amber-500">
            <span aria-hidden>⭐</span>
            <span className="text-sm font-semibold text-[#1F2937]">{material.rating.toFixed(1)}</span>
            <span className="text-xs text-[#6B7280]">({material.reviewCount})</span>
          </div>
          <p className="pt-1 text-lg font-bold text-[#FF6B73]">NT${material.price.toLocaleString()}</p>
        </Link>
      </div>
    </article>
  );
}
