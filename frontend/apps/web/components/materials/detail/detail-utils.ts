import type { ComponentProps } from "react";
import type { Chip } from "../../ui/Chip";
import { categoryLabel } from "../../../lib/material-categories";
import {
  MATERIAL_FEATURE_GROUP_LABELS,
  type MaterialFeatureGroupKey,
} from "@/src/constants/materialFeatures";

export type FeatureGroupRow = {
  key: MaterialFeatureGroupKey;
  label: string;
  items: string[];
};

export const FEATURE_GROUP_ORDER: MaterialFeatureGroupKey[] = [
  "material_format",
  "teaching_methods",
  "learning_goals",
  "teaching_format",
  "support_level",
];

export const FEATURE_GRID_LEFT_ORDER: MaterialFeatureGroupKey[] = ["material_format", "learning_goals", "support_level"];
export const FEATURE_GRID_RIGHT_ORDER: MaterialFeatureGroupKey[] = ["teaching_methods", "teaching_format"];

/** 標籤一律來自 `lib/material-categories.ts`（單一來源）。 */
export const categoryDisplay = categoryLabel;

export function chipToneByGroup(groupKey: MaterialFeatureGroupKey): ComponentProps<typeof Chip>["tone"] {
  switch (groupKey) {
    case "material_format":
      return "materialFormat";
    case "teaching_methods":
      return "teachingMethods";
    case "learning_goals":
      return "learningGoals";
    case "teaching_format":
      return "teachingFormat";
    case "support_level":
      return "supportLevel";
    default:
      return "neutral";
  }
}

export function buildValueProposition(material: {
  shortDescription?: string;
  usageDuration?: string;
  teachingMethods?: string[];
  title: string;
}): string | null {
  if (material.shortDescription?.trim()) return null;
  const methods = (material.teachingMethods ?? []).filter(Boolean);
  const duration = material.usageDuration?.trim();
  if (!duration && methods.length === 0) return null;
  const methodText = methods.length > 0 ? methods.join("、") : "多元互動活動";
  if (duration) {
    return `${duration}，透過${methodText}學習「${material.title}」的核心能力。`;
  }
  return `透過${methodText}，讓孩子在活動中自然學習與表達。`;
}

export function featureGroupLabel(key: MaterialFeatureGroupKey): string {
  return MATERIAL_FEATURE_GROUP_LABELS[key];
}
