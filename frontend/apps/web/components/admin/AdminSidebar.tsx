"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "儀表板", exact: true },
  { href: "/admin/materials", label: "教材管理" },
  { href: "/admin/orders", label: "訂單管理" },
  { href: "/admin/users", label: "用戶管理" },
  { href: "/admin/reviews-hub", label: "評論管理" },
  { href: "/admin/reports", label: "檢舉管理" },
  { href: "/admin/activity-logs", label: "活動紀錄" },
  { href: "/admin/settings", label: "系統設定" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  function isActive(item: (typeof nav)[number]) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <aside className="flex w-full flex-col border-r border-[#E5E7EB]/80 bg-white lg:fixed lg:inset-y-0 lg:w-60 lg:max-w-[240px]">
      <div className="border-b border-[#E5E7EB]/80 px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
        <p className="text-lg font-bold text-[#1F2937]">Admin</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="後台選單">
        {nav.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-[#F4F1FF] text-[#6C63FF]" : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#1F2937]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[#E5E7EB]/80 p-3">
        <Link
          href="/login"
          className="block rounded-2xl px-4 py-2.5 text-center text-sm font-semibold text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#EF4444]"
        >
          登出
        </Link>
      </div>
    </aside>
  );
}
