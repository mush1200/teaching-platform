"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState } from "@teaching-platform/ui";
import type { ListMaterialsResult, MaterialsSort } from "../../lib/materials-query";
import { listMaterials } from "../../lib/materials-query";
import { Card } from "../ui/Card";
import { CategoryChips } from "./CategoryChips";
import { FilterBar } from "./FilterBar";
import type { PriceMode } from "./PriceFilter";
import { MaterialGrid } from "./MaterialGrid";
import { PaginationBar } from "./PaginationBar";
import { SearchBar } from "./SearchBar";
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
  const [searchDraft, setSearchDraft] = useState("");

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
    setSearchDraft(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const cur = searchParams.get("search") ?? "";
      if (searchDraft === cur) return;
      pushQuery({ search: searchDraft.trim() || null, page: "1" });
    }, 400);
    return () => window.clearTimeout(id);
  }, [searchDraft, pushQuery, searchParams]);

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
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[#1F2937]">探索教材</h1>
        <p className="text-sm text-[#6B7280]">搜尋、篩選並瀏覽完整教材清單</p>
      </header>

      <section aria-label="搜尋與分類">
        <Card level="flat" padding="md" className="max-w-2xl border-[#E5E7EB]/80">
          <SearchBar value={searchDraft} onChange={setSearchDraft} />
        </Card>
        <div className="mt-4">
          <CategoryChips
            activeId={activeCategory}
            onSelect={(id) => {
              pushQuery({
                category: id === "all" ? null : id,
                page: "1",
              });
            }}
          />
        </div>
      </section>

      <FilterBar
        age={age}
        onAgeChange={(v) =>
          pushQuery({
            age: v || null,
            page: "1",
          })
        }
        priceMode={priceMode}
        onPriceModeChange={(mode) => {
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
        onPriceMinChange={(v) => pushQuery({ price_min: v || null, price_max: priceMaxStr || null, page: "1" })}
        onPriceMaxChange={(v) =>
          pushQuery({ price_min: priceMinStr || null, price_max: v || null, page: "1" })
        }
        minRating4={minRating4}
        onMinRating4Change={(on) => pushQuery({ rating: on ? "4" : null, page: "1" })}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SortDropdown value={sort} onChange={(v) => pushQuery({ sort: v, page: "1" })} />
        {loading ? <span className="text-sm text-[#6B7280]">載入中…</span> : null}
      </div>

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
    </div>
  );
}
