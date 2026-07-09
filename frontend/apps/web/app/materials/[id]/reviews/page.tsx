"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@teaching-platform/ui";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { ReviewItem } from "../../../../components/reviews/ReviewItem";
import { RatingSummary } from "../../../../components/reviews/RatingSummary";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { getMaterialById, getReviewsForMaterial } from "../../../../lib/api-repository";
import { apiFetch } from "../../../../lib/api-client";
import type { MaterialRatingDistribution } from "../../../../lib/api-types";
import type { MockMaterial, MockReview } from "../../../../lib/view-models";

export default function MaterialReviewsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? "");
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [distribution, setDistribution] = useState<MaterialRatingDistribution | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r, dRes] = await Promise.all([
      getMaterialById(id),
      getReviewsForMaterial(id),
      apiFetch(`materials/${encodeURIComponent(id)}/rating-distribution`),
    ]);
    setMaterial(m);
    setReviews(r);
    if (dRes.ok) {
      setDistribution((await dRes.json()) as MaterialRatingDistribution);
    } else {
      setDistribution(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const avg = material?.rating ?? 0;
  const count = material?.reviewCount ?? reviews.length;

  return (
    <AppShell>
      <MobileHeader
        title="全部教學回饋"
        backHref={id ? `/materials/${id}` : "/materials"}
        right="none"
        trailing={
          <Link href={id ? `/materials/${id}` : "/materials"}>
            <Button type="button" intent="action" className="!px-3 !text-xs">
              前往教材
            </Button>
          </Link>
        }
      />

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-12 sm:px-6">
        {loading ? <LoadingState title="教學回饋載入中…" /> : null}
        {!loading && !material ? (
          <EmptyState title="找不到教材" description="請確認網址是否正確，或返回教材列表。" actionLabel="返回列表" onAction={() => router.push("/materials")} />
        ) : null}
        {!loading && material ? (
          <>
            <Card level="default" padding="md">
              <div className="flex gap-4">
                <div className={`h-20 w-20 shrink-0 rounded-[var(--radius-card-flat)] bg-gradient-to-br shadow-sm ${material.coverGradient}`}>
                  {material.coverImageUrl ? (
                    <img src={material.coverImageUrl} alt="" className="h-full w-full rounded-[var(--radius-card-flat)] object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h1 className="font-bold text-[#1F2937]">{material.title}</h1>
                  <p className="mt-1 text-xs text-emerald-700">{material.ageLabel}</p>
                  <p className="mt-2 text-sm font-semibold text-amber-500">
                    {count > 0 ? <>平均 ★ {avg.toFixed(1)}</> : <>尚無評分</>}
                  </p>
                </div>
              </div>
            </Card>
            <RatingSummary average={count > 0 ? avg : 0} reviewCount={count} distribution={distribution} />

            <Card level="flat" padding="md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#4B5563]">共 {count} 則教學回饋</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled
                    className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs text-[#9CA3AF]"
                    title="預留未來：最新排序"
                  >
                    最新排序（即將推出）
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs text-[#9CA3AF]"
                    title="預留未來：最高評分篩選"
                  >
                    篩選（即將推出）
                  </button>
                </div>
              </div>
            </Card>

            <div className="space-y-3">
              {reviews.map((rev) => (
                <ReviewItem key={rev.id} review={rev} />
              ))}
              {reviews.length === 0 ? (
                <EmptyState
                  title="尚無教學回饋"
                  description="購買並完成付款審核後，可至「我的教材」分享第一則教學回饋。"
                  actionLabel="返回教材"
                  onAction={() => router.push(`/materials/${material.id}`)}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
