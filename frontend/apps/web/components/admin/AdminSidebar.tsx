"use client";

import Link from "next/link";
import { clearClientSession } from "../../lib/session";
import { usePathname, useRouter } from "next/navigation";
import {
  SIDEBAR_DESKTOP_WIDTH_CLASS,
  SIDEBAR_NAV_SCROLL_CLASS,
  SIDEBAR_SHELL_CLASS,
  SIDEBAR_STATIC_CLASS,
} from "../layout/shell-constants";

import {
  ADMIN_NAV_SECTIONS,
  navPathOf,
  type AdminNavItem,
} from "../../lib/admin-nav";

/**
 * 這份側欄的導覽內容來自 `lib/admin-nav.ts` —— Admin 導覽的**唯一** source of truth。
 *
 * `RoleShell`（Admin 逛**非** `/admin` 路由時的側欄）取用的是同一份資料的扁平化結果，
 * 兩個 surface 不各自維護一份清單 —— 之前正是因為各有一份，`IA-01` 與 `IA-07` 的收斂
 * 只在 `/admin/*` 生效（`IA-08`）。分組依據與各項的去留決策寫在該檔的註解。
 */

type Props = {
  /**
   * `desktop`（預設）：`lg` 以下隱藏，`lg` 以上為固定側欄。
   * `drawer`：在 `NavDrawer` 的面板內渲染，填滿容器並自行捲動。
   *
   * 兩種型態共用同一份 `ADMIN_NAV_SECTIONS`，不另外維護一組 mobile navigation。
   */
  variant?: "desktop" | "drawer";
  /** 點擊導覽項或登出後呼叫；drawer 用它自動關閉。 */
  onNavigate?: () => void;
};

const rootByVariant: Record<NonNullable<Props["variant"]>, string> = {
  // `hidden … lg:flex`：`lg` 以下完全不佔文件流。寬度用 shared token，不再各自寫死。
  desktop: `hidden border-r border-ds-borderMuted bg-ds-surface lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex ${SIDEBAR_DESKTOP_WIDTH_CLASS} ${SIDEBAR_SHELL_CLASS}`,
  drawer: `${SIDEBAR_SHELL_CLASS} w-full bg-ds-surface`,
};

export function AdminSidebar({ variant = "desktop", onNavigate }: Props = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(item: AdminNavItem) {
    const path = navPathOf(item.href);
    if (item.exact) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  function handleLogout() {
    // 與 401 session 恢復共用同一份清單（`DX-04`）—— 兩者對「什麼算已登入」必須一致。
    clearClientSession();
    onNavigate?.();
    router.push("/login");
  }

  return (
    <aside className={rootByVariant[variant]} data-testid={`admin-sidebar-${variant}`}>
      {variant === "desktop" ? (
        /*
         * Desktop identity card —— 角色 identity，不是 sidebar hero。
         * icon 與文字同一列，讓下方四段導航在一般高度的視窗內不需捲動就完整看得到。
         * Drawer 版本不放這張卡：抽屜裡它與 top bar 重複，且吃掉大量垂直空間。
         */
        <div className={`${SIDEBAR_STATIC_CLASS} border-b border-ds-borderMuted px-4 pb-4 pt-5`}>
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-edu-primary">EDUMARKET</p>
          <div data-testid="sidebar-identity" className="mt-4 flex items-center gap-3 rounded-2xl bg-edu-page p-3.5">
            <span className="shrink-0 text-[28px] leading-none" aria-hidden>
              🛡️
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-ds-heading">Hi, Admin 👋</p>
              <p className="mt-1 text-xs leading-snug text-ds-textMuted">平台營運總控台</p>
            </div>
          </div>
        </div>
      ) : null}

      <nav className={`${SIDEBAR_NAV_SCROLL_CLASS} px-3 pb-3`} aria-label="後台選單">
        {ADMIN_NAV_SECTIONS.map((section, index) => (
          <div key={section.label}>
            {/* 第一段貼近上方邊界；段與段之間才拉開，避免每一段都留大空白。 */}
            <p
              className={`mb-2 px-3 text-xs font-semibold tracking-wide text-[#7C74C8] ${index === 0 ? "mt-2" : "mt-5"}`}
            >
              {section.label}
            </p>
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
                          ? "border-edu-primary bg-[#EDE9FE] font-semibold text-edu-primary"
                          : "border-transparent font-medium text-[#4B5563] hover:bg-[#F7F4FF] hover:text-ds-heading"
                      }`}
                    >
                      <span aria-hidden>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`${SIDEBAR_STATIC_CLASS} border-t border-ds-borderMuted p-3`}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-edu-error"
        >
          <span aria-hidden>🚪</span>
          登出
        </button>
      </div>
    </aside>
  );
}
