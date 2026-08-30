"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AdminMaterialsListResponse, AdminMaterialRow, MaterialReviewStatus } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
import { MATERIAL_STATUS_LABEL, MATERIAL_STATUS_TONE } from "../../../lib/admin-labels";
import {
  DataToolbar,
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  Pagination,
  RefreshControl,
  SearchField,
  StatusPill,
} from "../../../components/ds";
import { AdminReviewPlaceholder, AdminReviewWorkspace } from "../../../components/admin/AdminReviewWorkspace";
import { MaterialReviewPanel } from "../../../components/admin/MaterialReviewPanel";

/**
 * 教材審核（Material Review MVP Phase 1）。
 *
 * ## 這一頁取代了什麼
 *
 * 舊版是一份**唯讀清單**：有狀態篩選、有排序、有未結檢舉徽章，但沒有任何審核動作，
 * 也沒有教材詳情頁 —— 平台核心流程的「管理員審核上架」在 UI 上完全不存在，
 * 唯一能上架教材的方式是拿 Postman 打 `PUT /materials/:id`。
 *
 * 現在是一個 Review Workspace：左邊佇列、右邊完整教材內容與審核決定。
 *
 * ## 篩選：只服務待辦
 *
 * 第一層只有三個 —— `待審核` / `等待創作者` / `全部`：
 *   - **待審核**（`pending_review`）＝ 這一頁存在的理由，預設值。
 *   - **等待創作者**（`changes_requested`）＝ 我退回的東西還沒回來。
 *     它**不是** Admin 的待辦（球在創作者手上），因此用中性色、不做紅色數量提示。
 *   - **全部** ＝ 查詢逃生口，配合搜尋找特定教材。
 *
 * 刻意**不給「已上架」一級 tab**：Admin 對已上架教材沒有可執行的動作
 * （下架只能走檢舉處置，見 docs/material-review-workflow.md §Reports boundary），
 * 把 90 筆已上架教材放進審核頁的一級入口只會稀釋待辦訊號。
 *
 * ## 狀態轉移不在這裡
 *
 * 這一頁只呼叫 `POST /admin/materials/:id/approve` 與 `/request-changes`；
 * 轉移規則、退回原因 allowlist、note 長度全部由 Backend 的
 * `utils/materialWorkflow.js` 定義，UI 不自行推論。
 */

const PENDING = "pending_review";
const AWAITING_CREATOR = "changes_requested";
const ALL = "all";

/** URL 允許的 status 值。`published` / `unpublished` 仍可 deep link（沒有一級 tab）。 */
const FILTERS = [PENDING, AWAITING_CREATOR, ALL, "published", "unpublished"] as const;

const SORT_OPTIONS = [
  { value: "created_desc", label: "最新建立" },
  { value: "created_asc", label: "最早建立" },
  { value: "updated_desc", label: "最近更新" },
  { value: "title_asc", label: "標題 A→Z" },
  { value: "price_desc", label: "價格由高到低" },
];

function statusLabel(status?: string): string {
  return MATERIAL_STATUS_LABEL[status as MaterialReviewStatus] ?? status ?? "未設定";
}

