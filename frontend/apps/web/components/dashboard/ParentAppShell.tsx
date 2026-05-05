"use client";

import type { ReactNode } from "react";
import { Suspense, useState } from "react";
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

export function ParentAppShell({ children, cartBadge = 2, ordersBadge = 1 }: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#F4F1FF] font-sans text-[#1F2937] antialiased">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-[240px] md:block">
        <Sidebar cartBadge={cartBadge} ordersBadge={ordersBadge} />
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
              cartBadge={cartBadge}
              ordersBadge={ordersBadge}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-h-dvh flex-col md:pl-[240px]">
        <Suspense fallback={<TopbarFallback />}>
          <Topbar cartBadge={cartBadge} onMenuClick={() => setMobileSidebarOpen(true)} />
        </Suspense>
        <main className="flex-1 px-4 py-3 sm:px-6 md:px-8 md:py-4">{children}</main>
      </div>
    </div>
  );
}
