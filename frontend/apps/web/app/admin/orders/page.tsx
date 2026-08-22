"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import Link from "next/link";
import type { Order, OrdersListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

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

const statusOptions = [
  { label: "全部", value: ALL },
  { label: "待付款", value: "awaiting_payment" },
  { label: "待審核", value: "pending_review" },
  { label: "付款被退回", value: "payment_rejected" },
  { label: "已核准", value: "approved" },
  { label: "已取消", value: "cancelled" },
];

const VALID_STATUSES = new Set(statusOptions.map((o) => o.value));

/**
 * 列徽章一律讀 Backend 的 `operational_status`，不再自行判讀 `orders.status`。
 *
 * Admin 用「已核准」而非「已完成」：人工轉帳流程裡 admin 只核准了憑證，
 * 「完成」是買家視角的用語（buyer `/orders` 維持「已完成」，本輪刻意不動）。
 */
function operationalStatusLabel(status?: string): string {
  if (status === "awaiting_payment") return "待付款";
  if (status === "pending_review") return "待審核";
  if (status === "payment_rejected") return "付款被退回";
  if (status === "approved") return "已核准";
  if (status === "cancelled") return "已取消";
  // Backend 永遠回五個值之一；真的落到這裡代表 API 契約壞了，顯示原值比顯示錯的中文安全。
  return status ?? "－";
}

function AdminOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /*
   * URL 是篩選狀態的唯一來源：dropdown、API request、deep-link、重新整理、書籤
   * 因此不可能各自解讀出不同的值。非法 token（例如 `?status=banana`）一律 fallback
   * 成「全部」，且**不會**被送到 API —— 那只會拿到一個可預期的 400。
   */
  const status = useMemo(() => {
    const raw = searchParams?.get("status") ?? "";
    return VALID_STATUSES.has(raw) ? raw : ALL;
  }, [searchParams]);

  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    if (status === ALL) return "admin/orders";
    return `admin/orders?status=${encodeURIComponent(status)}`;
  }, [status]);

  const handleStatusChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === ALL) params.delete("status");
      else params.set("status", next);
      const qs = params.toString();
      // replace（非 push）：切換篩選不該在瀏覽器歷史堆出一長串條目。
      router.replace(qs ? `/admin/orders?${qs}` : "/admin/orders");
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(query);
      if (!res.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as OrdersListResponse;
      setItems(data.items ?? []);
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">管理員訂單列表</h1>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/materials">
          <span className="font-medium text-indigo-600 underline">教材列表</span>
        </Link>
        <Link href="/admin/activity-logs">
          <span className="font-medium text-indigo-600 underline">活動紀錄</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="admin-order-status" className="text-sm font-medium text-slate-700">
          狀態篩選
        </label>
        <select
          id="admin-order-status"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? <LoadingState title="載入訂單中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有訂單資料" description="目前查無符合條件的訂單。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((o) => (
            <article
              key={o.id}
              data-testid="admin-order-row"
              className="space-y-2 rounded-[var(--radius-card-default)] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card-default)]"
            >
              <p className="text-sm font-semibold text-slate-900">訂單 {o.id}</p>
              <p className="text-sm text-slate-700">
                狀態：
                <span data-testid="admin-order-status-badge">{operationalStatusLabel(o.operational_status)}</span>
              </p>
              <p className="text-sm text-slate-700">金額：NT$ {Math.floor(Number(o.total_amount ?? o.total_price ?? 0))}</p>
              <Link href={`/admin/orders/${encodeURIComponent(o.id)}/activity-logs`}>
                <span className="text-xs font-medium text-indigo-600 underline">此訂單活動紀錄</span>
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AdminOrdersFallback() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">管理員訂單列表</h1>
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
