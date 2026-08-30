import Link from "next/link";
import { PageHeader } from "../../../components/ds";

/**
 * 用戶管理 —— **仍未實作使用者管理模組**（沒有名冊、沒有搜尋）。
 *
 * 原始判定（Admin Operations UX Closure Epic §9）：Backend 沒有使用者端點、
 * `users` 表也沒有狀態欄位，因此不做假的表格、不列不存在的按鈕。
 *
 * **2026-08-27 更新（`OPS-02`）：帳號凍結已經可以在後台操作了。**
 * `users` 現在有 `account_status` / `frozen_at` / `frozen_by` / `freeze_reason`
 * 等欄位，`/admin/users/:id/{account-status,freeze,unfreeze}` 三個端點也已存在，
 * 操作面板掛在既有的 per-user 頁（`/admin/users/:userId/activity-logs`）。
 *
 * 但**仍然沒有**使用者名冊或搜尋 —— 要找到某個帳號，
 * 依舊是從活動紀錄搜尋 Email 再進入該使用者的頁面。
 * 因此這一頁維持誠實的轉介，而不是變成一個假的管理主頁。
 *
 * `IA-07`：這一頁**仍不在側欄**。凍結能力的出現不改變那個判斷 ——
 * 側欄要的是「可以從這裡開始工作」的入口，而這頁仍然只能轉介。
 * route 保留為可直達的相容入口（書籤、既有連結）。
 */
export const metadata = {
  title: "用戶管理 | EduMarket",
};

export default function AdminUsersPlaceholderPage() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="用戶管理"
        description="平台尚未提供使用者名冊與搜尋。帳號凍結等操作請由該使用者的活動紀錄頁進入。"
      />

      <p className="rounded-ds-card border border-ds-border bg-edu-page px-4 py-3 text-meta text-ds-textMuted">
        這一頁不在側欄裡：在有可用的使用者名冊之前，它不佔一級導覽。
        追查特定使用者請從活動紀錄進入。
      </p>

      <article className="space-y-4 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft">
        <div>
          <h2 className="text-title text-ds-heading">目前可用的替代入口</h2>
          <p className="mt-1 text-body text-ds-textMuted">
            若要追查某位使用者做過什麼，可以從活動紀錄搜尋他的 Email，再從紀錄列進入
            「此操作者紀錄」。<strong className="font-semibold text-ds-heading">
            帳號凍結與解除凍結也在該頁操作。</strong>
          </p>
          <Link
            href="/admin/activity-logs"
            className="mt-2 inline-block text-sm font-medium text-edu-primary underline"
          >
            前往活動紀錄
          </Link>
        </div>

        <div className="border-t border-ds-borderMuted pt-4">
          <h2 className="text-title text-ds-heading">開放之前需要先確認的事</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ds-textMuted">
            <li>使用者要以什麼名稱顯示 —— 目前只有 Email，沒有姓名欄位。</li>
            <li>名冊要顯示哪些欄位、可依什麼條件搜尋。</li>
            <li>管理員可以看到哪些個資，以及這些查閱行為本身是否要留下稽核紀錄。</li>
          </ul>
        </div>
      </article>
    </section>
  );
}
