"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import { ReviewItem } from "../../../components/reviews/ReviewItem";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ds";
import type { MockReview } from "../../../lib/view-models";

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
    audienceRole: "parent",
    avatarAccent: accents[idx % accents.length] ?? "violet",
    rating: Number(api.rating) || 0,
    date: api.created_at
      ? new Date(api.created_at).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" })
      : "",
    content: (api.comment ?? "").trim() ? String(api.comment).trim() : "（無文字教學回饋）",
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
      /*
       * `limit=60` 是明確帶上的，不是預設值。
       * `GET /admin/materials` 現在是 server-side 分頁（預設 20 筆／頁），
       * 不帶 limit 只會拿到第一頁，而這一頁的行為契約是「前 60 筆教材」。
       *
       * 這個 N+1（每份教材一次 reviews 請求）是既有的實作缺口，本輪不改 ——
       * 修它需要一支 admin 端的彙總 API，屬於「教學回饋管理」的 MVP 範圍決策。
       */
      const mRes = await apiFetch("admin/materials?limit=60");
      if (!mRes.ok) {
        setRows([]);
        setError(await parseApiErrorMessage(mRes));
        return;
      }
      const payload = (await mRes.json()) as { items?: { id: string; title: string }[] };
      const capped = payload.items ?? [];
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="教學回饋總覽"
        description="依教材彙總公開的教學回饋（較新在上）。這是唯讀檢視 —— 目前沒有下架或隱藏單筆回饋的 API。"
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-4 text-sm font-medium text-ds-heading transition-colors hover:bg-edu-page disabled:opacity-50"
          >
            重新整理
          </button>
        }
      />
      <p className="rounded-ds-card border border-ds-border bg-ds-surface px-4 py-3 text-meta text-ds-textMuted">
        僅載入前 60 筆教材的回饋。這一頁尚未有專屬的彙總 API，因此不做分頁也不提供搜尋 ——
        要做完整的回饋管理（隱藏、標記、與檢舉串接）需要先確認 MVP 範圍。
      </p>

      {loading ? <LoadingState title="載入教學回饋中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="尚無教學回饋資料" description="平台上尚未有使用者提交的教學回饋，或尚未載入到任何教材。" />
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
