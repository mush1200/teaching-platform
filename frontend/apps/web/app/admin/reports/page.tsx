"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  ReportCase,
  ReportCaseDetailResponse,
  ReportCasesResponse,
  ReportEvent,
  ReportResolution,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
import {
  MATERIAL_STATUS_LABEL,
  REPORT_EVENT_LABEL,
  REPORT_RESOLUTION_HINT,
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
  SearchField,
  StatusPill,
} from "../../../components/ds";

/**
 * 檢舉管理（Epic §2）。
 *
 * ## 這一頁取代了什麼
 *
 * 舊版只有一顆「標記已處理」—— `pending → reviewed`，沒有調查、沒有與創作者溝通、
 * 沒有處置、沒有歷程。Admin 能做的只有「把它從清單上弄掉」。
 *
 * 現在是一個案件流程：
 *   待處理 → 開始調查 → （必要時）要求創作者補充說明 → 創作者回覆 → 判定與處置。
 * 每一步都寫進 `report_events`，案件詳情就是完整的處理歷程。
 *
 * ## 狀態不是憑空新增的
 *
 * 五個狀態與四個處置都由 Backend 的 `utils/reportWorkflow.js` 定義，
 * 並經 `GET /admin/report-cases/:id` 的 `allowedTransitions` / `availableResolutions`
 * 回傳。UI **不自己判斷**哪些按鈕該出現 —— 那會在 workflow 改變時默默地過期。
 *
 * ## 沒有做的事
 *
 * 沒有即時聊天室（case-based response 而已）、沒有附件上傳（需要新的儲存與
 * 病毒掃描政策）、沒有推播通知（平台沒有 notifications 資料表）。
 * 創作者是主動到 `/creator/cases` 查看待回覆案件。
 */

