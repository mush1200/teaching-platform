"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getStoredToken } from "../../lib/api-client";
import type { OrdersListResponse } from "../../lib/api-types";
import { getCartItems } from "../../lib/edu-api-mock";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type Props = {
  children: ReactNode;
  cartBadge?: number;
  ordersBadge?: number;
};

function TopbarFallback() {
  return <div className="h-14 w-full shrink-0 border-b border-[#E5E7EB]/80 bg-white/95" aria-hidden />;
}

export function ParentAppShell({ children, cartBadge = 0, ordersBadge = 0 }: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [liveCartBadge, setLiveCartBadge] = useState(cartBadge);
  const [liveOrdersBadge, setLiveOrdersBadge] = useState(ordersBadge);
  const pathname = usePathname();

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
    <div className="min-h-dvh bg-[#F4F1FF] font-sans text-[#1F2937] antialiased">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-[240px] md:block">
        <Sidebar cartBadge={liveCartBadge} ordersBadge={liveOrdersBadge} />
      </aside>

      {/* Mobile drawer */}
      {mobileSidebarOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="關閉選單"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 h-dvh w-[240px] shadow-2xl md:hidden">
            <Sidebar
              cartBadge={liveCartBadge}
              ordersBadge={liveOrdersBadge}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-h-dvh flex-col md:pl-[240px]">
        <Suspense fallback={<TopbarFallback />}>
          <Topbar cartBadge={liveCartBadge} onMenuClick={() => setMobileSidebarOpen(true)} />
        </Suspense>
        <main className="flex-1 px-4 py-3 sm:px-6 md:px-8 md:py-4">{children}</main>
      </div>
    </div>
  );
}
