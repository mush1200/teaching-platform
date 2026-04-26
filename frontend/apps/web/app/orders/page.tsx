"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import type { Order, OrderDetailResponse, OrderItemRow, OrdersListResponse } from "../../lib/api-types";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";

type UiOrder = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
};

function statusLabel(status: string): string {
  if (status === "pending_payment") return "待付款";
  if (status === "approved" || status === "completed" || status === "paid") return "已付款";
  if (status === "rejected") return "已拒絕";
  return "已取消/其他";
}

function statusClass(status: string): string {
  if (status === "pending_payment") return "bg-[#FFE4E6] text-[#FF6B73]";
  if (status === "approved" || status === "completed" || status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

export default function OrdersPage() {
  const token = useMemo(() => getStoredToken(), []);
  const [orders, setOrders] = useState<UiOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItemRow[]>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("orders/my");
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setOrders([]);
        return;
      }
      const payload = (await res.json()) as OrdersListResponse;
      const list = (payload.items ?? []).map((item: Order) => ({
        id: item.id,
        status: item.status,
        total: Math.floor(Number(item.total_amount ?? item.total_price ?? 0) || 0),
        createdAt: item.created_at ?? "-",
      }));
      setOrders(list);
    } catch {
      setError("載入訂單失敗，請稍後再試。");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function toggleDetail(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (orderItems[orderId]) return;
    setDetailLoadingId(orderId);
    setDetailError((prev) => ({ ...prev, [orderId]: "" }));
    try {
      const res = await apiFetch(`orders/${encodeURIComponent(orderId)}`);
      if (!res.ok) {
        const message = await parseApiErrorMessage(res);
        setDetailError((prev) => ({ ...prev, [orderId]: message }));
        return;
      }
      const payload = (await res.json()) as OrderDetailResponse;
      setOrderItems((prev) => ({ ...prev, [orderId]: payload.items ?? [] }));
    } catch {
      setDetailError((prev) => ({ ...prev, [orderId]: "載入訂單內容失敗。" }));
    } finally {
      setDetailLoadingId(null);
    }
  }

  return (
    <AppShell withBottomNav>
      <MobileHeader title="我的訂單" backHref="/materials" right="none" />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-28 pt-4 sm:px-6">
        {!token ? (
          <Card className="text-center">
            <p className="font-semibold text-[#1F2937]">請先登入</p>
            <p className="mt-1 text-sm text-[#6B7280]">登入後可查看訂單與付款狀態。</p>
            <Link href={`/login?redirect=${encodeURIComponent("/orders")}`} className="mt-4 inline-block">
              <Button>前往登入</Button>
            </Link>
          </Card>
        ) : null}

        {token ? (
          <>
            <Card>
              <h1 className="text-xl font-bold text-[#1F2937]">訂單列表</h1>
              <p className="mt-1 text-sm text-[#6B7280]">可展開每筆訂單查看教材明細、數量與金額。</p>
            </Card>
            {loading ? <Card>載入中…</Card> : null}
            {!loading && error ? <Card>{error}</Card> : null}
            {!loading && !error && orders.length === 0 ? <Card>目前尚無訂單。</Card> : null}
            {!loading && !error && orders.map((o) => (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#1F2937]">訂單 {o.id}</p>
                    <p className="mt-1 text-xs text-[#6B7280]">{o.createdAt}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(o.status)}`}>
                    {statusLabel(o.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[#1F2937]">金額：NT${o.total.toLocaleString()}</p>
                <div className="mt-3">
                  <Button variant="ghost" fullWidth onClick={() => void toggleDetail(o.id)}>
                    {expandedId === o.id ? "收合訂單內容" : "查看訂單內容"}
                  </Button>
                </div>

                {expandedId === o.id ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {detailLoadingId === o.id ? <p className="text-sm text-slate-600">載入明細中…</p> : null}
                    {detailError[o.id] ? <p className="text-sm text-rose-600">{detailError[o.id]}</p> : null}
                    {!detailLoadingId && !detailError[o.id] ? (
                      (orderItems[o.id] ?? []).length > 0 ? (
                        <div className="space-y-2">
                          {(orderItems[o.id] ?? []).map((item) => (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                              <p className="font-medium text-slate-900">{item.material_title ?? `教材 ${item.material_id}`}</p>
                              <p className="text-xs text-slate-600">數量：{item.quantity ?? 1}</p>
                              <p className="text-xs text-slate-600">單價：NT${Math.floor(Number(item.unit_price ?? 0)).toLocaleString()}</p>
                              <p className="text-xs font-semibold text-slate-800">
                                小計：NT${Math.floor(Number(item.subtotal ?? 0)).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600">此訂單目前沒有明細資料。</p>
                      )
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex gap-2">
                  <Link href={`/orders/${encodeURIComponent(o.id)}/upload-proof`} className="flex-1">
                    <Button variant="outline" fullWidth>
                      上傳付款憑證
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
