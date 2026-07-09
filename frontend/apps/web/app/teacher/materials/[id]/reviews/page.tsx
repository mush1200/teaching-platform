"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, SurfaceCard } from "@teaching-platform/ui";
import type { Material, MaterialsListResponse, Review, UserRole } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";

type MeResponse = {
  user?: {
    id?: string;
    role?: UserRole;
  };
};

export default function CreatorMaterialReviewsPage() {
  const params = useParams();
  const materialId = String(params.id ?? "");
  const [material, setMaterial] = useState<Material | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    return total / reviews.length;
  }, [reviews]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, materialsRes] = await Promise.all([apiFetch("auth/me"), apiFetch("materials")]);
      if (!meRes.ok) {
        setError(await parseApiErrorMessage(meRes));
        setMaterial(null);
        setReviews([]);
        return;
      }
      if (!materialsRes.ok) {
        setError(await parseApiErrorMessage(materialsRes));
        setMaterial(null);
        setReviews([]);
        return;
      }

      const mePayload = (await meRes.json()) as MeResponse;
      const role = mePayload.user?.role ?? null;
      const meId = mePayload.user?.id ?? null;
      const materialsPayload = (await materialsRes.json()) as MaterialsListResponse;
      const allMaterials = materialsPayload.items ?? [];
      const target = allMaterials.find((item) => item.id === materialId) ?? null;

      if (!target) {
        setError("找不到指定教材。");
        setMaterial(null);
        setReviews([]);
        return;
      }

      if ((role === "teacher" || role === "creator") && target.teacher_id !== meId) {
        setError("你沒有權限查看此教材的教學回饋。");
        setMaterial(null);
        setReviews([]);
        return;
      }

      setMaterial(target);

      const reviewsRes = await apiFetch(`materials/${encodeURIComponent(materialId)}/reviews`);
      if (!reviewsRes.ok) {
        setError(await parseApiErrorMessage(reviewsRes));
        setReviews([]);
        return;
      }
      const reviewsPayload = (await reviewsRes.json()) as Review[];
      setReviews(Array.isArray(reviewsPayload) ? reviewsPayload : []);
    } catch {
      setError("無法連線至伺服器，請稍後再試。");
      setMaterial(null);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">教材教學回饋</h1>
          <p className="text-sm text-slate-600">查看這份教材的使用者教學回饋內容與分數概況。</p>
        </div>
        <Link href="/creator/materials">
          <Button variant="secondary">返回教材列表</Button>
        </Link>
      </div>

      {loading ? <LoadingState title="載入教材教學回饋中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}

      {!loading && !error && material ? (
        <SurfaceCard
          title={material.title}
          description={
            averageRating === null
              ? "目前尚無教學回饋"
              : `共 ${reviews.length} 則教學回饋，平均 ${averageRating.toFixed(1)} / 5`
          }
        >
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <EmptyState title="尚無教學回饋" description="當使用者提交教學回饋後，這裡會顯示最新回饋內容。" />
            ) : (
              reviews.map((review) => (
                <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">評分：{review.rating} / 5</p>
                    {review.created_at ? <p className="text-xs text-slate-500">{review.created_at}</p> : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{review.comment?.trim() || "（無文字教學回饋）"}</p>
                </article>
              ))
            )}
          </div>
        </SurfaceCard>
      ) : null}
    </section>
  );
}
