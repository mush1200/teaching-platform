"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { ExplorePage } from "../../components/parent/ExplorePage";
import { Button } from "../../components/ui/Button";
import { getStoredRole } from "../../lib/api-client";

export default function MaterialsPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState<"parent" | "teacher" | "creator" | "admin" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setRole(getStoredRole());
  }, []);

  const redirectParent = useCallback(() => {
    router.replace("/explore");
  }, [router]);

  useEffect(() => {
    if (!hydrated || role !== "parent") return;
    redirectParent();
  }, [hydrated, role, redirectParent]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-[#6B7280]">載入中…</div>
    );
  }

  if (role === "teacher" || role === "creator") {
    return (
      <AppShell>
        <MobileHeader title="EduMarket" onMenuClick={() => setMenuOpen(true)} />
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <h1 className="text-xl font-bold text-[#1F2937]">創作者工作台入口</h1>
          <p className="mt-2 text-sm text-[#6B7280]">公開教材列表提供購買者瀏覽，請前往創作者工作台管理你的內容。</p>
          <Link href="/creator/materials" className="mt-6 inline-block">
            <Button type="button" intent="flow">
              前往創作者工作台
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  if (role === "parent") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-[#6B7280]">
        正在前往探索教材…
      </div>
    );
  }

  return (
    <AppShell withBottomNav>
      <MobileHeader title="EduMarket" onMenuClick={() => setMenuOpen(true)} />
      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30"
            aria-label="關閉側邊欄"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 h-dvh w-[78%] max-w-[320px] border-r border-[#E5E7EB] bg-white p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-lg font-bold text-[#1F2937]">EduMarket</p>
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-sm text-[#6B7280] hover:bg-[#F4F1FF]"
                onClick={() => setMenuOpen(false)}
              >
                關閉
              </button>
            </div>
            <nav className="space-y-2 text-sm" aria-label="行動版側邊欄">
              <Link href="/materials" className="block rounded-2xl px-3 py-2 font-medium text-[#1F2937] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                教材列表
              </Link>
              <Link href="/my-reviews" className="block rounded-2xl px-3 py-2 font-medium text-[#1F2937] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                我的學習
              </Link>
              <Link href="/cart" className="block rounded-2xl px-3 py-2 font-medium text-[#1F2937] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                購物車
              </Link>
              <Link href="/me/orders" className="block rounded-2xl px-3 py-2 font-medium text-[#1F2937] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                我的訂單
              </Link>
              <Link href="/login" className="block rounded-2xl px-3 py-2 font-medium text-[#6C63FF] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                登入 / 帳號
              </Link>
            </nav>
          </aside>
        </>
      ) : null}
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-4 sm:px-6">
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-[#6B7280]">載入中…</div>}
        >
          <ExplorePage />
        </Suspense>
      </div>
    </AppShell>
  );
}
