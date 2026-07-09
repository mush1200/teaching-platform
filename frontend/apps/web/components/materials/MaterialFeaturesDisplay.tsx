import { Card } from "../ui/Card";
import {
  groupMaterialFeatures,
  MATERIAL_FEATURE_GROUP_LABELS,
  type MaterialFeatureGroupKey,
} from "@/src/constants/materialFeatures";

type Props = {
  features: string[] | null | undefined;
};

export function MaterialFeaturesDisplay({ features }: Props) {
  const grouped = groupMaterialFeatures(features);
  const groupKeys = Object.keys(grouped) as MaterialFeatureGroupKey[];
  const hasAny = groupKeys.some((key) => grouped[key].length > 0);
  if (!hasAny) return null;

  return (
    <Card level="default">
      <p className="text-sm font-semibold text-ds-heading">教材特色</p>
      <div className="mt-3 space-y-4">
        {groupKeys.map((groupKey) => {
          if (grouped[groupKey].length === 0) return null;
          return (
            <div key={groupKey} className="space-y-2">
              <p className="text-xs font-semibold text-ds-textMuted">{MATERIAL_FEATURE_GROUP_LABELS[groupKey]}</p>
              <div className="flex flex-wrap gap-2">
                {grouped[groupKey].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
