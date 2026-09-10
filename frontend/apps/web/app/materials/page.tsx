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
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-ds-textMuted">載入中…</div>
    );
  }

  if (role === "teacher" || role === "creator") {
    return (
      <AppShell>
        <MobileHeader title="EduMarket" onMenuClick={() => setMenuOpen(true)} />
        <div className="mx-auto max-w-lg px-page-mobile sm:px-page-tablet lg:px-page-desktop py-12 text-center">
          <h1 className="text-h2 text-[#1F2937]">創作者工作台入口</h1>
          <p className="mt-2 text-sm text-ds-textMuted">公開教材列表提供購買者瀏覽，請前往創作者工作台管理你的內容。</p>
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
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-ds-textMuted">
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
                className="rounded-xl px-2 py-1 text-sm text-ds-textMuted hover:bg-[#F4F1FF]"
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
              <Link href="/login" className="block rounded-2xl px-3 py-2 font-medium text-ds-textAccent hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                登入 / 帳號
              </Link>
            </nav>
          </aside>
        </>
      ) : null}
      <div className="mx-auto max-w-[1440px] pb-8 pt-4">
        {/*
          `UI-CONS-02` —— 這一頁原本**完全沒有** `<h1>`／`<h2>`（1440 與 375 皆實測為 0），
          公開教材列表因此在 accessibility tree 裡沒有頁面主題。

          用 `sr-only` 而不是可見標題：這一頁的視覺入口是分類列與篩選列，
          插入一個大標題會改變既有的 browse 版面 —— 而本輪是 zero-risk normalization。
          文案沿用本路由 `layout.tsx` 既有的 metadata title「教材列表」，不新造行銷文案。
        */}
        <h1 className="sr-only">教材列表</h1>
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-ds-textMuted">載入中…</div>}
        >
          <ExplorePage />
        </Suspense>
      </div>
    </AppShell>
  );
}
