"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";
import {
  AccentTextLink,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "../../../../components/ds";

/**
 * 個資權利請求 —— 詳情、歷程與狀態處理（`OPS-04` / `DEC-LEGAL-13`）。
 *
 * 與消費申訴詳情頁刻意分開：不同的 domain、不同的狀態、不同的 API。
 *
 * **本頁不顯示任何法定期限，也不宣稱身分驗證已依法完成** ——
 * 兩者的法律結論皆未取得。狀態 `已處理完成` 僅代表平台已處理完該請求，
 * **不代表資料已刪除**（帳號刪除語意仍為 `SCHEMA-02` / `O-22`，blocked）。
 */

type Option = { code: string; label: string };

type PrivacyRequest = {
  id: string;
  requestType: string;
  requestTypeLabel: string;
  status: string;
  statusLabel: string;
  requesterReference: string;
  summary: string;
  receivedAt: string;
  completedAt: string | null;
  source: string;
  allowedTransitions: string[];
};

type EventRow = {
  id: string;
  eventType: string;
  actorId: string | null;
  actorRole: string | null;
  message: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "已受理",
  in_review: "處理中",
  waiting_for_information: "等待補充資訊",
  completed: "已處理完成",
  closed: "已結案",
};

const EVENT_LABEL: Record<string, string> = {
  created: "建立案件",
  status_changed: "狀態變更",
  internal_note: "內部註記",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-TW", { hour12: false });
}

export default function AdminPrivacyRequestDetailPage() {
  const params = useParams();
  const requestId = String(params.requestId ?? "").trim();

  const [request, setRequest] = useState<PrivacyRequest | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/privacy-requests/${encodeURIComponent(requestId)}`);
      if (!res.ok) {
        setRequest(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as { request: PrivacyRequest; events: EventRow[] };
      setRequest(data.request);
      setEvents(data.events ?? []);
    } catch {
      setRequest(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transition() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(`admin/privacy-requests/${encodeURIComponent(requestId)}/transition`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        setActionError(await parseApiErrorMessage(res));
        return;
      }
      setNextStatus("");
      setNote("");
      await load();
    } catch {
      setActionError("無法連線至伺服器，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  if (!requestId) {
    return (
      <section className="flex w-full flex-col gap-4">
        <PageHeader title="個資權利請求" />
        <ErrorState title="缺少案件編號" description="請從個資權利請求清單進入。" />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4" data-testid="privacy-request-detail">
      <PageHeader
        title="個資權利請求"
        description="案件詳情與處理歷程。此為個人資料權利請求，與消費申訴分屬不同案件類型。"
        breadcrumb={
          <AccentTextLink href="/admin/privacy-requests" className="text-sm">
            ← 返回個資權利請求
          </AccentTextLink>
        }
      />

      {loading ? <LoadingState title="載入案件中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}

      {!loading && !error && request ? (
        <>
          <article className="space-y-3 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="info" label={request.statusLabel} />
              <span className="text-body font-medium text-ds-heading" data-testid="privacy-detail-type">
                {request.requestTypeLabel}
              </span>
            </div>
            <dl className="grid gap-2 text-meta text-ds-textMuted sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ds-heading">收到時間</dt>
                <dd data-testid="privacy-detail-received">{formatDate(request.receivedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ds-heading">處理完成時間</dt>
                <dd>{formatDate(request.completedAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-ds-heading">請求者聯絡識別</dt>
                <dd data-testid="privacy-detail-reference">{request.requesterReference}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-ds-heading">內部摘要</dt>
                <dd className="whitespace-pre-wrap">{request.summary}</dd>
              </div>
            </dl>

            {/*
              誠實邊界說明。`completed` 不是刪除證明，也不是法定期限的達成。
            */}
            <p className="rounded-ds-card bg-edu-page px-3 py-2 text-meta text-ds-textMuted">
              案件狀態僅記錄平台內部處理進度。「已處理完成」不代表使用者資料已全部刪除，
              亦不代表已符合任何法定回覆期限或身分驗證程序。
            </p>
          </article>

          {request.allowedTransitions.length > 0 ? (
            <article
              className="space-y-3 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft"
              data-testid="privacy-transition-form"
            >
              <h2 className="text-title text-ds-heading">更新處理狀態</h2>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value)}
                disabled={busy}
                aria-label="下一個狀態"
                data-testid="privacy-transition-select"
                className="min-h-11 w-full rounded-xl border border-ds-border bg-white px-3 text-sm text-ds-heading"
              >
                <option value="">請選擇下一個狀態</option>
                {request.allowedTransitions.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                rows={2}
                placeholder="處理說明（選填）"
                aria-label="處理說明"
                data-testid="privacy-transition-note"
                className="w-full rounded-xl border border-ds-border bg-white px-3 py-2 text-sm text-ds-heading"
              />
              {actionError ? (
                <p role="alert" className="text-meta text-rose-700" data-testid="privacy-transition-error">
                  {actionError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy || !nextStatus}
                onClick={() => void transition()}
                data-testid="privacy-transition-submit"
                className="min-h-11 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "處理中…" : "更新狀態"}
              </button>
            </article>
          ) : null}

          <article className="space-y-2 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft">
            <h2 className="text-title text-ds-heading">處理歷程</h2>
            <ul className="space-y-2" data-testid="privacy-event-list">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-ds-card bg-edu-page px-3 py-2 text-meta text-ds-textMuted">
                  <span className="font-medium text-ds-heading">{EVENT_LABEL[ev.eventType] ?? ev.eventType}</span>
                  {" · "}
                  {formatDate(ev.createdAt)}
                  {ev.message ? <p className="mt-1 whitespace-pre-wrap">{ev.message}</p> : null}
                </li>
              ))}
            </ul>
          </article>
        </>
      ) : null}
    </section>
  );
}
