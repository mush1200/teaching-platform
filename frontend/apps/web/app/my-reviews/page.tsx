"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import Link from "next/link";
import type { Material, MaterialsListResponse, Review } from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";

export default function MyReviewsPage() {
  const [items, setItems] = useState<Review[]>([]);
  const [materialMap, setMaterialMap] = useState<Record<string, Material>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewsRes, materialsRes] = await Promise.all([apiFetch("me/reviews"), apiFetch("materials")]);
      if (!reviewsRes.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(reviewsRes));
        return;
      }
      const data = (await reviewsRes.json()) as Review[];
      setItems(Array.isArray(data) ? data : []);

      if (materialsRes.ok) {
        const materialsData = (await materialsRes.json()) as MaterialsListResponse;
        const map: Record<string, Material> = {};
        for (const material of materialsData.items ?? []) {
          map[material.id] = material;
        }
        setMaterialMap(map);
      } else {
        setMaterialMap({});
      }
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">我的評價</h1>
      <p className="text-sm text-slate-600">
        以下為您在平台上提交的評價紀錄（與教材詳情頁的評論為同一資料來源）。
      </p>

      {loading ? <LoadingState title="載入評價中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="尚無評價" description="前往教材詳情頁即可為已購買的教材留下星等與評論。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((r) => (
            <article key={r.id} className="space-y-2 rounded-[var(--radius-card-default)] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card-default)]">
              {r.material_id ? (
                <Link href={`/materials/${encodeURIComponent(r.material_id)}`} className="block">
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-indigo-200 to-violet-100" aria-hidden />
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                        {materialMap[r.material_id]?.title ?? `教材 ${r.material_id}`}
                      </p>
                      <p className="text-xs text-slate-500">點擊查看教材</p>
                    </div>
                  </div>
                </Link>
              ) : null}
              <p className="text-sm font-semibold text-slate-900">評分：{r.rating} / 5</p>
              {r.comment ? <p className="text-sm text-slate-700">{r.comment}</p> : <p className="text-sm text-slate-500">（無文字）</p>}
              {r.created_at ? (
                <p className="text-xs text-slate-500">{r.created_at}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
