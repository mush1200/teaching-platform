"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { ReviewItem } from "../../../../components/reviews/ReviewItem";
import { RatingSummary } from "../../../../components/reviews/RatingSummary";
import { Button } from "../../../../components/ui/Button";
import { getMaterialById, getReviewsForMaterial } from "../../../../lib/edu-api-mock";
import type { MockMaterial, MockReview } from "../../../../lib/mock-data";

export default function MaterialReviewsPage() {
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
          <Button type="button" variant="secondary" className="!px-3 !py-2 !text-xs">
            寫評論
          </Button>
        }
      />

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-12 sm:px-6">
        {loading ? <p className="text-center text-sm text-[#6B7280]">載入中…</p> : null}
        {!loading && !material ? (
          <p className="text-center text-sm text-[#6B7280]">找不到教材</p>
        ) : null}
        {!loading && material ? (
          <>
            <div className="flex gap-4 rounded-3xl border border-[#E5E7EB]/80 bg-white p-4 shadow-sm">
              <div className={`h-20 w-20 shrink-0 rounded-2xl bg-gradient-to-br ${material.coverGradient}`} />
              <div>
                <h1 className="font-bold text-[#1F2937]">{material.title}</h1>
                <p className="mt-1 text-xs text-emerald-700">{material.ageLabel}</p>
                <p className="mt-2 text-sm text-amber-500">★ {material.rating.toFixed(1)}</p>
              </div>
            </div>
            <RatingSummary average={avg} reviewCount={count} />
            <div className="space-y-3">
              {reviews.map((rev) => (
                <ReviewItem key={rev.id} review={rev} />
              ))}
              {reviews.length === 0 ? (
                <p className="text-center text-sm text-[#6B7280]">尚無評論（mock 可於 lib/mock-data 擴充）。</p>
              ) : null}
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
