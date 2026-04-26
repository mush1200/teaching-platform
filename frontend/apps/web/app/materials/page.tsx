"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { MaterialCard } from "../../components/materials/MaterialCard";
import { MaterialHero } from "../../components/materials/MaterialHero";
import { CategoryIcon } from "../../components/materials/CategoryIcon";
import { Button } from "../../components/ui/Button";
import { getMaterials } from "../../lib/edu-api-mock";
import { mockCategoryRow } from "../../lib/mock-data";
import type { MockMaterial } from "../../lib/mock-data";
import { getStoredRole } from "../../lib/api-client";

export default function MaterialsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState<"parent" | "teacher" | "admin" | null>(null);
  const [items, setItems] = useState<MockMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getMaterials();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    setHydrated(true);
    setRole(getStoredRole());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (role === "teacher") {
      setItems([]);
      setLoading(false);
      return;
    }
    void load();
  }, [hydrated, role, load]);

  const filtered = useMemo(() => {
    if (cat === "all" || cat === "more") return items;
    return items.filter((m) => m.category === cat);
  }, [items, cat]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-[#6B7280]">載入中…</div>
    );
  }

  if (role === "teacher") {
    return (
      <AppShell>
        <MobileHeader title="EduMarket" onMenuClick={() => setMenuOpen(true)} />
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <h1 className="text-xl font-bold text-[#1F2937]">教師角色</h1>
          <p className="mt-2 text-sm text-[#6B7280]">公開教材列表僅供家長瀏覽，請前往教師後台管理教材。</p>
          <Link href="/teacher/materials" className="mt-6 inline-block">
            <Button type="button">前往教師教材</Button>
          </Link>
        </div>
      </AppShell>
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
              <Link href="/orders" className="block rounded-2xl px-3 py-2 font-medium text-[#1F2937] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                我的訂單
              </Link>
              <Link href="/login" className="block rounded-2xl px-3 py-2 font-medium text-[#6C63FF] hover:bg-[#F4F1FF]" onClick={() => setMenuOpen(false)}>
                登入 / 帳號
              </Link>
            </nav>
          </aside>
        </>
      ) : null}
      <main className="mx-auto max-w-[1440px] px-4 pb-8 pt-4 sm:px-6">
        <MaterialHero
          onExplore={() => {
            document.getElementById("edu-materials-grid")?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <section id="edu-categories" className="mt-8">
          <h2 className="sr-only">分類</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-2 pt-1">
            {mockCategoryRow.map((c) => (
              <CategoryIcon
                key={c.id}
                label={c.label}
                emoji={c.emoji}
                active={cat === c.id}
                onClick={() => setCat(c.id)}
              />
            ))}
          </div>
        </section>

        <section id="edu-materials-grid" className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-2">
            <h2 className="text-lg font-bold text-[#1F2937]">精選教材</h2>
            {loading ? <span className="text-xs text-[#6B7280]">載入中…</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((m) => (
              <MaterialCard key={m.id} material={m} />
            ))}
          </div>
          {!loading && filtered.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[#6B7280]">此分類暫無教材（mock）。</p>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
