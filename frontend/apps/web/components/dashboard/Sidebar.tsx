"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import {
  isSidebarItemActive,
  SIDEBAR_COLLAPSED_SECTIONS,
  SIDEBAR_ICON_STROKE,
  SIDEBAR_NAV_SECTIONS,
  type SidebarBadgeKey,
  type SidebarNavItemDef,
  type SidebarNavSection,
} from "./sidebar-nav-config";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "./sidebar-constants";

const ICON_SIZE = "size-[22px] shrink-0";
const SIDEBAR_BORDER = "border-[#EEF0F6]";
const SIDEBAR_BG = "bg-white";
const NAV_ITEM_SIZE = "size-11"; /* 44×44 */

const NAV_BTN_BASE =
  "relative flex shrink-0 items-center justify-center rounded-[10px] transition-[background-color,color,opacity] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edu-primary";

function navBtnTone(active: boolean, danger?: boolean) {
  if (danger) {
    return active ? "bg-red-50 text-red-600" : "text-slate-500 hover:bg-slate-50 hover:text-red-600";
  }
  if (active) {
    return "bg-edu-primary/[0.12] text-edu-primary";
  }
  return "text-slate-500 hover:bg-edu-primary/[0.06] hover:text-slate-700";
}

function badgeFor(key: SidebarBadgeKey | undefined, cartBadge: number, ordersBadge: number) {
  if (key === "cart") return cartBadge;
  if (key === "orders") return ordersBadge;
  return 0;
}

function BrandMark({ size = "md" }: { size?: "md" | "sm" }) {
  const box = size === "sm" ? "size-7" : "size-8";
  const icon = size === "sm" ? "size-4" : "size-[18px]";
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-[10px] bg-[#F5F3FF] text-edu-primary`}
      aria-hidden
    >
      <GraduationCap className={icon} strokeWidth={SIDEBAR_ICON_STROKE} />
    </span>
  );
}

/** 展開狀態：header 右上角收合 */
function SidebarToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-transparent text-slate-400 transition-colors duration-200 ease-out hover:bg-edu-primary/[0.08] hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edu-primary"
      aria-label="收合側邊欄"
      aria-expanded
    >
      <ChevronLeft className="size-[18px]" strokeWidth={SIDEBAR_ICON_STROKE} aria-hidden />
    </button>
  );
}

/** 收合 header：僅 logo，hover 顯示展開箭頭 */
function CollapsedSidebarHeader({ onToggleCollapsed }: { onToggleCollapsed: () => void }) {
  return (
    <header className={`flex h-11 shrink-0 items-center justify-center border-b ${SIDEBAR_BORDER} px-2`}>
      <NavTooltip label="展開側邊欄" show>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="group relative flex size-8 items-center justify-center rounded-[10px] bg-[#F2EBFF] text-edu-primary transition-colors duration-200 ease-out hover:bg-edu-primary/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edu-primary"
          aria-label="展開側邊欄"
          aria-expanded={false}
        >
          <GraduationCap
            className="size-4 transition-opacity duration-150 ease-out group-hover:opacity-0"
            strokeWidth={SIDEBAR_ICON_STROKE}
            aria-hidden
          />
          <ChevronRight
            className="pointer-events-none absolute size-4 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
            strokeWidth={SIDEBAR_ICON_STROKE}
            aria-hidden
          />
        </button>
      </NavTooltip>
    </header>
  );
}

