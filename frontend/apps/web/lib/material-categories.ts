/**
 * 教材分類 —— **全前端唯一來源**。
 *
 * ## 為什麼需要這個檔案
 *
 * 先前分類定義散在三個地方，而且**彼此不一致**：
 *
 * | 位置 | `science` | `art` |
 * | --- | --- | --- |
 * | `components/parent/CategoryChips.tsx`（買家篩選列） | 科學 | 藝術 |
 * | `components/materials/MaterialCard.tsx`（卡片） | 自然 | 美術 |
 * | `components/materials/detail/detail-utils.ts`（詳情頁） | 自然 | 美術 |
 *
 * 也就是同一份教材在篩選列叫「科學」、在卡片上叫「自然」。
 *
 * 更嚴重的是**創作者端根本沒有選項**：新增教材的「分類」是自由文字，placeholder 是
 * 內部英文值 `math`。實測 dev DB 的結果就是這個設計的直接後果 ——
 * `語文`(3) / `math`(3) / `56`(1) / `language`(1)：八筆裡有四筆是買家永遠篩不到的值。
 *
 * ## 規則
 *
 * - **`id` 是送給 Backend 的 canonical machine value**（`materials.category`）。
 * - **`label` 是唯一對使用者顯示的字**。創作者選中文，不需要知道 `math` 這種值存在。
 * - 以**買家篩選列**的用字為準：創作者選「科學」，那份教材就必須出現在買家的
 *   「科學」篩選底下。若卡片改叫「自然」，兩邊就對不起來。
 *
 * `materials.category` 在 DB 是 `text` 且**沒有** CHECK constraint，因此這裡是
 * 前端的 canonical 清單，不是 schema 保證 —— legacy 的自由文字值仍可能存在，
 * 顯示時由 `categoryLabel()` 原樣退回（見該函式）。
 */
export type MaterialCategoryId = "language" | "math" | "science" | "art";

export const MATERIAL_CATEGORIES: ReadonlyArray<{ id: MaterialCategoryId; label: string }> = [
  { id: "language", label: "語言" },
  { id: "math", label: "數學" },
  { id: "science", label: "科學" },
  { id: "art", label: "藝術" },
] as const;

/** 買家篩選列用：多一個「全部」。 */
export const EXPLORE_CATEGORY_OPTIONS = [{ id: "all", label: "全部" }, ...MATERIAL_CATEGORIES] as const;

const LABEL_BY_ID = new Map<string, string>(MATERIAL_CATEGORIES.map((c) => [c.id, c.label]));

/**
 * 顯示用標籤。
 *
 * 未登記的值**原樣退回**而不是硬塞成「其他」—— dev DB 裡真的存在 `語文`、`56`
 * 這種 legacy 自由文字，把它們一律顯示成「其他」會讓營運看不出資料其實壞了。
 * 空值才回「其他」。
 */
export function categoryLabel(category: string | null | undefined): string {
  const key = String(category ?? "").trim();
  if (!key) return "其他";
  return LABEL_BY_ID.get(key.toLowerCase()) ?? key;
}
