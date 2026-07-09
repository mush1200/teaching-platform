"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@teaching-platform/ui";
import { apiFetch } from "../../lib/api-client";
import { FAVORITES_UPDATED_EVENT } from "../../lib/favorites-storage";
import type { MockMaterial } from "../../lib/view-models";
import { MaterialGrid } from "../../components/parent/MaterialGrid";
import { materialToMock } from "../../lib/material-mapper";
import type { Material, MaterialRatingStats } from "../../lib/api-types";

export default function FavoritesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MockMaterial[]>([]);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("me/favorites");
      if (!res.ok) {
        setItems([]);
        return;
      }
      const payload = (await res.json()) as { items?: Material[] };
      const materials = Array.isArray(payload.items) ? payload.items : [];
      const rows = await Promise.all(
        materials.map(async (material) => {
          const mapped = materialToMock(material);
          try {
            const ratingRes = await apiFetch(`materials/${encodeURIComponent(material.id)}/rating`);
            if (ratingRes.ok) {
              const stats = (await ratingRes.json()) as MaterialRatingStats;
              mapped.rating = stats.average ?? 0;
              mapped.reviewCount = stats.count ?? 0;
            }
          } catch {
            /* ignore */
          }
          return mapped;
        }),
      );
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    const onUpdated = () => {
      void loadFavorites();
    };
    window.addEventListener(FAVORITES_UPDATED_EVENT, onUpdated);
    window.addEventListener("focus", onUpdated);
    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, onUpdated);
      window.removeEventListener("focus", onUpdated);
    };
  }, [loadFavorites]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 py-1">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#1F2937]">收藏清單</h1>
        <p className="text-sm text-[#6B7280]">你收藏的教材都在這裡，可快速回看或直接進入教材詳情。</p>
      </div>

      {loading ? <p className="text-sm text-[#6B7280]">載入收藏中…</p> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          title="目前沒有收藏教材"
          description="到探索教材頁點擊右上角愛心，即可加入收藏清單。"
          actionLabel="前往探索教材"
          onAction={() => {
            window.location.href = "/explore";
          }}
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#374151]">共 {items.length} 筆收藏</p>
            <Link href="/explore" className="text-sm font-semibold text-[#6C63FF] hover:underline">
              繼續探索
            </Link>
          </div>
          <MaterialGrid materials={items} trackRecent />
        </>
      ) : null}
    </section>
  );
}