function NavTooltip({ label, children, show }: { label: string; children: ReactNode; show: boolean }) {
  if (!show) return <>{children}</>;
  return (
    <div className="group/tip relative flex justify-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#2E2E33] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-[0_4px_12px_rgba(15,23,42,0.12)] transition-opacity duration-150 ease-out group-hover/tip:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

function InlineNavBadge({ count }: { count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#FF6B7A] px-1 text-[10px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}

function CollapsedNavBadge({ count }: { count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6B7A] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
      {label}
    </span>
  );
}

function RailDivider() {
  return <hr className="mx-auto my-4 h-px w-8 border-0 bg-[#EEF0F6]" aria-hidden />;
}

function NavLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  if (collapsed) return null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
      {children}
    </span>
  );
}

function NavItemRow({
  item,
  active,
  badgeCount,
  collapsed,
  onNavigate,
  onLogout,
}: {
  item: SidebarNavItemDef;
  active: boolean;
  badgeCount: number;
  collapsed: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const Icon = item.icon;
  const isLogout = item.action === "logout";
  const cls = [
    NAV_BTN_BASE,
    navBtnTone(active, isLogout),
    collapsed ? NAV_ITEM_SIZE : "h-11 w-full justify-start gap-2.5 px-3",
  ].join(" ");

  const inner = (
    <>
      <Icon className={ICON_SIZE} strokeWidth={SIDEBAR_ICON_STROKE} aria-hidden />
      <NavLabel collapsed={collapsed}>
        <span className="truncate text-[15px] font-medium">{item.label}</span>
        {badgeCount > 0 ? <InlineNavBadge count={badgeCount} /> : null}
      </NavLabel>
      {collapsed && badgeCount > 0 ? <CollapsedNavBadge count={badgeCount} /> : null}
    </>
  );

  const node = (() => {
    if (isLogout) {
      return (
        <button type="button" className={cls} onClick={() => { onLogout(); onNavigate?.(); }}>
          {inner}
        </button>
      );
    }
    if (!item.href) return null;
    if (item.href.startsWith("#")) {
      return (
        <a href={item.href} className={cls} onClick={onNavigate}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={item.href} className={cls} onClick={onNavigate}>
        {inner}
      </Link>
    );
  })();

  if (!node) return null;
  return (
    <NavTooltip label={item.label} show={collapsed}>
      {node}
    </NavTooltip>
  );
}

function SectionTitle({ collapsed, label, first }: { collapsed: boolean; label: string; first?: boolean }) {
  if (collapsed) return null;
  return (
    <p
      className={`mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400/80 ${
        first ? "mt-0" : "mt-7"
      }`}
    >
      {label}
    </p>
  );
}

function NavSectionBlock({
  section,
  sectionIdx,
  collapsed,
  pathname,
  cartBadge,
  ordersBadge,
  onNavigate,
  onLogout,
}: {
  section: SidebarNavSection;
  sectionIdx: number;
  collapsed: boolean;
  pathname: string;
  cartBadge: number;
  ordersBadge: number;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className={collapsed ? "flex w-full flex-col items-center" : undefined}>
      {collapsed && sectionIdx > 0 ? <RailDivider /> : null}
      <SectionTitle collapsed={collapsed} label={section.label} first={sectionIdx === 0} />
      <ul className={`flex flex-col ${collapsed ? "w-full items-center gap-2" : "gap-2 px-2"}`}>
        {section.items.map((item) => {
          const active = item.href ? isSidebarItemActive(pathname, item.href, item.exact) : false;
          return (
            <li key={item.id} className={collapsed ? "flex justify-center" : undefined}>
              <NavItemRow
                item={item}
                active={active}
                badgeCount={badgeFor(item.badge, cartBadge, ordersBadge)}
                collapsed={collapsed}
                onNavigate={onNavigate}
                onLogout={onLogout}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useDisplayName() {
  const [displayName, setDisplayName] = useState("使用者");

  useEffect(() => {
    const name = localStorage.getItem("tp_display_name")?.trim();
    const email = localStorage.getItem("tp_user_email")?.trim();
    if (name) setDisplayName(name);
    else if (email) setDisplayName(email.split("@")[0] ?? "使用者");
  }, []);

  const initial = displayName.slice(0, 1).toUpperCase() || "U";
  return { displayName, initial };
}

function SidebarProfileFooter({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { displayName, initial } = useDisplayName();

  if (collapsed) {
    return (
      <footer className={`mt-auto flex w-full shrink-0 justify-center border-t ${SIDEBAR_BORDER} py-2.5`}>
        <NavTooltip label="個人資料" show>
          <a
            href="#account"
            onClick={onNavigate}
            className={`${NAV_BTN_BASE} ${navBtnTone(false)} ${NAV_ITEM_SIZE}`}
          >
            <span
              className="flex size-8 items-center justify-center rounded-full bg-[#2E2E33] text-xs font-semibold text-white"
              aria-hidden
            >
              {initial}
            </span>
          </a>
        </NavTooltip>
      </footer>
    );
  }

  return (
    <footer className={`mt-auto shrink-0 border-t ${SIDEBAR_BORDER} px-3 py-2`}>
      <a
        href="#account"
        onClick={onNavigate}
        className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2 transition-colors duration-200 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edu-primary"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2E2E33] text-xs font-semibold text-white"
          aria-hidden
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-[13px] font-medium leading-tight text-ds-heading">{displayName}</span>
          <span className="block truncate text-[11px] text-slate-400">個人資料</span>
        </span>
      </a>
    </footer>
  );
}

function SidebarHeader({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (collapsed) {
    return <CollapsedSidebarHeader onToggleCollapsed={onToggleCollapsed} />;
  }

  return (
    <header className={`flex shrink-0 items-center gap-3 border-b ${SIDEBAR_BORDER} p-4`}>
      <BrandMark />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-[0.08em] text-edu-primary">EDUMARKET</p>
        <p className="mt-0.5 truncate text-[13px] font-medium leading-snug text-ds-heading">Hi，歡迎回來 👋</p>
      </div>
      <SidebarToggle onToggle={onToggleCollapsed} />
    </header>
  );
}

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  cartBadge?: number;
  ordersBadge?: number;
  onNavigate?: () => void;
  forceExpanded?: boolean;
};

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  cartBadge = 0,
  ordersBadge = 0,
  onNavigate,
  forceExpanded = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const isCollapsed = collapsed && !forceExpanded;
  const width = isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const sections = isCollapsed ? SIDEBAR_COLLAPSED_SECTIONS : SIDEBAR_NAV_SECTIONS;

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
    <aside
      data-sidebar-ui={isCollapsed ? "buyer-collapsed" : "buyer-expanded"}
      style={{ width }}
      className={`flex h-full flex-col ${SIDEBAR_BORDER} ${SIDEBAR_BG} border-r transition-[width] duration-200 ease-out`}
      aria-label={isCollapsed ? "收合側邊導覽" : "展開側邊導覽"}
    >
      <SidebarHeader collapsed={isCollapsed} onToggleCollapsed={onToggleCollapsed} />

      <nav
        className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${
          isCollapsed
            ? "sidebar-rail-scroll-hidden flex flex-col items-center justify-start py-3"
            : "sidebar-panel-scroll py-3"
        }`}
        aria-label="主要選單"
      >
        {sections.map((section, sectionIdx) => (
          <NavSectionBlock
            key={section.label}
            section={section}
            sectionIdx={sectionIdx}
            pathname={pathname}
            collapsed={isCollapsed}
            cartBadge={cartBadge}
            ordersBadge={ordersBadge}
            onNavigate={onNavigate}
            onLogout={handleLogout}
          />
        ))}
      </nav>

      <SidebarProfileFooter collapsed={isCollapsed} onNavigate={onNavigate} />
    </aside>
  );
}
