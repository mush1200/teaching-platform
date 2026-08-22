"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import type {
  CreatorCase,
  CreatorCaseDetailResponse,
  CreatorCasesResponse,
  ReportEvent,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
import {
  MATERIAL_STATUS_LABEL,
  REPORT_EVENT_LABEL,
  REPORT_RESOLUTION_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  actorRoleLabel,
} from "../../../lib/admin-labels";
import {
  DataToolbar,
  DetailField,
  DetailGrid,
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  Pagination,
  StatusPill,
} from "../../../components/ds";

/**
 * 創作者的「平台案件」（Epic §2 的創作者側）。
 *
 * ## 這是 case-based response，不是聊天室
 *
 * 管理員在案件上留下一則「要求補充說明」，創作者在這裡看到、提交一段文字說明，
 * 案件就回到管理員手上。沒有即時訊息、沒有輪詢。
 *
 * ## 創作者看不到的東西
 *
 * 檢舉人的身分（API 根本不回傳）與管理員的內部調查筆記（Backend 端就過濾掉了，
 * 見 `report.repository.listCreatorVisibleEvents`）。
 * 創作者需要知道「被檢舉了什麼」，不需要知道「是誰檢舉的」。
 *
 * ## 目前沒有推播
 *
 * 平台沒有 notifications 資料表，emailService 也只涵蓋訂單／付款事件。
 * 待回覆數量以側欄徽章呈現（`actionRequiredCount`），創作者是主動來看。
 */

const ACTION_REQUIRED = "action_required";
const FILTERS = [ACTION_REQUIRED, "open", "all"] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function CreatorCasesContent() {
  const query = useListQueryState("/creator/cases", {
    defaultFilter: ACTION_REQUIRED,
    allowedFilters: FILTERS,
    filterKey: "scope",
  });

  const [data, setData] = useState<CreatorCasesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /*
   * `toApiQuery` 會把 filter 寫成 `scope=`，但預設值（action_required）在 URL 上被省略，
   * 因此這裡必須把它補回 API query —— API 的預設是「全部」，兩者不同。
   */
  const apiQuery = `scope=${encodeURIComponent(query.filter)}&page=${query.page}&limit=${query.pageSize}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`creator/cases?${apiQuery}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as CreatorCasesResponse);
    } catch {
      setData(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterOptions = [
    { value: ACTION_REQUIRED, label: "待我回覆", count: data?.actionRequiredCount },
    { value: "open", label: "處理中" },
    { value: "all", label: "全部" },
  ];

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="平台案件"
        description="平台對你的教材提出的檢舉處理案件。需要你補充說明時會顯示在「待我回覆」。"
      />

      <DataToolbar
        filters={
          <FilterTabs
            ariaLabel="案件範圍篩選"
            options={filterOptions}
            value={query.filter}
            onChange={query.setFilter}
            disabled={loading}
          />
        }
      />

      {loading ? <LoadingState title="載入案件中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title={query.filter === ACTION_REQUIRED ? "目前沒有需要你回覆的案件" : "沒有相關案件"}
          description="平台若需要你針對某份教材補充說明，會出現在這裡。"
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((row) => (
            <CaseRow
              key={row.id}
              row={row}
              selected={selectedId === row.id}
              onToggle={() => setSelectedId(selectedId === row.id ? null : row.id)}
            />
          ))}

          {pagination ? (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              pageSize={pagination.limit}
              disabled={loading}
              onPageChange={query.setPage}
              onPageSizeChange={query.setPageSize}
              className="pt-2"
            />
          ) : null}
        </div>
      ) : null}

      {selectedId ? (
        <CaseDetail reportId={selectedId} onChanged={load} onClose={() => setSelectedId(null)} />
      ) : null}
    </section>
  );
}

