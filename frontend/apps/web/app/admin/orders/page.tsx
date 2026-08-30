"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Order, OrdersListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
/*
 * 狀態文案與 tone 來自 `lib/admin-labels.ts`（本檔原本的 local function 已搬過去）。
 * Dashboard 的「需要注意的訂單」顯示同一組徽章，兩處必須是同一份 mapping。
 */
import {
  adminOrderOperationalStatusLabel,
  adminOrderOperationalStatusTone,
} from "../../../lib/admin-labels";
import {
  AccentTextLink,
  DataToolbar,
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  Pagination,
  SearchField,
  StatusPill,
  SurfaceCard,
} from "../../../components/ds";

/**
 * 篩選值 = Backend `?status=` token = `services/adminOrders.service.js` 的
 * `OPERATIONAL_STATUSES`，三者 1:1。**不再有任何 UI→API 的 mapping 函式** ——
 * 舊版的 `mapUiStatusToApiStatus()` 把「待審核」轉成 dead status `paid`（0 rows），
 * 而 `paid` 的歷史語意其實是「已核准」，方向本身就是反的。
 *
 * 這裡篩的是 Admin operational state（`orders.status` + 付款憑證衍生），
 * 不是 `orders.status` 原始值。
 */
const ALL = "all";

const FILTER_OPTIONS = [
  { value: ALL, label: "全部" },
  { value: "awaiting_payment", label: "待付款" },
  { value: "pending_review", label: "待審核" },
  { value: "payment_rejected", label: "付款被退回" },
  { value: "approved", label: "已核准" },
  { value: "cancelled", label: "已取消" },
] as const;

const FILTERS = FILTER_OPTIONS.map((o) => o.value);

function formatMoney(value?: number | null) {
  return `NT$ ${Math.floor(Number(value ?? 0)).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function AdminOrdersContent() {
  /*
   * 篩選 / 搜尋 / 頁碼全部住在 URL，與其他三個 Admin 清單頁**同一個 hook**。
   * 這頁原本自己手寫了一份 `status` 解析與 `router.replace`，行為雖然一樣，
   * 但每多一份就多一個會各自漂移的實作。
   *
   * 非法 token（例如 `?status=banana`）一律 fallback 成「全部」，且**不會**被送到
   * API —— 那只會拿到一個可預期的 400。
   */
  const query = useListQueryState("/admin/orders", {
    defaultFilter: ALL,
    allowedFilters: FILTERS,
  });

  const [items, setItems] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<OrdersListResponse["pagination"]>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiQuery = query.toApiQuery();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/orders?${apiQuery}`);
      if (!res.ok) {
        setItems([]);
        setPagination(undefined);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as OrdersListResponse;
      setItems(data.items ?? []);
      setPagination(data.pagination);
    } catch {
      setItems([]);
      setPagination(undefined);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      {/*
       * 訂單管理是 Reference / Investigation 型頁面，不是佇列 ——
       * 依 `docs/admin-information-architecture.md` §7，這裡**不提供**重新整理按鈕。
       */}
      <PageHeader
        title="訂單管理"
        description="用訂單編號或購買者 Email 找到那一張訂單，確認它現在卡在哪一關。"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <AccentTextLink href="/admin/materials">教材審核</AccentTextLink>
        <AccentTextLink href="/admin/activity-logs">活動紀錄</AccentTextLink>
      </div>

      <DataToolbar
        search={
          <SearchField
            id="admin-order-search"
            label="搜尋訂單"
            placeholder="搜尋訂單編號或購買者 Email"
            value={query.search}
            onSubmit={query.setSearch}
            disabled={loading}
          />
        }
        filters={
          <FilterTabs
            ariaLabel="訂單狀態篩選"
            options={FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={query.filter}
            onChange={query.setFilter}
            disabled={loading}
          />
        }
      />

      {loading ? <LoadingState title="載入訂單中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="沒有符合條件的訂單"
          description={
            query.search
              ? `找不到符合「${query.search}」的訂單。可以試試完整的訂單編號，或購買者的 Email。`
              : "此狀態目前沒有訂單。"
          }
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((o) => (
            <SurfaceCard key={o.id} data-testid="admin-order-row" className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 break-all text-sm font-semibold text-ds-heading">訂單 {o.id}</p>
                <span data-testid="admin-order-status-badge">
                  <StatusPill
                    label={adminOrderOperationalStatusLabel(o.operational_status)}
                    tone={adminOrderOperationalStatusTone(o.operational_status)}
                  />
                </span>
              </div>
              {/*
               * 買家 Email 是 `?q=` 的搜尋面之一，因此必須看得到 ——
               * 搜尋得到卻不顯示，Admin 無從確認自己找對了人。
               */}
              <p className="break-all text-sm text-ds-textMuted">購買者：{o.buyer_email ?? "—"}</p>
              <p className="text-sm text-ds-textMuted">金額：{formatMoney(o.total_amount ?? o.total_price)}</p>
              <p className="text-sm text-ds-textMuted">建立時間：{formatDateTime(o.created_at)}</p>
              <Link href={`/admin/orders/${encodeURIComponent(o.id)}/activity-logs`}>
                <span className="text-xs font-medium text-edu-primary underline">此訂單活動紀錄</span>
              </Link>
            </SurfaceCard>
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
    </section>
  );
}

function AdminOrdersFallback() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <PageHeader title="訂單管理" />
      <LoadingState title="載入訂單中…" />
    </section>
  );
}

/** `useSearchParams` 需要 Suspense 邊界（與 /admin/payment-proofs 同樣的作法）。 */
export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<AdminOrdersFallback />}>
      <AdminOrdersContent />
    </Suspense>
  );
}
