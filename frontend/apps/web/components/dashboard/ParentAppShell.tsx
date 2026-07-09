"use client";

import type { CSSProperties, ReactNode } from "react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getStoredToken } from "../../lib/api-client";
import type { OrdersListResponse } from "../../lib/api-types";
import { getCartItems } from "../../lib/api-repository";
import { FloatingHelpButton } from "./FloatingHelpButton";
import { Sidebar } from "./Sidebar";
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
      const res = await apiFetch("orders/my");
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
        className="fixed left-0 top-0 z-40 hidden h-dvh overflow-hidden transition-[width] duration-200 ease-out md:block"
        style={{ width: desktopOffset }}
        aria-label="側邊導覽"
      >
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          cartBadge={liveCartBadge}
          ordersBadge={liveOrdersBadge}
        />
      </aside>

      {mobileSidebarOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] md:hidden"
            aria-label="關閉選單"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 h-dvh shadow-lg md:hidden" style={{ width: SIDEBAR_WIDTH_EXPANDED }}>
            <Sidebar
              collapsed={false}
              onToggleCollapsed={toggleCollapsed}
              cartBadge={liveCartBadge}
              ordersBadge={liveOrdersBadge}
              onNavigate={() => setMobileSidebarOpen(false)}
              forceExpanded
            />
          </aside>
        </>
      ) : null}

      <div
        className="flex min-h-dvh flex-col pl-0 transition-[padding-left] duration-200 ease-out md:pl-[var(--sidebar-offset)]"
        style={shellStyle}
      >
        <Suspense fallback={<TopbarFallback />}>
          <Topbar cartBadge={liveCartBadge} onMenuClick={() => setMobileSidebarOpen(true)} />
        </Suspense>
        <main className="flex-1 px-4 pb-3 pt-1.5 sm:px-6 md:px-8 md:pb-4 md:pt-2">{children}</main>
      </div>

      <FloatingHelpButton />
    </div>
  );
}
