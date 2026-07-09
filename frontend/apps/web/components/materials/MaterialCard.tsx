"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MockMaterial } from "../../lib/view-models";
import { apiFetch } from "../../lib/api-client";
import { emitFavoritesUpdated } from "../../lib/favorites-storage";
import { recordMaterialView } from "../../lib/recent-materials";
import { IconHeart, IconStar } from "../ui/icons";

type Props = {
  material: MockMaterial;
  /** When true, records this material in recent views (localStorage) on navigate */
  trackRecent?: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  math: "數學",
  language: "語言",
  science: "自然",
  art: "美術",
};

function categoryDisplay(category: string | undefined): string {
  if (!category?.trim()) return "其他";
  const key = category.trim().toLowerCase();
  return CATEGORY_LABEL[key] ?? category;
}

export function MaterialCard({ material, trackRecent }: Props) {
  const [isFavorite, setIsFavorite] = useState(false);
  const favoriteBtnRef = useRef<HTMLButtonElement | null>(null);
  const href = `/materials/${material.id}`;
  const off =
    material.originalPrice > material.price
      ? Math.round((1 - material.price / material.originalPrice) * 100)
      : 0;
  const priceLabel =
    material.price === 0 ? (
      <span className="text-lg font-bold text-emerald-600">免費</span>
    ) : (
      <p className="text-lg font-bold text-[#1F2937]">NT${material.price.toLocaleString()}</p>
    );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("me/favorites");
        if (!res.ok) {
          if (!cancelled) setIsFavorite(false);
          return;
        }
        const payload = (await res.json()) as { items?: Array<{ material_id?: string }> };
        const ids = (payload.items ?? []).map((row) => String(row.material_id ?? ""));
        if (!cancelled) setIsFavorite(ids.includes(material.id));
      } catch {
        if (!cancelled) setIsFavorite(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [material.id]);

  const handleToggleFavorite = async () => {
    const next = !isFavorite;
    setIsFavorite(next);
    favoriteBtnRef.current?.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.95)", offset: 0.45 },
        { transform: "scale(1.14)" },
        { transform: "scale(1)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.2, 0.9, 0.2, 1)" },
    );

    try {
      const res = await apiFetch(`me/favorites/${encodeURIComponent(material.id)}`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setIsFavorite(!next);
        return;
      }
      emitFavoritesUpdated();
    } catch {
      setIsFavorite(!next);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("tp:toast", {
        detail: { message: next ? "已加入收藏" : "已從收藏移除" },
      }),
    );
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-[18px] border border-[#E5E7EB]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
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
          ref={favoriteBtnRef}
          type="button"
          className={`relative z-10 ml-auto mr-3 mt-3 flex h-9 w-9 min-h-8 min-w-8 items-center justify-center rounded-full shadow-sm transition duration-200 ease-out hover:scale-110 active:scale-95 ${
            isFavorite
              ? "bg-[#FEE2E2] text-[#EF4444] hover:bg-[#FECACA] hover:text-[#DC2626]"
              : "bg-white/90 text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280]"
          }`}
          aria-label={isFavorite ? "取消收藏" : "收藏"}
          aria-pressed={isFavorite}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleToggleFavorite();
          }}
        >
          <IconHeart filled={isFavorite} className="size-5" />
        </button>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm">
          {material.ageLabel.replace(/^適合\s*/, "").trim()}
        </div>
      </div>
      <Link
        href={href}
        className="flex flex-1 flex-col gap-1.5 px-4 py-3.5"
        onClick={() => {
          if (trackRecent) recordMaterialView(material.id);
        }}
      >
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-[#1F2937] group-hover:text-[#6C63FF]">
          {material.title}
        </h3>
        <div className="flex items-center gap-1 text-amber-500">
          <IconStar className="size-3.5 shrink-0" />
          <span className="text-sm font-semibold text-[#1F2937]">{material.rating.toFixed(1)}</span>
          <span className="text-xs text-[#6B7280]">({material.reviewCount})</span>
        </div>
        <p className="text-xs text-[#9CA3AF]">{categoryDisplay(material.category)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            {priceLabel}
            {off > 0 && material.price > 0 ? (
              <p className="text-xs text-[#9CA3AF] line-through">NT${material.originalPrice}</p>
            ) : null}
          </div>
          {off > 0 && material.price > 0 ? (
            <span className="rounded-full bg-[#FF6B73]/10 px-2 py-0.5 text-xs font-bold text-[#FF6B73]">{off}% OFF</span>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
