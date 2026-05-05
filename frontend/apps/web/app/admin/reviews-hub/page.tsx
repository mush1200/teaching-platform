"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import { ReviewItem } from "../../../components/reviews/ReviewItem";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import type { MockReview } from "../../../lib/mock-data";

type Row = {
  review: MockReview;
  materialTitle: string;
  createdAt: string;
};

function toMockReview(
  api: { id: string; rating: number; comment?: string | null; created_at?: string },
  idx: number,
  materialId: string,
): MockReview {
  const accents: MockReview["avatarAccent"][] = ["violet", "coral", "emerald", "amber"];
  return {
    id: api.id,
    materialId,
    userName: "家長",
    avatarAccent: accents[idx % accents.length] ?? "violet",
    rating: Number(api.rating) || 0,
    date: api.created_at
      ? new Date(api.created_at).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" })
      : "",
    content: (api.comment ?? "").trim() ? String(api.comment).trim() : "（無文字評論）",
    likes: 0,
  };
}

export default function AdminReviewsHubPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mRes = await apiFetch("admin/materials");
      if (!mRes.ok) {
        setRows([]);
        setError(await parseApiErrorMessage(mRes));
        return;
      }
      const payload = (await mRes.json()) as { items?: { id: string; title: string }[] };
      const mats = payload.items ?? [];
      const capped = mats.slice(0, 60);
      const batches = await Promise.all(
        capped.map(async (m) => {
          const r = await apiFetch(`materials/${encodeURIComponent(m.id)}/reviews`);
          if (!r.ok) return [] as Row[];
          const list = (await r.json()) as Array<{
            id: string;
            rating: number;
            comment?: string | null;
            created_at?: string;
          }>;
          if (!Array.isArray(list)) return [];
          return list.map((rev, idx) => ({
            review: toMockReview(rev, idx, m.id),
            materialTitle: m.title,
            createdAt: rev.created_at ?? "",
          }));
        }),
      );
      const flat = batches.flat().sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      setRows(flat);
    } catch {
      setRows([]);
      setError("無法載入資料。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-[#1F2937]">評論總覽</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          依教材彙總公開評論（較新在上）；教材數量多時僅載入前 60 筆教材以避免過度請求。
        </p>
      </div>

      {loading ? <LoadingState title="載入評論中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="尚無評論資料" description="平台上尚未有使用者提交的評價，或尚未載入到任何教材。" />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <ReviewItem key={`${row.review.id}-${row.materialTitle}`} review={row.review} materialTitle={row.materialTitle} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
