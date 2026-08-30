/**
 * Admin 導覽的**唯一** source of truth（`IA-08`）。
 *
 * 這份清單以前存在兩份互不相關的複本：
 *   - `components/admin/AdminSidebar.tsx` 的 `sections`（`/admin/*` 的側欄與抽屜）
 *   - `components/layout/RoleShell.tsx` 的 `NAVS.admin`（Admin 逛**非** `/admin` 路由時的側欄）
 *
 * `IA-01`（教學回饋）與 `IA-07`（用戶管理／系統設定）只收斂了前者，後者原封不動 ——
 * 於是 Admin 打開 `/materials` 或 `/` 時，側欄仍列出三個已經下架的一級入口，
 * 點進去是同樣的死路。**問題不是「有三行忘了刪」，是「同一個 IA 有兩個定義」**，
 * 所以修法是把定義收成一份，而不是把三行刪兩次。
 *
 * 兩個 surface 的取用方式不同，但取用的是同一份資料：
 *   - `AdminSidebar` 用完整的 `ADMIN_NAV_SECTIONS`（分組 ＋ icon）
 *   - `RoleShell` 用扁平化的 `ADMIN_NAV_ITEMS`（`SimpleNavSidebar` 沒有分組與 icon）
 *
 * 決策見 `docs/admin-information-architecture.md` §2／§3。
 */

export type AdminNavItem = { href: string; label: string; icon: string; exact?: boolean };
export type AdminNavSection = { label: string; items: AdminNavItem[] };

/**
 * Admin 導覽的 Information Architecture（Epic §7）。
 *
 * ## 分組依據：**Admin 今天要完成什麼工作**，不是程式的 module 邊界
 *
 *   1. 「營運總覽」單獨在最上方 —— 它是入口，不屬於任何一類日常工作。
 *   2. 「日常審核」是**高頻、有佇列、有 SLA** 的三件事：教材審核、付款審核、訂單管理。
 *      共同特徵是「有一疊東西等我處理完」。
 *   3. 「信任與安全」是**由外部事件觸發**的處理：檢舉案件。
 *      共同特徵是「有人回報了問題」，不是每天都有。
 *
 *      「教學回饋」原本也在這一組，但它不符合這組的定義 —— 它沒有案件、沒有狀態、
 *      沒有 SLA，Admin 不會「每天處理回饋」。它是做判斷時要看的**脈絡**，
 *      因此改為出現在檢舉案件詳情與教材檢舉脈絡頁（`MaterialFeedbackContext`），
 *      不再佔一級導覽。`/admin/reviews-hub` 保留為可直達的相容路由，不從側欄進入。
 *      決策見 `docs/admin-information-architecture.md` §8。
 *   4. 「平台管理」是**低頻、非佇列**的管理與稽核：目前只有活動紀錄。
 *
 *      「用戶管理」與「系統設定」原本也在這一組，但兩者都是**零能力的一級入口**——
 *      Backend 沒有 `/admin/users` 端點、`users` 表也沒有姓名／狀態／停權欄位；
 *      系統設定 audit 的結論是目前**沒有**任何一項常數適合由後台調整。
 *      一級導覽不放點進去什麼都做不了的目的地，因此兩者移出側欄。
 *      `/admin/users` 與 `/admin/settings` 保留為可直達的相容路由（誠實的 placeholder），
 *      `/admin/users/:userId/activity-logs` 這條依人查詢的入口也不受影響 ——
 *      它一直是從活動紀錄的「此操作者紀錄」進入，不經過 `/admin/users`。
 *      決策見 `docs/admin-information-architecture.md` §2／§3（`IA-07`）。
 *
 * ## 名稱：描述任務，不描述資料表
 *
 * 「付款憑證」→ **「付款審核」**：Admin 到這頁不是為了「看憑證」，是為了「做審核決定」。
 * 這與同組的「教材審核」也對齊 —— 兩者是同一種工作，名稱不該一個講資料一個講動作。
 * 其餘名稱維持不變（「訂單管理」「檢舉管理」等在目前 product language 中已一致）。
 *
 * 詳細的 audit 與取捨在最終報告 §C。
 */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: "總覽",
    items: [{ href: "/admin", label: "營運總覽", icon: "📊", exact: true }],
  },
  {
    label: "日常審核",
    items: [
      { href: "/admin/materials?status=pending_review", label: "教材審核", icon: "📚" },
      { href: "/admin/payment-proofs?status=pending", label: "付款審核", icon: "🧾" },
      { href: "/admin/orders", label: "訂單管理", icon: "📦" },
    ],
  },
  {
    label: "信任與安全",
    items: [
      { href: "/admin/reports?status=open", label: "檢舉管理", icon: "🚩" },
      // 消費申訴與內容檢舉是**兩件事**（mvp_rules.md §12.10.1）：
      // 前者是買家對自己交易的申訴（有法定 15 日期限），後者是對教材內容的檢舉。
      { href: "/admin/complaints?status=submitted", label: "消費申訴", icon: "📣" },
      /*
       * 個資權利請求又是**第三件事**（`OPS-04` / `DEC-LEGAL-13`）——
       * 法律基礎是個人資料保護法，不是消保法 §43，因此它有自己的 domain、
       * 自己的狀態，而且**沒有法定期限**（該期限尚未取得律師結論）。
       * 三者刻意並列而不合併：合併會讓「這件事受哪一套規則管」消失。
       */
      { href: "/admin/privacy-requests", label: "個資權利請求", icon: "🔐" },
    ],
  },
  {
    label: "平台管理",
    items: [{ href: "/admin/activity-logs", label: "活動紀錄", icon: "🕒" }],
  },
];

/**
 * 扁平化的同一份清單，給沒有分組概念的 `SimpleNavSidebar` 用。
 *
 * 由 `ADMIN_NAV_SECTIONS` **衍生**而非另外抄一份 —— 這正是 `IA-08` 的重點：
 * 少了衍生關係，兩個 surface 就會再次分歧。
 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.items);

/**
 * `href` 可能帶 query（`?status=pending_review`）；比對 active 狀態時只看 pathname。
 *
 * 兩個 surface 都用它（`AdminSidebar` 與 `RoleShell`），避免其中一邊漏掉 query 的處理。
 */
export function navPathOf(href: string) {
  return href.split("?")[0] ?? href;
}
