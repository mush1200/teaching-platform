"use client";

import Link from "next/link";
import {
  SIDEBAR_DESKTOP_WIDTH_CLASS,
  SIDEBAR_NAV_SCROLL_CLASS,
  SIDEBAR_SHELL_CLASS,
  SIDEBAR_STATIC_CLASS,
} from "./shell-constants";

/**
 * 創作者工作台側欄。
 *
 * 與 `components/admin/AdminSidebar` **結構完全對稱**（同一組 shell class、
 * 同一種 section／item 樣式、同一個 desktop identity card 版位、同一個底部登出列）。
 * 兩者的差別只有導覽內容 —— 這正是 Epic §12 要的：shell 一致、內容可以不同。
 *
 * 之前這份 markup 在 `RoleShell` 裡被複製了兩次（mobile 一份、desktop 一份），
 * 任何一次調整都得記得改兩個地方；現在只有這一份，由 `variant` 決定外框。
 */

export type CreatorNavItem = {
  id: string;
  href?: string;
  label: string;
  icon: string;
  action?: "logout";
};
export type CreatorSection = { label: string; items: CreatorNavItem[] };

type Props = {
  variant?: "desktop" | "drawer";
  sections: CreatorSection[];
  activeId: string;
  /** `item.id` → 徽章數字與色調；沒有對應 key 的項目不顯示徽章。 */
  badges?: Record<string, { value: number; tone: string } | undefined>;
  onNavigate?: () => void;
  onLogout: () => void;
};

const rootByVariant: Record<NonNullable<Props["variant"]>, string> = {
  desktop: `hidden border-r border-ds-borderMuted bg-ds-surface lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex ${SIDEBAR_DESKTOP_WIDTH_CLASS} ${SIDEBAR_SHELL_CLASS}`,
  drawer: `${SIDEBAR_SHELL_CLASS} w-full bg-ds-surface`,
};

export function CreatorSidebar({
  variant = "desktop",
  sections,
  activeId,
  badges = {},
  onNavigate,
  onLogout,
}: Props) {
  const itemClass = (item: CreatorNavItem) =>
    [
      "flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm transition-colors",
      activeId === item.id
        ? "border-edu-primary bg-[#EDE9FE] font-semibold text-edu-primary"
        : "border-transparent font-medium text-[#4B5563] hover:bg-[#F7F4FF] hover:text-ds-heading",
    ].join(" ");

  return (
    <aside className={rootByVariant[variant]} data-testid={`creator-sidebar-${variant}`}>
      {variant === "desktop" ? (
        <div className={`${SIDEBAR_STATIC_CLASS} border-b border-ds-borderMuted px-4 pb-4 pt-5`}>
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-edu-primary">EDUMARKET</p>
          <div data-testid="sidebar-identity" className="mt-4 flex items-center gap-3 rounded-2xl bg-edu-page p-3.5">
            <span className="shrink-0 text-[28px] leading-none" aria-hidden>
              🎓
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-ds-heading">Hi, 歡迎回來 👋</p>
              <p className="mt-1 text-xs leading-snug text-ds-textMuted">管理你的教材與銷售</p>
            </div>
          </div>
        </div>
      ) : null}

      <nav className={`${SIDEBAR_NAV_SCROLL_CLASS} px-3 pb-3`} aria-label="創作者工作台選單">
        {sections.map((section, index) => (
          <div key={section.label}>
            <p
              className={`mb-2 px-3 text-xs font-semibold tracking-wide text-[#7C74C8] ${index === 0 ? "mt-2" : "mt-5"}`}
            >
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const badge = badges[item.id];
                return (
                  <li key={item.id}>
                    {item.action === "logout" ? (
                      <button
                        type="button"
                        onClick={onLogout}
                        className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-edu-error"
                      >
                        <span aria-hidden>{item.icon}</span>
                        {item.label}
                      </button>
                    ) : (
                      <Link
                        href={item.href ?? "/creator/materials"}
                        onClick={onNavigate}
                        aria-current={activeId === item.id ? "page" : undefined}
                        className={itemClass(item)}
                      >
                        <span aria-hidden>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                        {badge ? (
                          <span
                            className={`ml-auto inline-flex min-w-[1.6rem] shrink-0 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${badge.tone}`}
                          >
                            {badge.value}
                          </span>
                        ) : null}
                      </Link>
                    )}
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
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-edu-error"
        >
          <span aria-hidden>🚪</span>
          登出
        </button>
      </div>
    </aside>
  );
}

/**
 * 一般角色（public / buyer fallback）的簡單清單側欄。
 *
 * 與 `CreatorSidebar` 共用同一組 shell class；差別只在沒有分段與徽章。
 */
export function SimpleNavSidebar({
  variant = "desktop",
  title,
  items,
  isActive,
  onNavigate,
  onLogout,
}: {
  variant?: "desktop" | "drawer";
  title: string;
  items: Array<{ href: string; label: string; exact?: boolean }>;
  isActive: (item: { href: string; exact?: boolean }) => boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className={rootByVariant[variant]} data-testid={`role-sidebar-${variant}`}>
      {variant === "desktop" ? (
        <div className={`${SIDEBAR_STATIC_CLASS} border-b border-ds-borderMuted px-5 py-6`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-edu-primary">EduMarket</p>
          <p className="text-lg font-bold text-ds-heading">{title}</p>
        </div>
      ) : null}

      <nav className={`${SIDEBAR_NAV_SCROLL_CLASS} flex flex-col gap-1 p-3`} aria-label="側邊選單">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive(item) ? "page" : undefined}
            className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive(item)
                ? "bg-edu-page text-edu-primary"
                : "text-ds-textMuted hover:bg-[#F9FAFB] hover:text-ds-heading"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={`${SIDEBAR_STATIC_CLASS} border-t border-ds-borderMuted p-3`}>
        <button
          type="button"
          onClick={onLogout}
          className="block w-full rounded-2xl px-4 py-2.5 text-center text-sm font-semibold text-ds-textMuted hover:bg-[#FEF2F2] hover:text-edu-error"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
