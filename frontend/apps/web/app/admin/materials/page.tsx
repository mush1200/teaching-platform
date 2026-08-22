"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
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
  SearchField,
  StatusPill,
} from "../../../components/ds";
import { groupMaterialFeatures } from "@/src/constants/materialFeatures";

/**
 * 教材審核佇列（Epic §5 / §6）。
 *
 * ## 篩選對齊真實 domain state
 *
 * `materials.status` 只有三個值（`pending_review` / `published` / `unpublished`）。
 * 這裡**不**提供「審核中」「需修改」「已拒絕」—— Backend 沒有那些狀態，
 * 做出來會是永遠 0 筆的死選項。
 *
 * ## 預設 filter
 *
 * 側欄的入口是 `/admin/materials?status=pending_review`，所以帶著 status 進來的
 * 情境已經被涵蓋。**直接開 `/admin/materials`（無 query）時預設「全部」**：
 * 既有的 e2e（`admin.spec.ts`）與 `ADMIN_ROUTES` 都以無參數路徑開啟此頁並
 * 期待看到所有 fixture，把預設改成 pending_review 會改變那個既有契約。
 * 「優先呈現需要行動的教材」由側欄入口與 filter chip 上的待審數量達成。
 *
 * ## 分頁
 *
 * Server-side（`page` / `limit`），URL 為唯一狀態來源，換篩選／換搜尋一律回第 1 頁 ——
 * 這些規則全部在 `useListQueryState`，四個 Admin 清單頁共用。
 */

const ALL = "all";
const FILTERS = [ALL, "pending_review", "published", "unpublished"] as const;

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

function AdminMaterialsContent() {
  const query = useListQueryState("/admin/materials", {
    defaultFilter: ALL,
    allowedFilters: FILTERS,
  });

  const [data, setData] = useState<AdminMaterialsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("created_desc");

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
    { value: ALL, label: "全部", count: counts?.total },
    { value: "pending_review", label: "待審核", count: counts?.pending_review },
    { value: "published", label: "已上架", count: counts?.published },
    { value: "unpublished", label: "已下架", count: counts?.unpublished },
  ];

  const items: AdminMaterialRow[] = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="教材審核"
        description="依狀態、標題或創作者搜尋待審教材；清單為伺服器端分頁。"
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
          /* SearchField 是送出制（Enter / 按鈕），不逐字打 API —— 見 components/ds/DataToolbar */
          <SearchField
            id="admin-materials-search"
            label="搜尋教材"
            placeholder="搜尋教材標題或創作者 Email"
            value={query.search}
            onSubmit={query.setSearch}
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
            ariaLabel="教材狀態篩選"
            options={filterOptions}
            value={query.filter}
            onChange={query.setFilter}
            disabled={loading}
          />
        }
      />

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="沒有符合條件的教材"
          description={
            query.search
              ? `找不到符合「${query.search}」的教材，可以改用教材標題或創作者 Email 再試一次。`
              : "此狀態目前沒有教材。"
          }
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((m) => {
            const features = Object.values(groupMaterialFeatures(m.material_features)).flat();
            return (
              <article
                key={m.id}
                data-testid="admin-material-row"
                className="space-y-3 rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-title text-ds-heading">{m.title}</p>
                    <p className="mt-0.5 text-meta text-ds-textMuted">
                      創作者：{m.creator_email ?? m.teacher_id ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(m.open_report_count ?? 0) > 0 ? (
                      <StatusPill tone="danger" label={`未結檢舉 ${m.open_report_count}`} />
                    ) : null}
                    <StatusPill tone={statusTone(m.status)} label={statusLabel(m.status)} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ds-textMuted">
                  <span>NT$ {Math.floor(Number(m.price) || 0)}</span>
                  {m.created_at ? <span>建立：{new Date(m.created_at).toLocaleDateString("zh-TW")}</span> : null}
                  {m.updated_at ? <span>更新：{new Date(m.updated_at).toLocaleDateString("zh-TW")}</span> : null}
                </div>

                {features.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {features.map((feature) => (
                      <span
                        key={`${m.id}-${feature}`}
                        className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 text-meta">
                  <Link
                    href={`/admin/materials/${encodeURIComponent(m.id)}/reports`}
                    className="font-medium text-edu-primary underline"
                  >
                    此教材檢舉
                  </Link>
                  <Link
                    href={`/admin/materials/${encodeURIComponent(m.id)}/activity-logs`}
                    className="font-medium text-edu-primary underline"
                  >
                    此教材活動紀錄
                  </Link>
                  {/* internal id 保留在 detail metadata，不是主要資訊 */}
                  <span className="text-ds-textSubtle">ID：{m.id}</span>
                </div>
              </article>
            );
          })}

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
    </section>
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

/** `useSearchParams` 需要 Suspense 邊界（與其他 Admin 清單頁一致）。 */
export default function AdminMaterialsPage() {
  return (
    <Suspense fallback={<AdminMaterialsFallback />}>
      <AdminMaterialsContent />
    </Suspense>
  );
}
