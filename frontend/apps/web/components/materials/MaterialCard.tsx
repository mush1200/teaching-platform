import Link from "next/link";
import type { MockMaterial } from "../../lib/mock-data";
import { recordMaterialView } from "../../lib/recent-materials";
import { IconHeart, IconStar } from "../ui/icons";

type Props = {
  material: MockMaterial;
  /** When true, records this material in recent views (localStorage) on navigate */
  trackRecent?: boolean;
};

export function MaterialCard({ material, trackRecent }: Props) {
  const href = `/materials/${material.id}`;
  const off =
    material.originalPrice > material.price
      ? Math.round((1 - material.price / material.originalPrice) * 100)
      : 0;
  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-[#E5E7EB]/80 bg-white shadow-[0_10px_36px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_16px_48px_rgba(108,99,255,0.12)]">
      <div className={`relative aspect-[4/3] bg-gradient-to-br ${material.coverGradient}`}>
        {material.coverImageUrl ? (
          <img
            src={material.coverImageUrl}
            alt={material.title}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <Link
          href={href}
          className="absolute inset-0 z-0"
          aria-label={material.title}
          onClick={() => {
            if (trackRecent) recordMaterialView(material.id);
          }}
        />
        <button
          type="button"
          className="relative z-10 ml-auto mr-3 mt-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-[#6B7280] shadow-sm hover:text-[#FF6B73]"
          aria-label="收藏"
        >
          <IconHeart />
        </button>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-[#22C55E] shadow-sm">
          {material.ageLabel}
        </div>
      </div>
      <Link
        href={href}
        className="flex flex-1 flex-col gap-2 p-4"
        onClick={() => {
          if (trackRecent) recordMaterialView(material.id);
        }}
      >
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-[#1F2937] group-hover:text-[#6C63FF]">
          {material.title}
        </h3>
        <div className="flex items-center gap-1 text-amber-500">
          <IconStar className="size-3.5" />
          <span className="text-sm font-semibold text-[#1F2937]">{material.rating.toFixed(1)}</span>
          <span className="text-xs text-[#6B7280]">({material.reviewCount})</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            <p className="text-lg font-bold text-[#1F2937]">NT${material.price}</p>
            {off > 0 ? (
              <p className="text-xs text-[#9CA3AF] line-through">NT${material.originalPrice}</p>
            ) : null}
          </div>
          {off > 0 ? (
            <span className="rounded-full bg-[#FF6B73]/10 px-2 py-0.5 text-xs font-bold text-[#FF6B73]">{off}% OFF</span>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
