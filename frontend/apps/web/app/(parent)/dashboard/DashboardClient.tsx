"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CategoryTabs } from "../../../components/dashboard/CategoryTabs";
import { HeroExplore } from "../../../components/dashboard/HeroExplore";
import { ProductCard } from "../../../components/dashboard/ProductCard";
import { mockCategoryRow, mockMaterials } from "../../../lib/mock-data";

const categoryTabs = mockCategoryRow.map((c) => (c.id === "more" ? { ...c, label: "更多分類" } : c));

export function DashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const cat = searchParams.get("cat") ?? "all";

  const filtered = useMemo(() => {
    let list = [...mockMaterials];
    if (cat && cat !== "all" && cat !== "more") {
      list = list.filter((m) => m.category === cat);
    }
    if (q) {
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.ageLabel.toLowerCase().includes(q),
      );
    }
    return list;
  }, [cat, q]);

  function setCategory(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") params.delete("cat");
    else params.set("cat", id);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function scrollToFeatured() {
    document.getElementById("featured")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 md:space-y-10">
      <HeroExplore onExplore={scrollToFeatured} />
      <CategoryTabs tabs={categoryTabs} activeId={cat} onSelect={setCategory} />
      <section id="featured" className="scroll-mt-28">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold text-[#1F2937] md:text-xl">精選教材</h2>
          <Link
            href="/materials"
            className="text-sm font-semibold text-[#6C63FF] transition hover:text-[#5548d9] hover:underline"
          >
            查看全部 →
          </Link>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-[#E5E7EB]/80 bg-white p-12 text-center shadow-[0_10px_40px_rgba(15,23,42,0.04)]">
            <p className="text-[#6B7280]">找不到符合條件的教材，請試試其他分類或關鍵字。</p>
            <Link href="/materials" className="mt-4 inline-block text-sm font-semibold text-[#6C63FF] hover:underline">
              前往探索教材
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((m) => (
                <ProductCard key={m.id} material={m} />
              ))}
            </div>
            <div className="mt-10 flex justify-center gap-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`size-2 rounded-full ${i === 0 ? "bg-[#6C63FF]" : "bg-[#D1D5DB]"}`}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
