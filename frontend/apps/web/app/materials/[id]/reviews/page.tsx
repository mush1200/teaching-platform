"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@teaching-platform/ui";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { ReviewItem } from "../../../../components/reviews/ReviewItem";
import { RatingSummary } from "../../../../components/reviews/RatingSummary";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { getMaterialById, getReviewsForMaterial } from "../../../../lib/edu-api-mock";
import type { MockMaterial, MockReview } from "../../../../lib/mock-data";

export default function MaterialReviewsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? "");
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const [m, r] = await Promise.all([getMaterialById(id), getReviewsForMaterial(id)]);
      if (!c) {
        setMaterial(m);
        setReviews(r);
        setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id]);

  const avg = material?.rating ?? 4.8;
  const count = material?.reviewCount ?? reviews.length;

  return (
    <AppShell>
      <MobileHeader
        title="課程評論"
        backHref={id ? `/materials/${id}` : "/materials"}
        right="none"
        trailing={
          <Link href={id ? `/materials/${id}` : "/materials"}>
            <Button type="button" intent="action" className="!px-3 !py-2 !text-xs">
              前往教材
            </Button>
          </Link>
        }
      />

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-12 sm:px-6">
        {loading ? (
          <LoadingState title="評論載入中…" />
        ) : null}
        {!loading && !material ? (
          <EmptyState title="找不到教材" description="請確認網址是否正確，或返回教材列表。" actionLabel="返回列表" onAction={() => router.push("/materials")} />
        ) : null}
        {!loading && material ? (
          <>
            <Card level="default" padding="md">
              <div className="flex gap-4">
                <div className={`h-20 w-20 shrink-0 rounded-[var(--radius-card-flat)] bg-gradient-to-br shadow-sm ${material.coverGradient}`} />
                <div className="min-w-0">
                  <h1 className="font-bold text-[#1F2937]">{material.title}</h1>
                  <p className="mt-1 text-xs text-emerald-700">{material.ageLabel}</p>
                  <p className="mt-2 text-sm font-semibold text-amber-500">平均 ★ {material.rating.toFixed(1)}</p>
                </div>
              </div>
            </Card>
            <RatingSummary average={avg} reviewCount={count} />
            <div className="space-y-3">
              {reviews.map((rev) => (
                <ReviewItem key={rev.id} review={rev} />
              ))}
              {reviews.length === 0 ? (
                <EmptyState
                  title="尚無評論"
                  description="成為第一位留下心得的使用者（mock 資料可於 lib/mock-data 擴充）。"
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
