"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState, SelectField } from "@teaching-platform/ui";
import Link from "next/link";
import type { Order, OrdersListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待付款", value: "pending_payment" },
  { label: "已付款", value: "paid" },
  { label: "已核准", value: "approved" },
  { label: "已取消", value: "cancelled" },
];

function statusLabel(status: string): string {
  if (status === "pending_payment") return "待付款";
  if (status === "paid") return "已付款";
  if (status === "approved") return "已核准";
  if (status === "cancelled") return "已取消";
  return status;
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    if (status === "all") return "admin/orders";
    return `admin/orders?status=${encodeURIComponent(status)}`;
  }, [status]);

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
      <SelectField id="admin-order-status" label="狀態篩選" value={status} options={statusOptions} onValueChange={setStatus} />

      {loading ? <LoadingState title="載入訂單中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有訂單資料" description="目前查無符合條件的訂單。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((o) => (
            <article key={o.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">訂單 {o.id}</p>
              <p className="text-sm text-slate-700">狀態：{statusLabel(o.status)}</p>
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
