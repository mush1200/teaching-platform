"use client";

import Link from "next/link";
import type { MockMaterial } from "../../../lib/view-models";
import { Chip } from "../../ui/Chip";
import type { MaterialFeatureGroupKey } from "@/src/constants/materialFeatures";
import { buildValueProposition, categoryDisplay, chipToneByGroup } from "./detail-utils";

type HeroChip = { label: string; groupKey: MaterialFeatureGroupKey };

type Props = {
  material: MockMaterial;
  heroFeatureChips: HeroChip[];
  onScrollToFeedback: () => void;
};

export function MaterialDetailHeroInfo({ material, heroFeatureChips, onScrollToFeedback }: Props) {
  const valueLine = buildValueProposition(material);

  return (
    <div className="min-w-0 space-y-3 lg:space-y-4">
      <p className="text-sm font-medium text-ds-textMuted">{categoryDisplay(material.category)}</p>
      <h1 className="text-h2 font-extrabold tracking-tight text-ds-heading sm:text-[2rem] sm:leading-tight">
        {material.title}
      </h1>

      <Link
        href="#usage-feedback"
        onClick={(e) => {
          e.preventDefault();
          onScrollToFeedback();
        }}
        className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:text-edu-primary ${
          material.reviewCount > 0 ? "text-amber-600" : "text-ds-textMuted"
        }`}
      >
        {material.reviewCount > 0 ? (
          <>
            <span aria-hidden>★</span>
            <span>{material.rating.toFixed(1)}</span>
            <span className="font-normal text-ds-textMuted">（{material.reviewCount} 則教學回饋）</span>
          </>
        ) : (
          <span className="font-normal">尚無教學回饋 · 查看回饋區</span>
        )}
      </Link>

      <Chip tone="neutral" className="border-ds-border bg-ds-surfaceSubtle text-ds-body">
        適用：{material.ageLabel}
      </Chip>

      {valueLine ? <p className="max-w-xl text-body leading-relaxed text-ds-body">{valueLine}</p> : null}

      {heroFeatureChips.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-ds-heading">教材特色預覽</p>
          <div className="flex flex-wrap gap-2">
            {heroFeatureChips.map((item) => (
              <Chip key={`${item.groupKey}-${item.label}`} tone={chipToneByGroup(item.groupKey)}>
                {item.label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
