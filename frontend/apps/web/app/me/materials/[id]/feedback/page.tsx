"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import { AppShell } from "../../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../../components/layout/MobileHeader";
import { Button } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";
import { IconStar } from "../../../../../components/ui/icons";
import type { MyLibraryResponse } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";
import { getMaterialById } from "../../../../../lib/api-repository";
import type { MockMaterial } from "../../../../../lib/view-models";

export default function ShareTeachingFeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const materialId = String(params.id ?? "");
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [owned, setOwned] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!materialId) return;
    setLoading(true);
    setError(null);
    try {
      const [materialRow, libraryRes] = await Promise.all([getMaterialById(materialId), apiFetch("me/materials")]);
      setMaterial(materialRow);
      if (!libraryRes.ok) {
        setOwned(false);
        setError(await parseApiErrorMessage(libraryRes));
        return;
      }
      const data = (await libraryRes.json()) as MyLibraryResponse;
      const hasMaterial = (data.items ?? []).some((item) => item.materialId === materialId);
      setOwned(hasMaterial);
    } catch {
      setOwned(false);
      setError("無法驗證教材狀態，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitFeedback = useCallback(async () => {
    if (!materialId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await apiFetch("reviews", {
        method: "POST",
        body: JSON.stringify({
          material_id: materialId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setComment("");
      setMessage("教學回饋已送出，感謝你的分享。");
    } catch {
      setMessage("連線失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }, [comment, materialId, rating]);

  return (
    <AppShell>
      <MobileHeader title="分享教學回饋" backHref="/me/materials" right="none" />
      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 sm:px-6">
        {loading ? <LoadingState title="載入中…" /> : null}
        {!loading && error ? <ErrorState title="無法開啟頁面" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && !material ? (
          <EmptyState title="找不到教材" description="請返回我的教材重新選擇。" actionLabel="返回我的教材" onAction={() => router.push("/me/materials")} />
        ) : null}
        {!loading && !error && material && owned === false ? (
          <EmptyState
            title="尚未購買此教材"
            description="僅能為已購買教材分享教學回饋。"
            actionLabel="返回我的教材"
            onAction={() => router.push("/me/materials")}
          />
        ) : null}
        {!loading && !error && material && owned ? (
          <Card level="elevated" padding="md">
            <h1 className="text-xl font-bold text-[#1F2937]">分享你的教學回饋</h1>
            <p className="mt-1 text-sm text-[#6B7280]">你的使用經驗能幫助其他使用者選擇適合教材。</p>
            <p className="mt-4 text-sm font-medium text-[#4B5563]">教材：{material.title}</p>

            <div className="mt-4">
              <p className="text-sm font-medium text-[#1F2937]">星級評分</p>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const star = idx + 1;
                  return (
                    <button
                      key={star}
                      type="button"
                      className={`rounded-lg p-1.5 ${star <= rating ? "text-amber-400" : "text-[#D1D5DB]"} hover:bg-amber-50`}
                      onClick={() => setRating(star)}
                      aria-label={`選擇 ${star} 星`}
                    >
                      <IconStar className="size-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="feedback-comment" className="text-sm font-medium text-[#1F2937]">
                教學回饋
              </label>
              <textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="分享課堂情境、教材效果或使用建議（選填）"
                rows={4}
                disabled={submitting}
                className="mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#374151] focus:border-[#6C63FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button type="button" intent="flow" disabled={submitting} onClick={() => void submitFeedback()}>
                {submitting ? "送出中…" : "送出教學回饋"}
              </Button>
              <Link href={`/materials/${materialId}/reviews`}>
                <Button type="button" variant="outline">
                  查看全部回饋
                </Button>
              </Link>
            </div>
            {message ? <p className="mt-3 text-sm text-[#4B5563]">{message}</p> : null}
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
