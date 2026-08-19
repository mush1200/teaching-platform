"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavItem = { href: string; label: string; icon: string; exact?: boolean };
type NavSection = { label: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    label: "總控台",
    items: [
      { href: "/admin", label: "營運總覽", icon: "📊", exact: true },
      { href: "/admin/materials?status=pending_review", label: "教材審核", icon: "📚" },
      { href: "/admin/payment-proofs?status=pending", label: "付款憑證", icon: "🧾" },
      { href: "/admin/orders", label: "訂單管理", icon: "📦" },
    ],
  },
  {
    label: "監控與治理",
    items: [
      { href: "/admin/reports?status=pending", label: "檢舉管理", icon: "🚩" },
      { href: "/admin/activity-logs", label: "活動紀錄", icon: "🕒" },
      { href: "/admin/users", label: "用戶管理", icon: "👥" },
      { href: "/admin/reviews-hub", label: "教學回饋管理", icon: "⭐" },
      { href: "/admin/settings", label: "系統設定", icon: "⚙️" },
    ],
  },
];

function navPath(href: string) {
  return href.split("?")[0] ?? href;
}

type Props = {
  /**
   * `desktop`（預設）：`lg` 以下隱藏，`lg` 以上維持原本的固定側欄。
   * `drawer`：在 `AdminShell` 的 mobile drawer 容器內渲染，永遠可見並填滿容器。
   *
   * 兩種型態共用同一份 `sections`，不另外維護一組 mobile navigation。
   */
  variant?: "desktop" | "drawer";
  /** 點擊導覽項或登出後呼叫；drawer 用它自動關閉。 */
  onNavigate?: () => void;
  /** 只在 `drawer` 使用：放進 compact 標頭列右側（關閉鈕）。 */
  headerAction?: ReactNode;
};

const rootByVariant: Record<NonNullable<Props["variant"]>, string> = {
  // `hidden … lg:flex`：`lg` 以下完全不佔文件流（原本是 `w-full` 區塊，會把主內容整條推到下面）。
  desktop:
    "hidden w-full flex-col border-r border-[#E5E7EB]/80 bg-white lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:max-w-[240px]",
  drawer: "flex min-h-0 w-full flex-1 flex-col bg-white",
};

export function AdminSidebar({ variant = "desktop", onNavigate, headerAction }: Props = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(item: NavItem) {
    const path = navPath(item.href);
    if (item.exact) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
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
    onNavigate?.();
    router.push("/login");
  }

  return (
    <aside className={rootByVariant[variant]}>
      {variant === "drawer" ? (
        /*
         * Drawer 專用 compact 標頭：只保留品牌／區域 context 與關閉鈕，直接進入 navigation。
         * 不放個人問候卡 —— 那在抽屜裡與 top bar 重複，且吃掉大量垂直空間。
         * 帳號 context 由底部的登出列承擔。Desktop 版本維持原本的大卡片。
         */
        <div className="flex shrink-0 items-center gap-3 border-b border-ds-borderMuted px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption font-semibold uppercase tracking-wider text-edu-primary">EDUMARKET</p>
            <p className="truncate text-sm font-bold text-ds-heading">管理後台</p>
          </div>
          {headerAction}
        </div>
      ) : (
        <div className="border-b border-[#E5E7EB]/80 px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6C63FF]">EDUMARKET</p>
          <div className="mt-3 rounded-3xl bg-[#F4F1FF] p-4">
            <p className="text-xl leading-none" aria-hidden>
              🛡️
            </p>
            <p className="mt-2 text-lg font-bold text-[#1F2937]">Hi, Admin 👋</p>
            <p className="mt-1 text-xs text-[#6B7280]">平台營運總控台</p>
          </div>
        </div>
      )}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3" aria-label="後台選單">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 mt-6 px-3 text-xs font-semibold tracking-wide text-[#7C74C8]">{section.label}</p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "border-[#6C63FF] bg-[#EDE9FE] font-semibold text-[#6C63FF]"
                          : "border-transparent font-medium text-[#4B5563] hover:bg-[#F7F4FF] hover:text-[#1F2937]"
                      }`}
                    >
                      <span aria-hidden>{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-[#E5E7EB]/80 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
        >
          <span aria-hidden>🚪</span>
          登出
        </button>
      </div>
    </aside>
  );
}
