"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  ActivityLogFiltersResponse,
  ActivityLogRow,
  ActivityLogsListResponse,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
import { actorRoleLabel, describeActivity } from "../../../lib/admin-labels";
import {
  DataToolbar,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  SearchField,
} from "../../../components/ds";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 活動紀錄（Epic §8）。
 *
 * ## 這一頁改了什麼
 *
 * 舊版的主要操作是四個技術欄位輸入框（Actor ID / Action / Target Type / Target ID），
 * 每一個都要精確相等比對。也就是說：**必須先知道一個內部 id 才查得到東西**，
 * 查到之後畫面上顯示的又還是 id。那是 DB console，不是營運工具。
 *
 * 現在：
 *   - 主要搜尋是自由文字，涵蓋操作者 Email、教材標題、訂單編號、對象 Email
 *   - 每一列是一句話：「管理員 admin@x 核准了付款 · 訂單：ord_123」
 *   - 操作類型 / 操作者類型的下拉來自 `GET /admin/activity-logs/filters`
 *     （**實際出現過**的值，不是硬編清單）
 *   - 日期區間篩選
 *
 * ## 稽核能力不減
 *
 * `actor_id` / `target_id` / `meta` 一個都沒少，只是收進每列的「詳細資訊」摺疊區，
 * 以及既有的單筆詳情頁。降低 technical terminology 的 prominence ≠ 移除它。
 */

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function AdminActivityLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /*
   * `action` 用 useListQueryState 的 filter 槽位：它是這一頁的主要維度篩選。
   * `all` 代表不篩選（與 Backend 的「未帶參數」一致）。
   * allowedFilters 在拿到 filters API 之前只有 `all`，因此未知值會被安全地忽略；
   * 載入後改用實際存在的 action 清單。
   */
  const [filterMeta, setFilterMeta] = useState<ActivityLogFiltersResponse | null>(null);
  /*
   * `?.actions.map(...)` 會在 `filterMeta` 存在、但 `actions` 缺席時整頁崩掉
   * （optional chaining 只擋 `filterMeta`，`.map` 沒被擋）。頁面崩掉會被 Next 的
   * error boundary 接住並換掉整棵樹，連側欄都消失 —— 一個下拉選單的容錯問題
   * 不該讓整個後台白屏。兩層都要 guard。
   */
  const allowedActions = ["all", ...(filterMeta?.actions?.map((a) => a.action) ?? [])];

  const query = useListQueryState("/admin/activity-logs", {
    defaultFilter: "all",
    allowedFilters: allowedActions,
    filterKey: "action",
  });

  const actorRole = searchParams?.get("actor_role") ?? "";
  const from = searchParams?.get("from") ?? "";
  const to = searchParams?.get("to") ?? "";

  const [data, setData] = useState<ActivityLogsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const apiQuery = query.toApiQuery({
    actor_role: actorRole || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const setExtraParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page"); // 換篩選一律回第 1 頁（與其他清單頁同一規則）
      const qs = params.toString();
      router.replace(qs ? `/admin/activity-logs?${qs}` : "/admin/activity-logs");
    },
    [router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/activity-logs?${apiQuery}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as ActivityLogsListResponse);
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch("admin/activity-logs/filters");
        if (!res.ok) return;
        const payload = (await res.json()) as ActivityLogFiltersResponse;
        if (active) setFilterMeta(payload);
      } catch {
        /* 下拉沒載到就只用自由搜尋，不阻擋整頁 */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="活動紀錄"
        description="搜尋使用者 Email、教材名稱或訂單編號，查看平台上發生過的操作。"
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
            id="admin-activity-search"
            label="搜尋活動紀錄"
            placeholder="搜尋使用者 Email、教材名稱或訂單編號"
            value={query.search}
            onSubmit={query.setSearch}
            disabled={loading}
          />
        }
        filters={
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-meta text-ds-textMuted">
              <span>操作類型</span>
              <select
                value={query.filter}
                onChange={(event) => query.setFilter(event.target.value)}
                disabled={loading}
                data-testid="activity-action-filter"
                className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              >
                <option value="all">全部</option>
                {(filterMeta?.actions ?? []).map((row) => (
                  <option key={row.action} value={row.action}>
                    {describeActivity({ action: row.action }).raw
                      ? row.action
                      : describeActivity({ action: row.action }).sentence.replace("系統", "").trim()}
                    （{row.count}）
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-meta text-ds-textMuted">
              <span>操作者類型</span>
              <select
                value={actorRole}
                onChange={(event) => setExtraParam("actor_role", event.target.value)}
                disabled={loading}
                data-testid="activity-actor-role-filter"
                className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              >
                <option value="">全部</option>
                {(filterMeta?.actorRoles ?? []).map((row) => (
                  <option key={row.actor_role} value={row.actor_role}>
                    {actorRoleLabel(row.actor_role)}（{row.count}）
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-meta text-ds-textMuted">
              <span>起始日期</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setExtraParam("from", event.target.value)}
                disabled={loading}
                data-testid="activity-from"
                className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              />
            </label>

            <label className="flex flex-col gap-1 text-meta text-ds-textMuted">
              <span>結束日期</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setExtraParam("to", event.target.value)}
                disabled={loading}
                data-testid="activity-to"
                className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              />
            </label>
          </div>
        }
      />

      {loading ? <LoadingState title="載入活動紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="沒有符合條件的活動紀錄"
          description={query.search ? `找不到與「${query.search}」相關的操作紀錄。` : "此條件下沒有紀錄。"}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              expanded={Boolean(expanded[log.id])}
              onToggle={() => setExpanded((prev) => ({ ...prev, [log.id]: !prev[log.id] }))}
            />
          ))}

          {pagination ? (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages ?? 1}
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

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: ActivityLogRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const described = describeActivity(log);

  return (
    <article
      data-testid="activity-log-row"
      className="rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card-soft"
    >
      <p className={`text-title text-ds-heading ${described.raw ? "font-mono text-sm" : ""}`}>
        {described.sentence}
      </p>
      {described.target ? <p className="mt-0.5 text-body text-ds-body">{described.target}</p> : null}
      <p className="mt-1 text-meta text-ds-textMuted">{formatDateTime(log.created_at)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-meta">
        {log.target_type === "material" && log.target_id ? (
          <Link
            href={`/admin/materials/${encodeURIComponent(log.target_id)}/activity-logs`}
            className="font-medium text-edu-primary underline"
          >
            此教材紀錄
          </Link>
        ) : null}
        {log.target_type === "order" && log.target_id ? (
          <Link
            href={`/admin/orders/${encodeURIComponent(log.target_id)}/activity-logs`}
            className="font-medium text-edu-primary underline"
          >
            此訂單紀錄
          </Link>
        ) : null}
        {log.actor_id ? (
          <Link
            href={`/admin/users/${encodeURIComponent(log.actor_id)}/activity-logs`}
            className="font-medium text-edu-primary underline"
          >
            此操作者紀錄
          </Link>
        ) : null}
        <Link
          href={`/admin/activity-logs/${encodeURIComponent(log.id)}`}
          className="font-medium text-edu-primary underline"
        >
          單筆詳情
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          data-testid="activity-log-details-toggle"
          className="font-medium text-ds-textMuted underline"
        >
          {expanded ? "隱藏詳細資訊" : "詳細資訊"}
        </button>
      </div>

      {expanded ? (
        /* Technical metadata：保留完整稽核資訊，只是不再是畫面上最顯眼的東西。 */
        <dl
          data-testid="activity-log-details"
          className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl bg-edu-page p-3 font-mono text-xs text-ds-textMuted sm:grid-cols-2"
        >
          <div>
            <dt className="inline">action：</dt>
            <dd className="inline">{log.action ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline">log id：</dt>
            <dd className="inline">{log.id}</dd>
          </div>
          <div>
            <dt className="inline">actor_id：</dt>
            <dd className="inline">{log.actor_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline">actor_role：</dt>
            <dd className="inline">{log.actor_role ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline">target_type：</dt>
            <dd className="inline">{log.target_type ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline">target_id：</dt>
            <dd className="inline">{log.target_id ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt>meta：</dt>
            <dd>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.meta ?? {}, null, 2)}</pre>
            </dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}

function AdminActivityLogsFallback() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader title="活動紀錄" />
      <LoadingState title="載入活動紀錄中…" />
    </section>
  );
}

export default function AdminActivityLogsPage() {
  return (
    <Suspense fallback={<AdminActivityLogsFallback />}>
      <AdminActivityLogsContent />
    </Suspense>
  );
}
