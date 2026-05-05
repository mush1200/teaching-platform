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
import { apiFetch, getStoredRole, parseApiErrorMessage } from "../../../../lib/api-client";
import type { UserRole } from "../../../../lib/api-types";
import { getMaterialById, getReviewsForMaterial } from "../../../../lib/edu-api-mock";
import type { MockMaterial, MockReview } from "../../../../lib/mock-data";

export default function MaterialReviewsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? "");
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r] = await Promise.all([getMaterialById(id), getReviewsForMaterial(id)]);
    setMaterial(m);
    setReviews(r);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setRole(getStoredRole());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = useCallback(async () => {
    if (!id) return;
    setSubmitting(true);
    setFormMessage(null);
    try {
      const res = await apiFetch("reviews", {
        method: "POST",
        body: JSON.stringify({
          material_id: id,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setFormMessage(await parseApiErrorMessage(res));
        return;
      }
      setComment("");
      setFormMessage("評價已送出，感謝你的回饋！");
      await load();
    } catch {
      setFormMessage("連線失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }, [id, rating, comment, load]);

  const avg = material?.rating ?? 0;
  const count = material?.reviewCount ?? reviews.length;

  return (
    <AppShell>
      <MobileHeader
        title="課程評論"
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
        {loading ? <LoadingState title="評論載入中…" /> : null}
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
            <RatingSummary average={count > 0 ? avg : 0} reviewCount={count} />

            {role === "parent" ? (
              <Card level="elevated" padding="md">
                <p className="text-sm font-semibold text-[#1F2937]">撰寫評價</p>
                <p className="mt-1 text-xs text-[#6B7280]">僅限已通過審核付款、持有此教材的家長；每位家長每份教材限留一則。</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="review-rating" className="text-sm text-[#4B5563]">
                    星等
                  </label>
                  <select
                    id="review-rating"
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    disabled={submitting}
                    className="rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-sm"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} 星
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="心得（選填）"
                  rows={3}
                  disabled={submitting}
                  className="mt-3 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/30"
                />
                <div className="mt-3">
                  <Button type="button" intent="flow" disabled={submitting} onClick={() => void submitReview()}>
                    {submitting ? "送出中…" : "送出評價"}
                  </Button>
                </div>
                {formMessage ? <p className="mt-2 text-sm text-[#4B5563]">{formMessage}</p> : null}
              </Card>
            ) : !role ? (
              <p className="text-sm text-[#6B7280]">
                若要發表評價，請先{" "}
                <Link href={`/login?redirect=${encodeURIComponent(`/materials/${id}/reviews`)}`} className="font-medium text-[#6C63FF] underline">
                  登入家長帳號
                </Link>
                。
              </p>
            ) : (
              <p className="text-sm text-[#6B7280]">撰寫評價僅限家長帳號；教師與管理員請使用工作台相關功能。</p>
            )}

            <div className="space-y-3">
              {reviews.map((rev) => (
                <ReviewItem key={rev.id} review={rev} />
              ))}
              {reviews.length === 0 ? (
                <EmptyState
                  title="尚無評論"
                  description="購買並完成付款審核後，即可留下第一則評價。"
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
