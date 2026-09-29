/**
 * 全站唯一的字型堆疊（`UI-QA-FONT`，2026-09-29）。
 *
 * ## 為什麼要有這一份
 *
 * 先前畫面上的字型由**三個互相覆蓋的來源**決定，實測 `/materials`（1440）可見文字節點：
 *
 *   - `body` 的 inline style（`next/font/google` 的 Noto Sans TC）—— 可見文字 **0** 個
 *   - `TamaguiProvider` 的 `span.font_body`（`@tamagui/config/v3` 的 `Inter, -apple-system, system-ui …`）—— 10 個
 *   - Tailwind 預設 `font-sans`（`ui-sans-serif, system-ui …`，shell 根節點）—— 145 個
 *
 * 也就是說中文字**一律落到作業系統自己的 CJK 字型**（Windows 的微軟正黑、macOS 的蘋方、
 * Linux runner 上則是 Playwright 安裝的替代字型），文件所寫的 Noto Sans TC 從未被畫出來。
 * 另外 `next/font/google` 在 `next dev` 對 105 個切片各給 3 秒逾時，任一個失敗就整族退回
 * fallback —— 那是 UI Review 環境看到的「Failed to download」。
 *
 * ## 契約
 *
 *   - 字型檔**自架**（`@fontsource-variable/*`，SIL OFL 1.1，版本釘死在 lockfile），
 *     建置與測試都**不連任何字型 CDN**。
 *   - Tailwind `font-sans`、Tamagui `body`／`heading`、`<body>` 三處都使用**這一份**字串。
 *   - 順序：Inter 負責拉丁字母與數字（與先前 Tamagui 區塊一致），Noto Sans TC 負責中文。
 *     `system-ui` 只剩 emoji 等兩者都沒有的字元會用到。
 *
 * 換字型或調順序只改這裡；`app/layout.tsx` 的 CSS import 負責載入對應的 `@font-face`。
 */
export const CANONICAL_FONT_STACK =
  '"Inter Variable", "Noto Sans TC Variable", ui-sans-serif, system-ui, sans-serif';
