"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStoredRole } from "../../lib/api-client";

type RoleKind = "public" | "parent" | "teacher" | "admin";
type NavItem = { href: string; label: string; exact?: boolean };

const NAVS: Record<RoleKind, NavItem[]> = {
  public: [
    { href: "/", label: "首頁", exact: true },
    { href: "/materials", label: "教材列表" },
    { href: "/login", label: "登入" },
    { href: "/register", label: "註冊" },
  ],
  parent: [
    { href: "/materials", label: "教材列表" },
    { href: "/cart", label: "購物車" },
    { href: "/checkout", label: "結帳" },
    { href: "/orders", label: "我的訂單" },
    { href: "/downloads", label: "下載中心" },
    { href: "/my-reviews", label: "我的評價" },
  ],
  teacher: [
    { href: "/teacher/materials", label: "教材管理" },
    { href: "/teacher/materials/new", label: "新增教材" },
    { href: "/teacher/sales", label: "銷售中心" },
  ],
  admin: [
    { href: "/admin", label: "儀表板", exact: true },
    { href: "/admin/materials", label: "教材管理" },
    { href: "/admin/orders", label: "訂單管理" },
    { href: "/admin/users", label: "用戶管理" },
    { href: "/admin/reviews-hub", label: "評論管理" },
    { href: "/admin/reports", label: "檢舉管理" },
    { href: "/admin/activity-logs", label: "活動紀錄" },
    { href: "/admin/settings", label: "系統設定" },
  ],
};

function getRoleByPath(pathname: string, storedRole: RoleKind | null): RoleKind {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/teacher")) return "teacher";
  if (storedRole === "parent") return "parent";
  if (storedRole === "teacher") return "teacher";
  if (storedRole === "admin") return "admin";
  if (
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/downloads") ||
    pathname.startsWith("/my-reviews")
  ) {
    return "parent";
  }
  return "public";
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function roleTitle(role: RoleKind) {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "parent") return "Parent";
  return "Public";
}

export function RoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [storedRole, setStoredRole] = useState<RoleKind | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = getRoleByPath(pathname, storedRole);
  const nav = NAVS[role];

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const role = getStoredRole();
    if (role === "parent" || role === "teacher" || role === "admin") {
      setStoredRole(role);
    } else {
      setStoredRole(null);
    }
  }, [pathname]);

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("tp_token");
      localStorage.removeItem("tp_role");
      localStorage.removeItem("tp_user_email");
      localStorage.removeItem("tp_display_name");
      document.cookie = "tp_token=; path=/; max-age=0; samesite=lax";
      document.cookie = "tp_role=; path=/; max-age=0; samesite=lax";
    }
    setStoredRole(null);
    setMobileOpen(false);
    router.push("/login");
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#F4F1FF]">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[#E5E7EB]/80 bg-white px-4 py-3 lg:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
          <p className="text-sm font-bold text-[#1F2937]">{roleTitle(role)}</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700"
          aria-label="切換側邊選單"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? "關閉" : "選單"}
        </button>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          aria-label="關閉側邊欄遮罩"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-[#E5E7EB]/80 bg-white transition-transform lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-[#E5E7EB]/80 px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
          <p className="text-lg font-bold text-[#1F2937]">{roleTitle(role)}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="手機側邊選單">
          {nav.map((item) => (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={`block rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive(pathname, item)
                  ? "bg-[#F4F1FF] text-[#6C63FF]"
                  : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#1F2937]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[#E5E7EB]/80 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full rounded-2xl px-4 py-2.5 text-center text-sm font-semibold text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#EF4444]"
          >
            登出
          </button>
        </div>
      </aside>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-[#E5E7EB]/80 bg-white lg:flex lg:flex-col">
        <div className="border-b border-[#E5E7EB]/80 px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
          <p className="text-lg font-bold text-[#1F2937]">{roleTitle(role)}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="側邊選單">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive(pathname, item)
                  ? "bg-[#F4F1FF] text-[#6C63FF]"
                  : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#1F2937]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[#E5E7EB]/80 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full rounded-2xl px-4 py-2.5 text-center text-sm font-semibold text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#EF4444]"
          >
            登出
          </button>
        </div>
      </aside>

      <div className="lg:ml-60">
        <main className="min-h-dvh">{children}</main>
      </div>
    </div>
  );
}
