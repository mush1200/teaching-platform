/**
 * Canonical semantic tone vocabulary（`UI-CONS-12`，Wave UI-3）。
 *
 * ## 這是全 repo 唯一的 tone 值域
 *
 * ```text
 * neutral | info | success | warning | danger
 * ```
 *
 * 收斂前有**四套**互不相容的說法：
 *
 * ```text
 * ds/StatusPill          neutral | info | success | warning | danger
 * lib/admin-labels Tone  neutral | info | success | warning | danger
 * lib/material-status    info | success | warning | error        ← "error" 而非 "danger"
 * Tamagui StatusBadge    success | warning | error | info | draft | pending_review |
 *                        published | unpublished | pending_payment | approved |
 *                        rejected | reviewed                     ← domain state 混進 tone
 * ```
 *
 * 前三者其實只差 `error` / `danger` 一個名字；真正的問題是第四個 ——
 * 它把 **domain state 當成 visual tone**，於是同一個概念有兩種型別，
 * 而 `creatorStatusTone()` 回傳的 `"error"` 只是**剛好**能餵進去。
 *
 * ## 分層規則（不得跳層）
 *
 * ```text
 * domain status value      例：materials.status = "unpublished"
 *   → role-aware mapping   例：Admin 視角 vs Creator 視角（兩份 map，刻意不同）
 *     → canonical tone     例：neutral vs danger
 *       → token pair       例：bg-status-draftBg / text-status-draftText
 * ```
 *
 * **domain state 名稱永遠不是 tone。** 新增狀態時要做的是補 mapping，
 * 不是在這個 union 上加值。
 *
 * ## 角色視角是刻意的，收斂 tone 不得抹掉它
 *
 * `unpublished` 在 Admin 是 `neutral`（不是我的待辦），在 Creator 是 `danger`
 * （我的教材被下架了）。這是產品決策，不是不一致 —— 見 `lib/admin-labels.ts`
 * 與 `lib/material-status.ts` 兩份 map 各自的註解。
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * ✅ `UI-CONS-01` 已於 2026-09-07 完成 canonical 對比修正（Owner sign-off）。
 *
 * 每一組 canonical tone pair 現在都通過 WCAG AA 正常字級的 **4.5:1**：
 *
 * ```text
 * tone            前景      背景      修正前   修正後
 * neutral         #4B5563   #F3F4F6   6.87     6.87   （未動）
 * info            #554BFF   #EDE9FE   3.63  →  4.61   ← 由 #6C63FF 加深
 * success         #047857   #ECFDF5   5.21     5.21   （未動）
 * warning         #B45309   #FEF3C7   4.51     4.51   （未動）
 * danger          #B91C1C   #FEE2E2   5.30     5.30   （未動）
 * pendingPayment  #BE123C   #FFE4E6   2.30  →  5.24   ← 由 #FF6B73 改為 rose 系
 * ```
 *
 * ## 為什麼 `pendingPayment` 不是「把原色壓暗」
 *
 * 保持色相直接壓暗 `#FF6B73` 會得到 `#D3000B` —— 與 `danger` 的 `#B91C1C`
 * 只差 **3.1°** 色相，兩個狀態在畫面上會失去區分。改用 rose 系的 `#BE123C`：
 * 色相差 **14.7°**（玫瑰 vs 磚紅），對比 5.24:1，背景 `#FFE4E6` 維持不變。
 *
 * ## 色值只有一處來源嗎
 *
 * 不是 —— `app/globals.css` 的 CSS 變數與 `tailwind.config.ts` 的 hex **兩邊都要改**
 * （這是 §4.3 B11 記錄的既有 token 三來源漂移）。本輪兩處已同步更新。
 */
export const CANONICAL_TONE_CONTRAST = {
  neutral: 6.87,
  info: 4.61,
  success: 5.21,
  warning: 4.51,
  danger: 5.3,
  pendingPayment: 5.24,
} as const;
