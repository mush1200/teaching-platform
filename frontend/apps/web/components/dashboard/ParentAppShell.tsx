"use client";

import type { CSSProperties, ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getStoredToken } from "../../lib/api-client";
import type { OrdersListResponse } from "../../lib/api-types";
import { getCartItems } from "../../lib/api-repository";
import { Sidebar } from "./Sidebar";
import { NavDrawer } from "../layout/NavDrawer";
import { SIDEBAR_NAV_SCROLL_CLASS } from "../layout/shell-constants";
import { Topbar } from "./Topbar";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "./sidebar-constants";
import { useSidebarCollapse } from "./useSidebarCollapse";

type Props = {
  children: ReactNode;
  cartBadge?: number;
  ordersBadge?: number;
};

function TopbarFallback() {
  return <div className="h-14 w-full shrink-0 border-b border-black/[0.05] bg-white/90" aria-hidden />;
}

export function ParentAppShell({ children, cartBadge = 0, ordersBadge = 0 }: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [liveCartBadge, setLiveCartBadge] = useState(cartBadge);
  const [liveOrdersBadge, setLiveOrdersBadge] = useState(ordersBadge);
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebarCollapse();

  const desktopOffset = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const shellStyle = {
    "--sidebar-offset": `${desktopOffset}px`,
  } as CSSProperties;

  const syncBadges = useCallback(async () => {
    try {
      const cart = await getCartItems();
      const nextCartBadge = cart.reduce((sum, item) => sum + item.quantity, 0);
      setLiveCartBadge(nextCartBadge);
    } catch {
      setLiveCartBadge(0);
    }

    const token = getStoredToken();
    if (!token) {
      setLiveOrdersBadge(0);
      return;
    }
    try {
      // Buyer 外殼的 session 探測（`DX-04` 的 opt-in 點）—— 理由同 `RoleShell`。
      const res = await apiFetch("orders/my", undefined, { authExpiry: "recover" });
      if (!res.ok) {
        setLiveOrdersBadge(0);
        return;
      }
      const payload = (await res.json()) as OrdersListResponse;
      const list = payload.items ?? [];
      const actionableCount = list.filter((order) => {
        const status = String(order.status ?? "").toLowerCase();
        return status === "pending_payment" || status === "rejected";
      }).length;
      setLiveOrdersBadge(actionableCount);
    } catch {
      setLiveOrdersBadge(0);
    }
  }, []);

  useEffect(() => {
    void syncBadges();
  }, [pathname, syncBadges]);

  useEffect(() => {
    const onCartUpdated = () => {
      void syncBadges();
    };
    const onFocus = () => {
      void syncBadges();
    };
    window.addEventListener("tp:cart-updated", onCartUpdated);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("tp:cart-updated", onCartUpdated);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncBadges]);

  return (
    <div className="min-h-dvh bg-[#F4F1FF] font-sans text-ds-heading antialiased">
      <aside
        /*
          `UI-CONS-05`（Wave UI-6，Owner 產品決定）：authenticated persistent sidebar
          的斷點統一為 **`lg`（1024）**。買家原本是 `md`（768），因此 768–1023 會多出
          一條 240px 的常駐側欄，而同寬度下 Admin／Creator 已經是 drawer 模式。
          這裡只改「什麼時候顯示」，側欄內容、收合能力與 localStorage 行為都不動。
        */
        className="fixed left-0 top-0 z-40 hidden h-dvh overflow-hidden transition-[width] duration-200 ease-out lg:block"
        style={{ width: desktopOffset }}
        aria-label="側邊導覽"
        data-testid="buyer-sidebar-desktop"
      >
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          cartBadge={liveCartBadge}
          ordersBadge={liveOrdersBadge}
        />
      </aside>

      {/*
        `UI-CONS-23`（Wave UI-6）：買家抽屜改用共用的 `components/layout/NavDrawer`。

        原本這裡是自己一份 overlay ＋ `<aside>`：**沒有** `Escape` 關閉、沒有 focus 管理、
        沒有背景 scroll lock、沒有 `role="dialog"`／`aria-modal`，寬度是固定 240px
        （窄視窗上只剩很少的遮罩可點）。Admin／Creator 早已共用 `NavDrawer`，
        買家是唯一的例外 —— 現在三個外殼共用同一份行為。

        寬度改由 `DRAWER_WIDTH_CLASS`（`min(18rem, 85vw)`）決定，因此在 320px 視窗上
        仍留得下可點的遮罩。側欄以 `variant="drawer"` 渲染，避免與抽屜自己的
        品牌區塊與關閉鈕重複。
      */}
      <NavDrawer
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        id="buyer-nav-drawer"
        ariaLabel="使用者中心導覽"
        triggerRef={drawerTriggerRef}
        header={
          <>
            <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">EDUMARKET</p>
            <p className="truncate text-sm font-bold text-ds-heading">使用者中心</p>
          </>
        }
      >
        <div className={SIDEBAR_NAV_SCROLL_CLASS}>
          <Sidebar
            collapsed={false}
            onToggleCollapsed={toggleCollapsed}
            cartBadge={liveCartBadge}
            ordersBadge={liveOrdersBadge}
            onNavigate={() => setMobileSidebarOpen(false)}
            forceExpanded
            variant="drawer"
          />
        </div>
      </NavDrawer>

      <div
        /* `UI-CONS-05`：內容偏移必須與側欄同一個斷點，否則 768 會出現「沒有側欄卻留著側欄寬度」。 */
        className="flex min-h-dvh flex-col pl-0 transition-[padding-left] duration-200 ease-out lg:pl-[var(--sidebar-offset)]"
        style={shellStyle}
      >
        <Suspense fallback={<TopbarFallback />}>
          <Topbar cartBadge={liveCartBadge} onMenuClick={() => setMobileSidebarOpen(true)} menuButtonRef={drawerTriggerRef} drawerId="buyer-nav-drawer" drawerOpen={mobileSidebarOpen} />
        </Suspense>
        {/*
          `UI-CONS-07`（Wave UI-4B）—— **這個外殼不再供應水平 gutter**。

          原因是實測出來的：買家路由的外殼**取決於角色**，不是取決於路由。
          `RoleShell.getRoleByPath()` 只在 `storedRole === "parent"` 時才走 `ParentAppShell`；
          而 `/orders`／`/favorites`／`/downloads`／`/my-reviews`／`/checkout`／`/me/*`
          在 `middleware.ts` 只有 login gate、**沒有 role gate**，所以創作者或管理員
          也能開到這些頁，那時走的是 `RoleShell` 的無內距 `<main>`。

          gutter 若掛在這個外殼上，同一個頁面就會「買家有內距、其他角色貼邊」。
          因此買家頁的 gutter 一律由**頁面自己唯一的外層容器**供應。
          垂直節奏仍由外殼提供（買家殼刻意比 Admin 緊湊）。
        */}
        <main className="flex-1 pb-3 pt-1.5 md:pb-4 md:pt-2">{children}</main>
      </div>
    </div>
  );
}
