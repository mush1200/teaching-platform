const MATERIAL_FEATURE_GROUPS = {
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
};

const MATERIAL_FEATURE_SET = new Set(
  Object.values(MATERIAL_FEATURE_GROUPS).flatMap((items) => items),
);

function normalizeMaterialFeatures(value) {
  if (!Array.isArray(value)) return null;
  const normalized = [];
  const seen = new Set();
  for (const item of value) {
    const feature = String(item || "").trim();
    if (!feature || seen.has(feature)) continue;
    seen.add(feature);
    normalized.push(feature);
  }
  return normalized;
}

module.exports = {
  MATERIAL_FEATURE_GROUPS,
  MATERIAL_FEATURE_SET,
  normalizeMaterialFeatures,
};
