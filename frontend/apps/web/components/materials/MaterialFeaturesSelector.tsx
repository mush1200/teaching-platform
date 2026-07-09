"use client";

import {
  MATERIAL_FEATURE_GROUP_LABELS,
  MATERIAL_FEATURE_GROUPS,
  type MaterialFeatureGroupKey,
} from "@/src/constants/materialFeatures";

type Props = {
  selected: Partial<Record<MaterialFeatureGroupKey, string[]>>;
  disabled?: boolean;
  onToggle: (group: MaterialFeatureGroupKey, value: string) => void;
};

export function MaterialFeaturesSelector({ selected, disabled, onToggle }: Props) {
  const groups = Object.keys(MATERIAL_FEATURE_GROUPS) as MaterialFeatureGroupKey[];
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <h2 className="text-base font-semibold text-slate-900">教材特色</h2>
      {groups.map((groupKey) => (
        <div key={groupKey} className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{MATERIAL_FEATURE_GROUP_LABELS[groupKey]}</p>
          <div className="flex flex-wrap gap-2">
            {MATERIAL_FEATURE_GROUPS[groupKey].map((item) => {
              const picked = (selected[groupKey] ?? []).includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(groupKey, item)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    "hover:-translate-y-px hover:shadow-sm",
                    picked
                      ? "border-violet-300 bg-violet-100 text-violet-800"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700",
                    disabled ? "cursor-not-allowed opacity-60" : "",
                  ].join(" ")}
                  aria-pressed={picked}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
