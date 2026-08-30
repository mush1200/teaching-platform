"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { ComplaintListResponse, ComplaintRow } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusPill } from "../../../components/ds";
import {
  COMPLAINT_STATUS_TONE,
  complaintStatusLabel,
  complaintTypeLabel,
  type ComplaintStatus,
} from "../../../lib/complaint-labels";

/**
 * 我的申訴清單（P1-09 Gate 3 / Wave 2 #10）。
 *
 * 資料一律來自 `GET /me/complaints`。**沒有任何 frontend-only 狀態** ——
 * 狀態、法定期限、逾期與否全部是 backend 的 canonical 值
 * （`overdue` / `daysUntilDue` 由 `utils/complaintSla.js` 計算）。
 *
 * `requireAuth` 之外**刻意沒有** `requireActiveAccount`：被凍結的帳號可能正是
 * 帳號遭冒用的當事人，必須看得到並提得出申訴（見 `mvp_rules.md` §12.10.7）。
 */
export default function MyComplaintsPage() {
  const [items, setItems] = useState<ComplaintRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("me/complaints");
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setItems(null);
        return;
      }
      const data = (await res.json()) as ComplaintListResponse;
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("載入失敗，請稍後再試。");
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="my-complaints-page">
      <PageHeader
        title="我的申訴"
        description="您對交易、付款或教材提出的申訴與處理進度。"
        action={
          <Link
            href="/me/complaints/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-intent-action px-4 text-sm font-semibold text-white"
            data-testid="new-complaint-link"
          >
            提出申訴
          </Link>
        }
      />

      {loading ? <LoadingState title="載入申訴中…" /> : null}

      {!loading && error ? (
        <ErrorState title="無法載入申訴" description={error} onRetry={() => void load()} />
      ) : null}

      {!loading && !error && items && items.length === 0 ? (
        <EmptyState
          title="目前沒有申訴"
          description="若您對付款、交付或教材內容有疑問，可以提出申訴，平台會依法處理並回覆您。"
        />
      ) : null}

      {!loading && !error && items && items.length > 0 ? (
        <ul className="mt-4 space-y-3" data-testid="complaint-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/me/complaints/${encodeURIComponent(item.id)}`}
                className="block rounded-ds-card border border-ds-border bg-ds-surface p-4 transition-colors hover:border-edu-primary"
                data-testid="complaint-list-item"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-body font-semibold text-ds-heading">
                    {item.subject}
                  </p>
                  <StatusPill
                    label={complaintStatusLabel(item.status)}
                    tone={COMPLAINT_STATUS_TONE[item.status as ComplaintStatus] ?? "neutral"}
                  />
                </div>
                <p className="mt-1 text-meta text-ds-textMuted">
                  {complaintTypeLabel(item.complaint_type)}
                  {item.order_id ? ` · 訂單 ${item.order_id}` : " · 帳號層級"}
                </p>
                <p className="mt-1 text-meta text-ds-textMuted">
                  提出時間：{formatDate(item.submitted_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

/** 只顯示日期時間，不做任何期限推算 —— 期限一律由 backend 提供。 */
function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