function CaseRow({
  row,
  selected,
  onToggle,
}: {
  row: CreatorCase;
  selected: boolean;
  onToggle: () => void;
}) {
  const needsResponse = row.status === "awaiting_creator";
  return (
    <article
      data-testid="creator-case-row"
      className={`rounded-ds-card border bg-ds-surface p-4 shadow-ds-card-soft transition-colors ${
        selected ? "border-edu-primary" : "border-ds-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-title text-ds-heading">{row.material_title ?? row.material_id}</p>
          <p className="mt-0.5 text-meta text-ds-textMuted">
            教材狀態：
            {MATERIAL_STATUS_LABEL[row.material_status as keyof typeof MATERIAL_STATUS_LABEL] ??
              row.material_status ??
              "—"}
          </p>
        </div>
        <StatusPill
          tone={REPORT_STATUS_TONE[row.status] ?? "neutral"}
          label={REPORT_STATUS_LABEL[row.status] ?? row.status}
        />
      </div>

      {needsResponse && row.latest_request_message ? (
        <p className="mt-2 rounded-xl bg-[#FEF3EC] p-3 text-body text-ds-heading">
          平台要求：{row.latest_request_message}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ds-textMuted">
        <span>案件建立：{formatDateTime(row.created_at)}</span>
        {row.latest_request_at ? <span>最近要求：{formatDateTime(row.latest_request_at)}</span> : null}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={selected}
          data-testid="creator-case-open"
          className="min-h-10 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white transition-colors hover:brightness-95"
        >
          {selected ? "收合案件" : needsResponse ? "回覆案件" : "查看案件"}
        </button>
      </div>
    </article>
  );
}

function CaseDetail({
  reportId,
  onChanged,
  onClose,
}: {
  reportId: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CreatorCaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`creator/cases/${encodeURIComponent(reportId)}`);
      if (!res.ok) {
        setDetail(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setDetail((await res.json()) as CreatorCaseDetailResponse);
    } catch {
      setDetail(null);
      setError("無法載入案件資料。");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!reply.trim()) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await apiFetch(`creator/cases/${encodeURIComponent(reportId)}/respond`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setReply("");
      setMessage("已送出說明，平台會再與你聯繫。");
      await load();
      await onChanged();
    } catch {
      setMessage("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState title="載入案件中…" />;
  if (error) return <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const item = detail.case;

  return (
    <article
      data-testid="creator-case-detail"
      className="space-y-5 rounded-ds-card border border-edu-primary bg-ds-surface p-5 shadow-ds-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3 text-ds-heading">{item.material_title ?? item.material_id}</h2>
          <p className="mt-1 text-meta text-ds-textMuted">案件 ID：{item.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill
            tone={REPORT_STATUS_TONE[item.status] ?? "neutral"}
            label={REPORT_STATUS_LABEL[item.status] ?? item.status}
          />
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-ds-border px-3 text-sm font-medium text-ds-textMuted hover:bg-edu-page"
          >
            關閉
          </button>
        </div>
      </div>

      <DetailGrid>
        <DetailField label="案件建立">{formatDateTime(item.created_at)}</DetailField>
        <DetailField label="教材目前狀態">
          {MATERIAL_STATUS_LABEL[item.material_status as keyof typeof MATERIAL_STATUS_LABEL] ??
            item.material_status ??
            "—"}
        </DetailField>
        {item.resolution ? (
          <DetailField label="平台處置">{REPORT_RESOLUTION_LABEL[item.resolution]}</DetailField>
        ) : null}
        {item.resolution_note ? <DetailField label="處置說明">{item.resolution_note}</DetailField> : null}
      </DetailGrid>

      <section className="space-y-2">
        <h3 className="text-title text-ds-heading">往來紀錄</h3>
        {detail.events.length === 0 ? (
          <p className="text-body text-ds-textMuted">尚無往來紀錄。</p>
        ) : (
          <ol className="space-y-2" data-testid="creator-case-timeline">
            {detail.events.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>

      {detail.canRespond ? (
        <section className="space-y-3 rounded-xl bg-edu-page p-4">
          <h3 className="text-title text-ds-heading">提交說明</h3>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            data-testid="creator-case-reply"
            placeholder="說明教材內容的來源、授權，或你已做的調整"
            className="w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
          />
          <p className="text-caption text-ds-textSubtle">
            目前僅支援文字說明。若需要提供檔案佐證，請在說明中留下可存取的連結。
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !reply.trim()}
            data-testid="creator-case-submit"
            className="min-h-11 rounded-xl bg-edu-primary px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
          >
            {busy ? "送出中…" : "送出說明"}
          </button>
          {message ? <p className="text-body text-edu-warning">{message}</p> : null}
        </section>
      ) : (
        <p className="rounded-xl bg-edu-page p-4 text-body text-ds-textMuted">
          此案件目前不需要你回覆。若平台需要更多資訊，會再通知你。
        </p>
      )}
    </article>
  );
}

function TimelineItem({ event }: { event: ReportEvent }) {
  return (
    <li className="rounded-xl border border-ds-borderMuted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-title text-ds-heading">{REPORT_EVENT_LABEL[event.event_type] ?? event.event_type}</span>
        <span className="text-meta text-ds-textMuted">
          {actorRoleLabel(event.actor_role)} · {formatDateTime(event.created_at)}
        </span>
      </div>
      {event.message ? <p className="mt-1 whitespace-pre-wrap text-body text-ds-body">{event.message}</p> : null}
    </li>
  );
}

function CreatorCasesFallback() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <PageHeader title="平台案件" />
      <LoadingState title="載入案件中…" />
    </section>
  );
}

export default function CreatorCasesPage() {
  return (
    <Suspense fallback={<CreatorCasesFallback />}>
      <CreatorCasesContent />
    </Suspense>
  );
}
