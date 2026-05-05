"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@teaching-platform/ui";
import { getMaterialById } from "../../lib/edu-api-mock";
import { FAVORITES_UPDATED_EVENT, readFavoriteMaterialIds } from "../../lib/favorites-storage";
import type { MockMaterial } from "../../lib/mock-data";
import { MaterialGrid } from "../../components/parent/MaterialGrid";

export default function FavoritesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MockMaterial[]>([]);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    const ids = readFavoriteMaterialIds();
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await Promise.all(ids.map((id) => getMaterialById(id)));
      const sorted = rows.filter((row): row is MockMaterial => row !== null);
      setItems(sorted);
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
