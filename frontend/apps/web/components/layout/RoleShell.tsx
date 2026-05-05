"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getStoredRole } from "../../lib/api-client";
import { ParentAppShell } from "../dashboard/ParentAppShell";

type RoleKind = "public" | "parent" | "teacher" | "admin";
type NavItem = { href: string; label: string; exact?: boolean };
type TeacherNavItem = { id: string; href?: string; label: string; icon: string; exact?: boolean; action?: "logout" };
type TeacherSection = { label: string; items: TeacherNavItem[] };

const NAVS: Record<RoleKind, NavItem[]> = {
  public: [
    { href: "/", label: "首頁", exact: true },
    { href: "/materials", label: "教材列表" },
    { href: "/login", label: "登入" },
    { href: "/register", label: "註冊" },
  ],
  parent: [
    { href: "/explore", label: "探索教材" },
    { href: "/favorites", label: "收藏清單" },
    { href: "/cart", label: "購物車" },
    { href: "/checkout", label: "結帳" },
    { href: "/orders", label: "我的訂單" },
    { href: "/downloads", label: "下載中心" },
    { href: "/my-reviews", label: "我的評價" },
  ],
  teacher: [
    { href: "/teacher/materials", label: "教材管理" },
    { href: "/teacher/materials/new", label: "新增教材" },
    { href: "/teacher/sales", label: "銷售與收益" },
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

const TEACHER_SECTIONS: TeacherSection[] = [
  {
    label: "主要功能",
    items: [
      { id: "teacher-materials", href: "/teacher/materials?view=list", label: "教材管理", icon: "📖" },
      { id: "teacher-create", href: "/teacher/materials/new", label: "新增教材", icon: "➕" },
      { id: "teacher-sales", href: "/teacher/sales?tab=overview", label: "銷售與收益", icon: "📊" },
    ],
  },
  {
    label: "教材狀態",
    items: [
      { id: "teacher-status-draft", href: "/teacher/materials?status=draft", label: "草稿", icon: "📝" },
      { id: "teacher-status-pending", href: "/teacher/materials?status=pending_review", label: "待審核", icon: "⏱️" },
      { id: "teacher-status-published", href: "/teacher/materials?status=published", label: "已發布", icon: "✅" },
      { id: "teacher-status-unpublished", href: "/teacher/materials?status=unpublished", label: "已下架", icon: "📦" },
    ],
  },
  {
    label: "成效與互動",
    items: [{ id: "teacher-reviews", href: "/teacher/materials?view=reviews", label: "教材評論", icon: "💬" }],
  },
  {
    label: "帳戶",
    items: [
      { id: "teacher-profile", href: "/teacher/materials?view=profile", label: "個人資料", icon: "👤" },
      { id: "teacher-logout", label: "登出", icon: "🚪", action: "logout" },
    ],
  },
];

function getRoleByPath(pathname: string, storedRole: RoleKind | null): RoleKind {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/teacher")) return "teacher";
  if (storedRole === "parent") return "parent";
  if (storedRole === "teacher") return "teacher";
  if (storedRole === "admin") return "admin";
  if (
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/downloads") ||
    pathname.startsWith("/my-reviews") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/favorites")
  ) {
    return "parent";
  }
  return "public";
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function getTeacherActiveId(pathname: string, params: { status: string | null; view: string | null; tab: string | null }) {
  if (pathname.startsWith("/teacher/materials/new")) return "teacher-create";
  if (pathname.startsWith("/teacher/sales")) {
    return "teacher-sales";
  }
  if (pathname.startsWith("/teacher/materials")) {
    if (params.status === "draft") return "teacher-status-draft";
    if (params.status === "pending_review") return "teacher-status-pending";
    if (params.status === "published") return "teacher-status-published";
    if (params.status === "unpublished") return "teacher-status-unpublished";
    if (params.view === "list") return "teacher-materials";
    if (params.view === "reviews") return "teacher-reviews";
    if (params.view === "profile") return "teacher-profile";
    return "teacher-materials";
  }
  return "";
}

function roleTitle(role: RoleKind) {
  if (role === "admin") return "管理員";
  if (role === "teacher") return "教材工作台";
  if (role === "parent") return "使用者中心";
  return "探索教材";
}

export function RoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [storedRole, setStoredRole] = useState<RoleKind | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [teacherStatusCounts, setTeacherStatusCounts] = useState({
    draft: 0,
    pending_review: 0,
    published: 0,
    unpublished: 0,
  });
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

  useEffect(() => {
    if (role !== "teacher") return;
    let active = true;
    void (async () => {
      try {
        const meRes = await apiFetch("auth/me");
        if (!meRes.ok) return;
        const mePayload = (await meRes.json()) as { user?: { id?: string } };
        const meId = mePayload.user?.id;
        const materialsRes = await apiFetch("materials");
        if (!materialsRes.ok) return;
        const materialsPayload = (await materialsRes.json()) as { items?: Array<{ teacher_id?: string; status?: string }> };
        const own = (materialsPayload.items ?? []).filter((item) => (meId ? item.teacher_id === meId : true));
        const next = {
          draft: own.filter((item) => item.status === "draft").length,
          pending_review: own.filter((item) => item.status === "pending_review").length,
          published: own.filter((item) => item.status === "published").length,
          unpublished: own.filter((item) => item.status === "unpublished").length,
        };
        if (active) setTeacherStatusCounts(next);
      } catch {
        /* keep last counts */
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, role]);

  /** Parent route group `(parent)/*` already uses ParentAppShell; avoid double chrome. */
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/explore")) {
    return <>{children}</>;
  }
  /** Auth pages should not render any global sidebar chrome. */
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return <>{children}</>;
  }
  /** Admin routes use AdminShell in /app/admin/layout.tsx. */
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  const parentShellRoutes = [
    "/materials",
    "/explore",
    "/cart",
    "/checkout",
    "/orders",
    "/downloads",
    "/my-reviews",
    "/favorites",
  ];
  const shouldUseParentShell =
    role === "parent" && parentShellRoutes.some((base) => pathname === base || pathname.startsWith(`${base}/`));
  if (shouldUseParentShell) {
    return <ParentAppShell>{children}</ParentAppShell>;
  }

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

  const teacherActiveId = getTeacherActiveId(pathname, {
    status: searchParams.get("status"),
    view: searchParams.get("view"),
    tab: searchParams.get("tab"),
  });

  const teacherItemCls = (item: TeacherNavItem) =>
    [
      "flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm transition-colors",
      teacherActiveId === item.id
        ? "border-[#6C63FF] bg-[#EDE9FE] font-semibold text-[#6C63FF]"
        : "border-transparent font-medium text-[#4B5563] hover:bg-[#F7F4FF] hover:text-[#1F2937]",
    ].join(" ");

  const teacherStatusBadgeMap = {
    "teacher-status-draft": { value: teacherStatusCounts.draft, tone: "bg-[#F3F4F6] text-[#6B7280]" },
    "teacher-status-pending": { value: teacherStatusCounts.pending_review, tone: "bg-[#FEF3EC] text-[#F59E0B]" },
    "teacher-status-published": { value: teacherStatusCounts.published, tone: "bg-[#ECFDF3] text-[#22C55E]" },
    "teacher-status-unpublished": { value: teacherStatusCounts.unpublished, tone: "bg-[#F3F4F6] text-[#6B7280]" },
  } as const;

  const teacherSectionLabel = "mb-2 mt-6 px-3 text-xs font-semibold tracking-wide text-[#7C74C8]";
  const teacherHeader = (
    <div className="border-b border-[#E5E7EB]/80 px-5 py-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EDUMARKET</p>
      <div className="mt-3 rounded-3xl bg-[#F4F1FF] p-4">
        <p className="text-3xl leading-none" aria-hidden>
          🎓
        </p>
        <p className="mt-2 text-[30px] font-bold leading-none text-[#1F2937]">Hi, 歡迎回來 👋</p>
        <p className="mt-2 text-sm text-[#6B7280]">管理你的教材與銷售</p>
      </div>
    </div>
  );

  if (role === "teacher") {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#F4F1FF]">
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[#E5E7EB]/80 bg-white px-4 py-3 lg:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EDUMARKET</p>
            <p className="text-sm font-bold text-[#1F2937]">教材工作台</p>
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
          {teacherHeader}
          <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3" aria-label="教材工作台手機側邊選單">
            {TEACHER_SECTIONS.map((section) => (
              <div key={`mobile-${section.label}`}>
                <p className={teacherSectionLabel}>{section.label}</p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={`mobile-${item.id}`}>
                      {item.action === "logout" ? (
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                        >
                          <span aria-hidden>{item.icon}</span>
                          {item.label}
                        </button>
                      ) : (
                        <Link href={item.href ?? "/teacher/materials"} className={teacherItemCls(item)}>
                          <span aria-hidden>{item.icon}</span>
                          <span>{item.label}</span>
                          {teacherStatusBadgeMap[item.id as keyof typeof teacherStatusBadgeMap] ? (
                            <span
                              className={`ml-auto inline-flex min-w-[1.6rem] items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${
                                teacherStatusBadgeMap[item.id as keyof typeof teacherStatusBadgeMap].tone
                              }`}
                            >
                              {teacherStatusBadgeMap[item.id as keyof typeof teacherStatusBadgeMap].value}
                            </span>
                          ) : null}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-[#E5E7EB]/80 bg-white lg:flex lg:flex-col">
          {teacherHeader}
          <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3" aria-label="教材工作台側邊選單">
            {TEACHER_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className={teacherSectionLabel}>{section.label}</p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      {item.action === "logout" ? (
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                        >
                          <span aria-hidden>{item.icon}</span>
                          {item.label}
                        </button>
                      ) : (
                        <Link href={item.href ?? "/teacher/materials"} className={teacherItemCls(item)}>
                          <span aria-hidden>{item.icon}</span>
                          <span>{item.label}</span>
                          {teacherStatusBadgeMap[item.id as keyof typeof teacherStatusBadgeMap] ? (
                            <span
                              className={`ml-auto inline-flex min-w-[1.6rem] items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${
                                teacherStatusBadgeMap[item.id as keyof typeof teacherStatusBadgeMap].tone
                              }`}
                            >
                              {teacherStatusBadgeMap[item.id as keyof typeof teacherStatusBadgeMap].value}
                            </span>
                          ) : null}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="lg:ml-60">
          <main className="min-h-dvh">{children}</main>
        </div>
      </div>
    );
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
