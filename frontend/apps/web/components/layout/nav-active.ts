/**
 * 導覽「目前所在位置」的 **canonical 視覺配方**（`UI-CONS-14`）。
 *
 * ## 為什麼要有這一份
 *
 * Wave UI-1 已經讓四個導覽都輸出 `aria-current="page"`，但**視覺**仍是四套：
 *
 *   - `AdminSidebar` / `CreatorSidebar`：`border-l-[3px] border-edu-primary bg-[#EDE9FE] font-semibold text-edu-primary`
 *   - `dashboard/Sidebar`：`bg-edu-primary/[0.12] text-edu-primary`（沒有左邊框、**沒有加粗**）
 *   - `BottomNav`：`text-[#6C63FF]`（**只有換文字色**）
 *
 * （以上是**修正前**的歷史值，保留原樣以說明問題；現行前景色見下方常數。）
 *
 * 同一個互動語意長成四個樣子，而且 `BottomNav` 只靠顏色表達 active ——
 * 顏色是唯一線索時，色覺差異的使用者就沒有線索。
 *
 * ## 一個 family、兩種 layout
 *
 * 版面本來就不同（側欄是水平列、底欄是垂直 icon＋文字、收合側欄是純 icon），
 * 所以不強求同一組 class；但**表達 active 的三個訊號完全相同**：
 *
 *   1. 底色 `bg-edu-primary/[0.12]`
 *   2. 前景 `text-ds-textAccent`（`UI-CONS-15` 後改用可及的文字角色 token）
 *   3. 字重 `font-semibold`（不只靠顏色）
 *
 * `rail` 另外加一條左側 accent 邊框 —— 那是水平列才有意義的裝置，
 * 垂直置中的 icon 項目加左邊框只會歪掉。
 *
 * **route matching 不在這裡。** 哪一項是 active 仍由各導覽自己判斷
 * （`UI-CONS-06` 的 source-of-truth 問題不在本輪範圍）。
 */

/** 水平列表項的共用外框（`AdminSidebar` / `CreatorSidebar`）。 */
export const NAV_RAIL_BASE =
  "flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm transition-colors";

/** 水平列表項 —— 目前所在。 */
export const NAV_RAIL_ACTIVE = "border-edu-primary bg-edu-primary/[0.12] font-semibold text-ds-textAccent";

/** 水平列表項 —— 其餘。 */
export const NAV_RAIL_INACTIVE =
  "border-transparent font-medium text-[#4B5563] hover:bg-edu-primary/[0.06] hover:text-ds-heading";

/**
 * 精簡項目 —— 目前所在（收合側欄的 icon rail、行動版底欄）。
 * 與 `NAV_RAIL_ACTIVE` 的差別**只有**沒有左邊框。
 */
export const NAV_COMPACT_ACTIVE = "bg-edu-primary/[0.12] font-semibold text-ds-textAccent";
