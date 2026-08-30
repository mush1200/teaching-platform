"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import { ReviewItem } from "../../../components/reviews/ReviewItem";
import { toAdminReviewCard } from "../../../components/admin/MaterialFeedbackContext";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ds";
import type { MockReview } from "../../../lib/view-models";

/**
 * 全平台的教學回饋列表（**相容保留，非主導覽入口**）。
 *
 * 側欄不再有「教學回饋」一級入口：這一頁沒有獨立的 Admin JTBD —— 不能搜尋、
 * 不能篩星等、不能依教材彙總，也沒有任何處置動作。Admin 真正需要回饋的時刻
 * 是**在判斷某一份教材時**，因此摘要與最新幾則已下放到檢舉案件詳情與教材檢舉脈絡頁
 * （`components/admin/MaterialFeedbackContext`）。
 *
 * 這個 route 保留可直達（既有連結與書籤不會斷），行為維持唯讀，
 * **不再**被當成一個需要 Admin 每天處理的佇列。
 * 決策見 `docs/admin-information-architecture.md` §8。
 */

type Row = {
  review: MockReview;
  materialTitle: string;
  createdAt: string;
  /** `GET /materials/:id/reviews` 唯一提供的撰寫者識別；Admin 要追人時只有這個。 */
  authorId: string | null;
};

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
            parent_id?: string | null;
          }>;
          if (!Array.isArray(list)) return [];
          return list.map((rev, idx) => ({
            review: toAdminReviewCard(rev, idx, m.id),
            materialTitle: m.title,
            createdAt: rev.created_at ?? "",
            authorId: rev.parent_id ?? null,
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
        description="查詢平台上的教學回饋與教材評價，供處理檢舉或客訴時查看背景資訊。這是唯讀檢視。"
      />
      <p className="rounded-ds-card border border-ds-border bg-ds-surface px-4 py-3 text-meta text-ds-textMuted">
        僅載入前 60 筆教材的回饋。這一頁尚未有專屬的彙總 API，因此不做分頁也不提供搜尋。
        MVP 階段刻意維持唯讀：隱藏／下架單筆回饋需要完整的 lifecycle（誰能還原、作者看不看得到、
        評分是否重算），在那之前不提供半套的管理動作。回饋內容有問題時，請走檢舉流程處理該教材。
      </p>
      <p className="rounded-ds-card border border-ds-border bg-edu-page px-4 py-3 text-meta text-ds-textMuted">
        這一頁不在側欄裡：要判斷單一教材時，該教材的回饋摘要與最新幾則已直接顯示在
        <strong className="font-semibold text-ds-heading">檢舉案件詳情</strong>與
        <strong className="font-semibold text-ds-heading">教材檢舉脈絡</strong>頁，不需要先來這裡找。
      </p>

      {loading ? <LoadingState title="載入教學回饋中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="尚無教學回饋資料" description="平台上尚未有使用者提交的教學回饋，或尚未載入到任何教材。" />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={`${row.review.id}-${row.materialTitle}`} className="space-y-1">
              {/*
                作者名稱與角色標籤都關閉：API 沒有提供作者身分，任何稱呼都是編造的。
                可查的識別碼放在卡片下方 —— Admin 追案件時需要的是 id，不是假名字。
              */}
              <ReviewItem
                review={row.review}
                materialTitle={row.materialTitle}
                showAuthorName={false}
                showRoleBadge={false}
              />
              <p className="px-1 text-caption text-ds-textSubtle">
                回饋 ID：{row.review.id}
                {row.authorId ? ` · 撰寫者 ID：${row.authorId}` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
