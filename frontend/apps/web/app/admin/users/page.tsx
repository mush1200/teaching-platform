import Link from "next/link";
import { PageHeader } from "../../../components/ds";

/**
 * 用戶管理 —— **尚未實作**。
 *
 * 本輪（Admin Operations UX Closure Epic §9）只做了 audit，沒有實作：
 * Backend 完全沒有 `/admin/users` 端點，`users` 表上也只有
 * `id / email / password_hash / role / created_at` —— 沒有姓名、沒有狀態、
 * 沒有停權欄位、沒有最後登入時間。
 *
 * 也就是說「查看使用者、停權、加註記」這些 admin 直覺會期待的動作，
 * 目前一個都沒有對應的資料模型。要做需要新的 schema 與新的端點，
 * 屬於產品決策，不在本輪的 direct-fix 範圍。
 *
 * 這一頁因此**只說實話**，不做假的表格、不列不存在的按鈕。
 * 唯一可用的入口是既有的「依使用者查活動紀錄」（`/admin/users/:userId/activity-logs`）。
 */
export const metadata = {
  title: "用戶管理 | EduMarket",
};

export default function AdminUsersPlaceholderPage() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="用戶管理"
        description="此功能尚未開放。目前平台沒有使用者管理 API，也沒有可供管理的使用者狀態欄位。"
      />

      <article className="space-y-4 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft">
        <div>
          <h2 className="text-title text-ds-heading">目前可用的替代入口</h2>
          <p className="mt-1 text-body text-ds-textMuted">
            若要追查某位使用者做過什麼，可以從活動紀錄搜尋他的 Email，再從紀錄列進入
            「此操作者紀錄」。
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
            <li>是否要引入帳號停權；若要，停權後既有訂單與已上架教材如何處理。</li>
            <li>管理員可以看到哪些個資，以及這些查閱行為本身是否要留下稽核紀錄。</li>
          </ul>
        </div>
      </article>
    </section>
  );
}