function statusTone(status?: string) {
  return MATERIAL_STATUS_TONE[status as MaterialReviewStatus] ?? "neutral";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function AdminMaterialsContent() {
  const query = useListQueryState("/admin/materials", {
    // 預設「待審核」：這一頁的工作就是把佇列清空。
    defaultFilter: PENDING,
    allowedFilters: FILTERS,
  });

  const [data, setData] = useState<AdminMaterialsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("created_desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const apiQuery = query.toApiQuery({ sort: sort === "created_desc" ? undefined : sort });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/materials?${apiQuery}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as AdminMaterialsListResponse);
      setUpdatedAt(new Date());
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

  const counts = data?.statusCounts;
  const filterOptions = [
    { value: PENDING, label: "待審核", count: counts?.pending_review },
    { value: AWAITING_CREATOR, label: "等待創作者", count: counts?.changes_requested },
    { value: ALL, label: "全部", count: counts?.total },
  ];

  const items: AdminMaterialRow[] = useMemo(() => data?.items ?? [], [data]);
  const pagination = data?.pagination;
  const selected = items.find((item) => item.id === selectedId) ?? null;

  /**
   * 「下一筆待審」：目前這一頁裡、排在選取項之後的第一筆 `pending_review`。
   * 找不到就不顯示按鈕 —— 不跨頁去猜，也不假裝還有東西可審。
   */
  const nextPendingId = useMemo(() => {
    if (!selectedId) return null;
    const index = items.findIndex((item) => item.id === selectedId);
    if (index < 0) return null;
    const next = items.slice(index + 1).find((item) => item.status === PENDING);
    return next?.id ?? null;
  }, [items, selectedId]);

  /* 換篩選／換搜尋一律取消選取：窄螢幕在選取狀態下看不到清單。 */
  const selectFilter = (next: string) => {
    setSelectedId(null);
    query.setFilter(next);
  };
  const submitSearch = (next: string) => {
    setSelectedId(null);
    query.setSearch(next);
  };

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="教材審核"
        description="逐筆檢視創作者提交的教材內容，決定核准上架或退回修改。"
        action={<RefreshControl updatedAt={updatedAt} onRefresh={() => void load()} busy={loading} />}
      />

      <DataToolbar
        search={
          <SearchField
            id="admin-materials-search"
            label="搜尋教材"
            placeholder="搜尋教材標題或創作者 Email"
            value={query.search}
            onSubmit={submitSearch}
            disabled={loading}
          />
        }
        trailing={
          <label className="flex items-center gap-2 text-sm text-ds-textMuted">
            <span>排序</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                query.setPage(1);
              }}
              aria-label="排序方式"
              className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
        filters={
          <FilterTabs
            ariaLabel="教材審核狀態篩選"
            options={filterOptions}
            value={query.filter}
            onChange={selectFilter}
            disabled={loading}
          />
        }
      />

      <AdminReviewWorkspace
        listLabel="待審教材佇列"
        detailLabel="教材審核詳情"
        backLabel="返回教材清單"
        onBackToList={() => setSelectedId(null)}
        placeholder={
          <AdminReviewPlaceholder
            title="選擇一份教材"
            description="從左側佇列點選教材後，完整內容、風險背景與審核決定都會顯示在這裡。"
          />
        }
        list={
          <div className="space-y-3">
            {loading ? <LoadingState title="載入教材中…" /> : null}
            {!loading && error ? (
              <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />
            ) : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState
                title="沒有符合條件的教材"
                description={
                  query.search
                    ? `找不到符合「${query.search}」的教材。可以改用教材標題或創作者 Email 搜尋。`
                    : query.filter === PENDING
                      ? "目前沒有待審核的教材。"
                      : "此狀態目前沒有教材。"
                }
              />
            ) : null}

            {!loading && !error && items.length > 0 ? (
              <>
                {items.map((row) => (
                  <MaterialQueueRow
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
              </>
            ) : null}
          </div>
        }
        detail={
          selected ? (
            <MaterialReviewPanel
              key={selected.id}
              row={selected}
              onReviewed={load}
              onClose={() => setSelectedId(null)}
              onNext={nextPendingId ? () => setSelectedId(nextPendingId) : null}
            />
          ) : null
        }
      />
    </section>
  );
}

function MaterialQueueRow({
  row,
  selected,
  onToggle,
}: {
  row: AdminMaterialRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const pending = row.status === PENDING;
  return (
    <article
      data-testid="admin-material-row"
      aria-current={selected ? "true" : undefined}
      className={`rounded-ds-card border bg-ds-surface p-4 shadow-ds-card-soft transition-colors ${
        selected ? "border-edu-primary ring-1 ring-edu-primary" : "border-ds-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-title text-ds-heading">{row.title}</p>
          <p className="mt-0.5 text-meta text-ds-textMuted">創作者：{row.creator_email ?? row.teacher_id ?? "—"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(row.open_report_count ?? 0) > 0 ? (
            <StatusPill tone="danger" label={`未結檢舉 ${row.open_report_count}`} />
          ) : null}
          <StatusPill tone={statusTone(row.status)} label={statusLabel(row.status)} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ds-textMuted">
        <span className="font-semibold text-ds-heading">NT$ {Math.floor(Number(row.price) || 0).toLocaleString("zh-TW")}</span>
        <span>送出：{formatDateTime(row.created_at)}</span>
        <span>更新：{formatDateTime(row.updated_at)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={selected}
          data-testid="material-review-open"
          className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors ${
            selected
              ? "border border-ds-border bg-ds-surface text-ds-heading hover:bg-edu-page"
              : pending
                ? "bg-edu-primary text-white hover:brightness-95"
                : "border border-ds-border bg-ds-surface text-ds-heading hover:bg-edu-page"
          }`}
        >
          {selected ? "取消選取" : pending ? "開始審核" : "查看詳情"}
        </button>
        <Link
          href={`/admin/materials/${encodeURIComponent(row.id)}/activity-logs`}
          className="text-meta font-medium text-edu-primary underline"
        >
          此教材紀錄
        </Link>
        {/* internal id 是 metadata，不是主要資訊 */}
        <span className="text-caption text-ds-textSubtle">ID：{row.id}</span>
      </div>
    </article>
  );
}

function AdminMaterialsFallback() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader title="教材審核" />
      <LoadingState title="載入教材中…" />
    </section>
  );
}

export default function AdminMaterialsPage() {
  return (
    <Suspense fallback={<AdminMaterialsFallback />}>
      <AdminMaterialsContent />
    </Suspense>
  );
}
