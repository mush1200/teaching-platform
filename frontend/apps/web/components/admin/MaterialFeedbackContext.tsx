"use client";

import { useCallback, useEffect, useState } from "react";
import { ReviewItem } from "../reviews/ReviewItem";
import { apiFetch } from "../../lib/api-client";
import type { MaterialRatingStats } from "../../lib/api-types";
import type { MockReview } from "../../lib/view-models";

/**
 * 單一教材的教學回饋脈絡（Admin 唯讀）。
 *
 * ## 為什麼是「脈絡」而不是一個頁面
 *
 * 教學回饋（資料模型是 `review`）沒有獨立的 Admin JTBD：沒有案件、沒有狀態、沒有 SLA，
 * Admin 不會「每天處理回饋」。它真正有用的時刻是**正在對某一份教材做判斷**時 ——
 * 處理檢舉案件、或審視某份教材的品質背景。因此它出現在那些頁面的當下，
 * 而不是要求 Admin 先進入一個全平台 feed 再自己找脈絡
 * （決策見 `docs/admin-information-architecture.md` §8）。
 *
 * ## 邊界
 *
 * - **唯讀。** 這裡不提供任何處置動作（隱藏／刪除／標記回饋都沒有 API，
 *   也不該用半套的 UI 假裝有）。要處置內容問題，正式入口是檢舉流程。
 * - **不新增 business state。** 只讀既有的公開端點
 *   `GET /materials/:id/rating` 與 `GET /materials/:id/reviews`，不需要新的 admin API。
 * - **一次只看一份教材。** 因此沒有 `reviews-hub` 那種「每份教材各一個請求」的 N+1；
 *   這個元件固定就是 2 個請求。
 */

/** 幾星以下算「低星」—— 摘要要讓 Admin 一眼看到負面訊號的量，而不是只有平均值。 */
const LOW_RATING_MAX = 2;

/**
 * API → view model。
 *
 * **不要在這裡臆測作者身分。** `GET /materials/:id/reviews` 只回傳
 * `id / rating / comment / created_at / parent_id` —— 沒有姓名、沒有 Email、沒有角色。
 * 舊版把每一則都寫死成「家長」，那既是憑空捏造的身分，也違反角色命名規則
 * （見 CLAUDE.md §2 與 `docs/ui-role-naming-checklist.md`）。
 * 因此 Admin 端**不顯示**作者名稱與角色標籤，改在卡片下方標示可查的識別碼。
 *
 * 匯出給 `/admin/reviews-hub` 共用 —— Admin 端只維護這一份 mapper。
 */
export function toAdminReviewCard(
  api: { id: string; rating: number; comment?: string | null; created_at?: string },
  idx: number,
  materialId: string,
): MockReview {
  const accents: MockReview["avatarAccent"][] = ["violet", "coral", "emerald", "amber"];
  return {
    id: api.id,
    materialId,
    // 名稱與角色都不會被 render（`showAuthorName` / `showRoleBadge` 皆為 false）。
    userName: "",
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

type ApiReviewRow = {
  id: string;
  rating: number;
  comment?: string | null;
  created_at?: string;
  parent_id?: string | null;
};

type Row = { review: MockReview; createdAt: string; authorId: string | null };

type Props = {
  materialId: string;
  /**
   * 標題層級由呼叫端決定：檢舉案件詳情裡它是 `h2` 底下的一段（`h3`），
   * 教材檢舉脈絡頁裡它直接掛在 `h1` 底下（`h2`）。
   */
  heading?: "h2" | "h3";
  /** 最新幾則。摘要的數字一律是全部，不受這個值影響。 */
  limit?: number;
};

export function MaterialFeedbackContext({ materialId, heading: Heading = "h3", limit = 3 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<MaterialRatingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!materialId) return;
    setLoading(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(materialId);
      const [ratingRes, reviewsRes] = await Promise.all([
        apiFetch(`materials/${encoded}/rating`),
        apiFetch(`materials/${encoded}/reviews`),
      ]);
      if (!ratingRes.ok || !reviewsRes.ok) {
        setStats(null);
        setRows([]);
        setError("無法載入這份教材的教學回饋。");
        return;
      }
      const ratingPayload = (await ratingRes.json()) as Partial<MaterialRatingStats> | null;
      const reviewPayload = (await reviewsRes.json()) as unknown;
      // 端點回的是陣列；任何其他形狀都當成「沒有資料」，不要讓頁面炸掉。
      const list: ApiReviewRow[] = Array.isArray(reviewPayload) ? (reviewPayload as ApiReviewRow[]) : [];
      const mapped = list
        .map((item, idx) => ({
          review: toAdminReviewCard(item, idx, materialId),
          createdAt: item.created_at ?? "",
          authorId: item.parent_id ?? null,
        }))
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
      setRows(mapped);
      setStats({
        average: typeof ratingPayload?.average === "number" ? ratingPayload.average : null,
        // 則數以 `/rating` 為準（它是 DB 的 COUNT）；列表只是用來取最新幾則與低星數。
        count: Number(ratingPayload?.count ?? mapped.length) || 0,
      });
    } catch {
      setStats(null);
      setRows([]);
      setError("無法載入這份教材的教學回饋。");
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lowRatingCount = rows.filter((row) => row.review.rating > 0 && row.review.rating <= LOW_RATING_MAX).length;
  const total = stats?.count ?? rows.length;
  const average = stats?.average;

  return (
    <section className="space-y-2" data-testid="material-feedback-context" data-material-id={materialId}>
      <Heading className="text-title text-ds-heading">教學回饋</Heading>

      {loading ? <p className="text-body text-ds-textMuted">載入教學回饋中…</p> : null}

      {!loading && error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p data-testid="material-feedback-error" className="text-body text-edu-warning">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-10 rounded-xl border border-ds-border px-3 text-sm font-medium text-ds-textMuted hover:bg-edu-page"
          >
            重試
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <p data-testid="material-feedback-summary" className="text-body text-ds-textMuted">
            {total > 0
              ? `平均 ${average != null ? average.toFixed(1) : "—"} 分・${total} 則・其中 ${lowRatingCount} 則 ${LOW_RATING_MAX} 星以下`
              : "這份教材目前沒有教學回饋。"}
          </p>

          {rows.length > 0 ? (
            <div className="space-y-2">
              {rows.slice(0, limit).map((row) => (
                <article key={row.review.id} className="space-y-1" data-testid="material-feedback-review">
                  <ReviewItem review={row.review} compact showAuthorName={false} showRoleBadge={false} />
                  <p className="px-1 text-caption text-ds-textSubtle">
                    回饋 ID：{row.review.id}
                    {row.authorId ? ` · 撰寫者 ID：${row.authorId}` : ""}
                  </p>
                </article>
              ))}
              {total > rows.slice(0, limit).length ? (
                <p className="text-caption text-ds-textSubtle">
                  僅顯示最新 {Math.min(limit, rows.length)} 則。
                </p>
              ) : null}
            </div>
          ) : null}

          {/*
            這裡刻意沒有任何處置按鈕：隱藏／刪除單則回饋沒有 API，也沒有 lifecycle
            （誰能還原、作者看不看得到、評分是否重算）。回饋內容有問題時走檢舉流程。
          */}
          <p className="text-caption text-ds-textSubtle">唯讀脈絡：回饋內容有問題時，請對該教材建立檢舉案件處理。</p>
        </>
      ) : null}
    </section>
  );
}
