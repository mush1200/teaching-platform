export default function AdminUsersPlaceholderPage() {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB]/80 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold text-[#1F2937]">用戶管理</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
        此頁為 UI 佔位，之後可串接 <code className="rounded bg-[#F4F1FF] px-1 text-xs">GET /admin/users</code> 等 API。
      </p>
    </div>
  );
}
