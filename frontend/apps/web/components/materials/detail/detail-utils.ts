import type { ComponentProps } from "react";
import type { Chip } from "../../ui/Chip";
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

const CATEGORY_LABEL: Record<string, string> = {
  math: "數學",
  language: "語言",
  science: "自然",
  art: "美術",
};

export function categoryDisplay(category: string | undefined): string {
  if (!category?.trim()) return "其他";
  const key = category.trim().toLowerCase();
  return CATEGORY_LABEL[key] ?? category;
}

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