const OPEN = "open";
const FILTERS = [OPEN, "all", "pending", "investigating", "awaiting_creator", "resolved", "dismissed"] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function AdminReportsContent() {
  const query = useListQueryState("/admin/reports", {
    // 預設「待我處理」：Admin 進來要看的是需要行動的案件，不是全部歷史。
    defaultFilter: OPEN,
    allowedFilters: FILTERS,
  });

  const [data, setData] = useState<ReportCasesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const apiQuery = query.toApiQuery();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/report-cases?${apiQuery}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as ReportCasesResponse);
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

  const counts = data?.statusCounts ?? {};
  const openCount =
    (counts.pending ?? 0) + (counts.investigating ?? 0) + (counts.awaiting_creator ?? 0);
  const filterOptions = [
    { value: OPEN, label: "待處理中", count: openCount },
    { value: "pending", label: "新進", count: counts.pending },
    { value: "investigating", label: "調查中", count: counts.investigating },
    { value: "awaiting_creator", label: "等待創作者", count: counts.awaiting_creator },
    { value: "resolved", label: "已處理", count: counts.resolved },
    { value: "dismissed", label: "已駁回", count: counts.dismissed },
    { value: "all", label: "全部" },
  ];

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="檢舉管理"
        description="從案件佇列查看檢舉內容、與創作者往返、做出判定並留下處理歷程。"
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

      <DataToolbar
        search={
          <SearchField
            id="admin-reports-search"
            label="搜尋檢舉案件"
            placeholder="搜尋教材標題、檢舉理由或相關人員 Email"
            value={query.search}
            onSubmit={query.setSearch}
            disabled={loading}
          />
        }
        filters={
          <FilterTabs
            ariaLabel="檢舉案件狀態篩選"
            options={filterOptions}
            value={query.filter}
            onChange={query.setFilter}
            disabled={loading}
          />
        }
      />

      {loading ? <LoadingState title="載入檢舉案件中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="沒有符合條件的案件"
          description={query.search ? `找不到符合「${query.search}」的檢舉案件。` : "目前沒有需要處理的檢舉。"}
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
  row: ReportCase;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      data-testid="admin-report-row"
      className={`rounded-ds-card border bg-ds-surface p-4 shadow-ds-card-soft transition-colors ${
        selected ? "border-edu-primary" : "border-ds-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-title text-ds-heading">{row.material_title ?? row.material_id}</p>
          <p className="mt-0.5 text-meta text-ds-textMuted">創作者：{row.creator_email ?? row.creator_id ?? "—"}</p>
        </div>
        <StatusPill tone={REPORT_STATUS_TONE[row.status] ?? "neutral"} label={REPORT_STATUS_LABEL[row.status] ?? row.status} />
      </div>

      {row.reason ? <p className="mt-2 line-clamp-2 text-body text-ds-body">「{row.reason}」</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ds-textMuted">
        <span>檢舉人：{row.reporter_email ?? row.reporter_id ?? "—"}</span>
        <span>檢舉時間：{formatDateTime(row.created_at)}</span>
        {row.event_count ? <span>處理歷程 {row.event_count} 筆</span> : null}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={selected}
          data-testid="report-case-open"
          className="min-h-10 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white transition-colors hover:brightness-95"
        >
          {selected ? "收合案件" : "查看案件"}
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
  const [detail, setDetail] = useState<ReportCaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [requestText, setRequestText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [resolution, setResolution] = useState<ReportResolution | "">("");
  const [resolutionNote, setResolutionNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/report-cases/${encodeURIComponent(reportId)}`);
      if (!res.ok) {
        setDetail(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setDetail((await res.json()) as ReportCaseDetailResponse);
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

  async function act(action: string, body: Record<string, unknown>, successMessage: string) {
    setMessage(null);
    setBusy(action);
    try {
      const res = await apiFetch(`admin/report-cases/${encodeURIComponent(reportId)}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage(successMessage);
      setRequestText("");
      setNoteText("");
      setResolutionNote("");
      setResolution("");
      await load();
      await onChanged();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingState title="載入案件中…" />;
  if (error) return <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const { report, events, availableResolutions, allowedTransitions } = detail;
  // 按鈕的可見性由 Backend 回傳的 allowedTransitions 決定，UI 不自行推論。
  const canInvestigate = allowedTransitions.includes("investigating") && report.status === "pending";
  const canRequestResponse = allowedTransitions.includes("awaiting_creator");
  const canResolve = allowedTransitions.includes("resolved") || allowedTransitions.includes("dismissed");
  const isClosed = allowedTransitions.length === 0;

  return (
    <article
      data-testid="report-case-detail"
      className="space-y-5 rounded-ds-card border border-edu-primary bg-ds-surface p-5 shadow-ds-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3 text-ds-heading">{report.material_title ?? report.material_id}</h2>
          <p className="mt-1 text-meta text-ds-textMuted">案件 ID：{report.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill
            tone={REPORT_STATUS_TONE[report.status] ?? "neutral"}
            label={REPORT_STATUS_LABEL[report.status] ?? report.status}
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

      <section className="space-y-2">
        <h3 className="text-title text-ds-heading">案件資料</h3>
        <DetailGrid>
          <DetailField label="檢舉理由">{report.reason ?? "—"}</DetailField>
          <DetailField label="檢舉時間">{formatDateTime(report.created_at)}</DetailField>
          <DetailField label="檢舉人">{report.reporter_email ?? report.reporter_id ?? "—"}</DetailField>
          <DetailField label="被檢舉教材">
            <Link
              href={`/admin/materials/${encodeURIComponent(report.material_id)}/reports`}
              className="text-edu-primary underline"
            >
              {report.material_title ?? report.material_id}
            </Link>
          </DetailField>
          <DetailField label="創作者">{report.creator_email ?? report.creator_id ?? "—"}</DetailField>
          <DetailField label="教材目前狀態">
            {MATERIAL_STATUS_LABEL[report.material_status as keyof typeof MATERIAL_STATUS_LABEL] ??
              report.material_status ??
              "—"}
          </DetailField>
          {report.resolution ? (
            <DetailField label="最終處置">{REPORT_RESOLUTION_LABEL[report.resolution]}</DetailField>
          ) : null}
          {report.reviewed_at ? (
            <DetailField label="結案時間">
              {formatDateTime(report.reviewed_at)}
              {report.reviewed_by_email ? `（${report.reviewed_by_email}）` : ""}
            </DetailField>
          ) : null}
        </DetailGrid>
        <p className="text-caption text-ds-textSubtle">
          目前沒有檢舉附件功能；檢舉內容僅有文字理由。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-title text-ds-heading">處理歷程</h3>
        {events.length === 0 ? (
          <p className="text-body text-ds-textMuted">尚未有任何處理紀錄。</p>
        ) : (
          <ol className="space-y-2" data-testid="report-case-timeline">
            {events.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>

      {isClosed ? (
        <p className="rounded-xl bg-edu-page p-4 text-body text-ds-textMuted">
          此案件已結案，不能再變更狀態。若有新事證，請由檢舉人重新提出檢舉。
        </p>
      ) : (
        <section className="space-y-4 rounded-xl bg-edu-page p-4">
          <h3 className="text-title text-ds-heading">處理動作</h3>

          {canInvestigate ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act("investigate", {}, "已接手此案件，狀態為調查中。")}
              data-testid="report-investigate"
              className="min-h-11 rounded-xl bg-edu-primary px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
            >
              {busy === "investigate" ? "處理中…" : "開始調查"}
            </button>
          ) : null}

          {canRequestResponse ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-meta text-ds-textMuted">要求創作者補充說明（創作者會在後台看到這段文字）</span>
                <textarea
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  rows={3}
                  data-testid="report-request-message"
                  placeholder="例如：請說明第 3 頁圖片的來源與授權"
                  className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
                />
              </label>
              <button
                type="button"
                disabled={busy !== null || !requestText.trim()}
                onClick={() =>
                  void act("request-response", { message: requestText.trim() }, "已要求創作者補充說明。")
                }
                data-testid="report-request-response"
                className="min-h-11 rounded-xl border border-edu-primary px-5 text-sm font-semibold text-edu-primary transition-colors hover:bg-white disabled:opacity-50"
              >
                {busy === "request-response" ? "處理中…" : "要求創作者說明"}
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block">
              <span className="text-meta text-ds-textMuted">內部調查筆記（只有管理員看得到）</span>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                rows={2}
                data-testid="report-admin-note"
                className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
              />
            </label>
            <button
              type="button"
              disabled={busy !== null || !noteText.trim()}
              onClick={() => void act("notes", { message: noteText.trim() }, "已新增內部筆記。")}
              className="min-h-11 rounded-xl border border-ds-border bg-ds-surface px-5 text-sm font-medium text-ds-heading transition-colors hover:bg-white disabled:opacity-50"
            >
              {busy === "notes" ? "處理中…" : "新增筆記"}
            </button>
          </div>

          {canResolve ? (
            <div className="space-y-2 border-t border-ds-borderMuted pt-4">
              <fieldset className="space-y-2">
                <legend className="text-meta text-ds-textMuted">最終處置</legend>
                {availableResolutions.map((code) => (
                  <label key={code} className="flex items-start gap-2 text-body text-ds-heading">
                    <input
                      type="radio"
                      name="report-resolution"
                      value={code}
                      checked={resolution === code}
                      onChange={() => setResolution(code)}
                      data-testid={`report-resolution-${code}`}
                      className="mt-1"
                    />
                    <span>
                      {REPORT_RESOLUTION_LABEL[code]}
                      <span className="block text-meta text-ds-textMuted">{REPORT_RESOLUTION_HINT[code]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="block">
                <span className="text-meta text-ds-textMuted">處置說明（選填，會記入案件歷程）</span>
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  rows={2}
                  data-testid="report-resolution-note"
                  className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
                />
              </label>
              <button
                type="button"
                disabled={busy !== null || !resolution}
                onClick={() =>
                  void act(
                    "resolve",
                    { resolution, note: resolutionNote.trim() || undefined },
                    "已完成處置並結案。"
                  )
                }
                data-testid="report-resolve"
                className="min-h-11 rounded-xl bg-edu-primary px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
              >
                {busy === "resolve" ? "處理中…" : "確認處置並結案"}
              </button>
            </div>
          ) : null}

          {message ? (
            <p data-testid="report-case-message" className="text-body text-edu-warning">
              {message}
            </p>
          ) : null}
        </section>
      )}
    </article>
  );
}

function TimelineItem({ event }: { event: ReportEvent }) {
  const resolution = typeof event.meta?.resolution === "string" ? (event.meta.resolution as ReportResolution) : null;
  const from = typeof event.meta?.from === "string" ? event.meta.from : null;
  const to = typeof event.meta?.to === "string" ? event.meta.to : null;

  return (
    <li className="rounded-xl border border-ds-borderMuted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-title text-ds-heading">{REPORT_EVENT_LABEL[event.event_type] ?? event.event_type}</span>
        <span className="text-meta text-ds-textMuted">
          {actorRoleLabel(event.actor_role)}
          {event.actor_email ? ` ${event.actor_email}` : ""} · {formatDateTime(event.created_at)}
        </span>
      </div>
      {resolution ? (
        <p className="mt-1 text-body text-ds-heading">處置：{REPORT_RESOLUTION_LABEL[resolution]}</p>
      ) : null}
      {!resolution && from && to ? (
        <p className="mt-1 text-meta text-ds-textMuted">
          {REPORT_STATUS_LABEL[from as keyof typeof REPORT_STATUS_LABEL] ?? from} →{" "}
          {REPORT_STATUS_LABEL[to as keyof typeof REPORT_STATUS_LABEL] ?? to}
        </p>
      ) : null}
      {event.message ? <p className="mt-1 whitespace-pre-wrap text-body text-ds-body">{event.message}</p> : null}
      {event.meta?.materialUnpublished === true ? (
        <p className="mt-1 text-meta text-edu-error">已將教材下架。</p>
      ) : null}
    </li>
  );
}

function AdminReportsFallback() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader title="檢舉管理" />
      <LoadingState title="載入檢舉案件中…" />
    </section>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<AdminReportsFallback />}>
      <AdminReportsContent />
    </Suspense>
  );
}
