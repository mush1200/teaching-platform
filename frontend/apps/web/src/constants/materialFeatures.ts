export const MATERIAL_FEATURE_GROUPS = {
  material_format: ["PDF教材", "圖卡教材", "練習單", "教案"],
  teaching_methods: [
    "配對遊戲",
    "分類活動",
    "排序活動",
    "搶答活動",
    "角色扮演",
    "分組活動",
    "桌遊玩法",
    "問答互動",
    "任務闖關",
    "口語互動",
    "動手操作",
    "拼圖操作",
    "剪貼操作",
  ],
  learning_goals: [
    "顏色認識",
    "形狀認識",
    "數字概念",
    "數量概念",
    "大小比較",
    "分類能力",
    "順序概念",
    "空間概念",
    "語言表達",
    "語言理解",
    "詞彙理解",
    "社交溝通",
    "專注力",
    "觀察能力",
    "視覺辨識",
    "手眼協調",
    "精細動作",
  ],
  teaching_format: ["個別課", "小組課", "團體課程", "親子共學"],
  support_level: ["可獨立完成", "需成人協助"],
} as const;

export type MaterialFeatureGroupKey = keyof typeof MATERIAL_FEATURE_GROUPS;

export const MATERIAL_FEATURE_GROUP_LABELS: Record<MaterialFeatureGroupKey, string> = {
  material_format: "教材形式",
  teaching_methods: "教學玩法",
  learning_goals: "能力培養",
  teaching_format: "適用形式",
  support_level: "協助需求",
};

export const MATERIAL_FEATURE_SET = new Set(
  Object.values(MATERIAL_FEATURE_GROUPS).flatMap((items) => items),
);

export function groupMaterialFeatures(features: string[] | null | undefined): Record<MaterialFeatureGroupKey, string[]> {
  const picked = new Set((features ?? []).map((item) => item.trim()).filter(Boolean));
  return (Object.keys(MATERIAL_FEATURE_GROUPS) as MaterialFeatureGroupKey[]).reduce(
    (acc, key) => {
      acc[key] = MATERIAL_FEATURE_GROUPS[key].filter((item) => picked.has(item));
      return acc;
    },
    {
      material_format: [],
      teaching_methods: [],
      learning_goals: [],
      teaching_format: [],
      support_level: [],
    } as Record<MaterialFeatureGroupKey, string[]>,
  );
}

export function flattenSelectedMaterialFeatures(
  selectedByGroup: Partial<Record<MaterialFeatureGroupKey, string[]>>,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(MATERIAL_FEATURE_GROUPS) as MaterialFeatureGroupKey[]) {
    const options = new Set<string>(MATERIAL_FEATURE_GROUPS[key]);
    for (const item of selectedByGroup[key] ?? []) {
      if (!options.has(item) || seen.has(item)) continue;
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}
