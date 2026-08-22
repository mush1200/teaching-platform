/**
 * Shell 尺寸的 **canonical 常數**（Epic §12）。
 *
 * ## 為什麼要有這一份
 *
 * Admin 與 Creator 的側欄尺寸原本各寫各的：
 *   - Admin  desktop `lg:w-60 lg:max-w-[240px]`，mobile drawer `w-72`（288px）
 *   - Creator desktop `w-60`，mobile drawer `w-64`（256px）
 *
 * Desktop 剛好一樣（240px）純屬巧合，mobile 則差了 32px。任何一邊改動都會再度分歧。
 *
 * **Shell 尺寸一致；導覽內容可以不同。** Admin 的選項比較多，那要靠 spacing／truncation
 * 解決，不是把 navigation rail 加寬。
 *
 * ## Token 來源
 *
 * `layout-sidebar`（240px）是 `tailwind.config.ts` `theme.extend.spacing` 既有的 token，
 * 不是這一輪新造的值 —— 這裡只是讓兩個 shell 都真的去用它。
 */

/** Desktop 固定側欄寬度。`lg` 以下不佔文件流。 */
export const SIDEBAR_DESKTOP_WIDTH_CLASS = "lg:w-layout-sidebar";

/** 主內容區在 `lg` 以上的左側偏移，必須與 `SIDEBAR_DESKTOP_WIDTH_CLASS` 同值。 */
export const CONTENT_OFFSET_CLASS = "lg:ml-layout-sidebar";

/**
 * Mobile drawer 寬度。
 *
 * 用 `min(18rem, 85vw)` 而不是固定的 `w-72`：在 320px 的視窗上，288px 的抽屜只會留下
 * 32px 的遮罩，使用者幾乎沒有地方可以點擊關閉。85vw 保證任何寬度都留得下可點的遮罩。
 */
export const DRAWER_WIDTH_CLASS = "w-[min(18rem,85vw)]";

/**
 * 側欄內容區的外框。
 *
 * `min-h-0` 是**必要**的，不是保險：在 `flex-col` 容器裡，flex item 的
 * `min-height` 預設是 `auto`（= 內容高度），沒有它時可捲動的 nav 不會縮小，
 * 而是把整條側欄撐出視窗外 —— 這正是 §11 那個「手機側欄捲不到底」的成因。
 */
export const SIDEBAR_SHELL_CLASS = "flex min-h-0 flex-1 flex-col";

/**
 * 可捲動的導覽區。
 *
 * `min-h-0` + `overflow-y-auto` 必須成對出現，且中間**每一層** flex 容器
 * 都要能縮小，否則捲動容器的高度永遠等於內容高度（= 不會捲）。
 */
export const SIDEBAR_NAV_SCROLL_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-contain";

/** 側欄頂部／底部固定區塊：不得被壓縮，否則登出鈕會在矮視窗上被擠沒。 */
export const SIDEBAR_STATIC_CLASS = "shrink-0";

/** 手機頂欄與抽屜共用的觸控目標尺寸（44px，符合一般 tap target 下限）。 */
export const NAV_ICON_BUTTON_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-xl text-ds-heading transition-colors hover:bg-edu-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";
