"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState } from "@teaching-platform/ui";
import type { ListMaterialsResult, MaterialsSort } from "../../lib/materials-query";
import { listMaterials } from "../../lib/materials-query";
import { AgeFilter } from "./AgeFilter";
import { CategoryChips } from "./CategoryChips";
import type { PriceMode } from "./PriceFilter";
import { PriceFilter } from "./PriceFilter";
import { MaterialGrid } from "./MaterialGrid";
import { PaginationBar } from "./PaginationBar";
import { RatingFilter } from "./RatingFilter";
import { SortDropdown } from "./SortDropdown";

function parsePriceMode(sp: URLSearchParams): PriceMode {
  const pm = sp.get("price_min");
  const px = sp.get("price_max");
  if (pm === "0" && px === "0") return "free";
  if (pm === "1" && (px === null || px === "")) return "paid";
  if (pm != null || px != null) return "custom";
  return "any";
}

function buildListParams(sp: URLSearchParams): Parameters<typeof listMaterials>[0] {
  const search = sp.get("search")?.trim() ?? "";
  const category = sp.get("category") ?? "all";
  const age = sp.get("age")?.trim() ?? "";
  const sortRaw = sp.get("sort");
  const sort: MaterialsSort =
    sortRaw === "latest" || sortRaw === "rating" || sortRaw === "popular" ? sortRaw : "popular";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20) || 20));
  const ratingRaw = sp.get("rating");
  const rating = ratingRaw != null && ratingRaw !== "" ? Number(ratingRaw) : undefined;

  let price_min: number | undefined;
  let price_max: number | undefined;
  const pmin = sp.get("price_min");
  const pmax = sp.get("price_max");
  if (pmin != null && pmin !== "") price_min = Number(pmin);
  if (pmax != null && pmax !== "") price_max = Number(pmax);

  return {
    search: search || undefined,
    category: category === "all" ? undefined : category,
    age: age || undefined,
    price_min: price_min !== undefined && !Number.isNaN(price_min) ? price_min : undefined,
    price_max: price_max !== undefined && !Number.isNaN(price_max) ? price_max : undefined,
    rating: rating !== undefined && !Number.isNaN(rating) ? rating : undefined,
    sort,
    page,
    limit,
  };
}

export function ExplorePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ListMaterialsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const listParams = useMemo(() => buildListParams(searchParams), [searchParams]);

  const pushQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await listMaterials(listParams);
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("無法載入教材列表，請稍後再試。");
          setData(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listParams]);

  const items = data?.items ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const page = data?.pagination.page ?? listParams?.page ?? 1;

  const activeCategory = searchParams.get("category") ?? "all";
  const sort = listParams?.sort ?? "popular";
  const age = searchParams.get("age") ?? "";
  const priceMode = parsePriceMode(searchParams);
  const priceMinStr = searchParams.get("price_min") ?? "";
  const priceMaxStr = searchParams.get("price_max") ?? "";
  const minRating4 = (searchParams.get("rating") ?? "") === "4";

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section aria-label="分類與控制列">
        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          <CategoryChips
            activeId={activeCategory}
            onSelect={(id) => {
              pushQuery({
                category: id === "all" ? null : id,
                page: "1",
              });
            }}
          />
          <div className="flex shrink-0 items-center gap-2">
            <SortDropdown compact value={sort} onChange={(v) => pushQuery({ sort: v, page: "1" })} />
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(true)}
              className="h-[42px] rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
            >
              篩選
            </button>
          </div>
        </div>
      </section>

      {loading ? <div className="text-sm text-[#6B7280]">載入中…</div> : null}

      {error ? (
        <ErrorState title="載入失敗" description={error} onRetry={() => router.refresh()} />
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <EmptyState
          title="找不到教材"
          description="試試調整關鍵字、分類或篩選條件。"
          actionLabel="清除篩選"
          onAction={clearFilters}
        />
      ) : null}

      {!error && (loading || items.length > 0) ? (
        <>
          <section id="edu-materials-grid" aria-label="教材列表">
            <MaterialGrid materials={items} trackRecent className={loading ? "opacity-60" : ""} />
          </section>
          {!loading && items.length > 0 ? (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              disabled={loading}
              onPrev={() => pushQuery({ page: String(Math.max(1, page - 1)) })}
              onNext={() => pushQuery({ page: String(Math.min(totalPages, page + 1)) })}
            />
          ) : null}
        </>
      ) : null}

      {showAdvancedFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1F2937]">進階篩選</h2>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="rounded-lg px-2 py-1 text-sm font-medium text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                關閉
              </button>
            </div>
            <div className="space-y-4">
              <AgeFilter
                value={age}
                onChange={(v) =>
                  pushQuery({
                    age: v || null,
                    page: "1",
                  })
                }
              />
              <PriceFilter
                mode={priceMode}
                onModeChange={(mode) => {
                  if (mode === "any") pushQuery({ price_min: null, price_max: null, page: "1" });
                  else if (mode === "free") pushQuery({ price_min: "0", price_max: "0", page: "1" });
                  else if (mode === "paid") pushQuery({ price_min: "1", price_max: null, page: "1" });
                  else if (mode === "custom") {
                    const has = searchParams.get("price_min") || searchParams.get("price_max");
                    if (!has) pushQuery({ price_min: "0", price_max: "500", page: "1" });
                  }
                }}
                priceMin={priceMode === "custom" ? priceMinStr : ""}
                priceMax={priceMode === "custom" ? priceMaxStr : ""}
                onPriceMinChange={(v) =>
                  pushQuery({ price_min: v || null, price_max: priceMaxStr || null, page: "1" })
                }
                onPriceMaxChange={(v) =>
                  pushQuery({ price_min: priceMinStr || null, price_max: v || null, page: "1" })
                }
              />
              <RatingFilter
                minRating4={minRating4}
                onChange={(on) => pushQuery({ rating: on ? "4" : null, page: "1" })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
