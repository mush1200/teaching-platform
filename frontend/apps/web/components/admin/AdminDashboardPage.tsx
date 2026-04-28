"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityLog, ActivityLogsResponse, AdminPaymentProof, AdminPaymentProofsResponse, Material, Order, OrdersListResponse, Report } from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";
import { mockReviews } from "../../lib/mock-data";
import { AdminKpiCard } from "./AdminKpiCard";
import { AdminQuickActions } from "./AdminQuickActions";
import { AdminTaskCard } from "./AdminTaskCard";
import { RecentActivityList } from "./RecentActivityList";
import { RecentOrdersTable } from "./RecentOrdersTable";

type DashboardState = {
  materials: Material[];
  orders: Order[];
  reports: Report[];
  proofs: AdminPaymentProof[];
  activities: ActivityLog[];
  loading: boolean;
  errors: Partial<Record<"materials" | "orders" | "reports" | "proofs" | "activities", string>>;
};

function toDateInput(raw?: Date): string {
  if (!raw) return "";
  return raw.toISOString().slice(0, 10);
}

function parseDate(value?: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function AdminDashboardPage() {
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)));
  const [toDate, setToDate] = useState(toDateInput(new Date()));
  const [state, setState] = useState<DashboardState>({
    materials: [],
    orders: [],
    reports: [],
    proofs: [],
    activities: [],
    loading: true,
    errors: {},
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errors: {} }));
    const [materialsRes, ordersRes, reportsRes, proofsRes, activitiesRes] = await Promise.allSettled([
      apiFetch("admin/materials"),
      apiFetch("admin/orders"),
      apiFetch("admin/reports"),
      apiFetch("admin/payment-proofs?status=pending&page=1&limit=200"),
      apiFetch("admin/activity-logs?page=1&limit=8"),
    ]);

    const next: DashboardState = {
      materials: [],
      orders: [],
      reports: [],
      proofs: [],
      activities: [],
      loading: false,
      errors: {},
    };

    async function resolveList<P, T>(
      result: PromiseSettledResult<Response>,
      key: keyof DashboardState["errors"],
      pick: (payload: P) => T[],
    ): Promise<T[]> {
      if (result.status === "rejected") {
        next.errors[key] = "無法連線至伺服器，請稍後再試。";
        return [];
      }
      if (!result.value.ok) {
        next.errors[key] = await parseApiErrorMessage(result.value);
        return [];
      }
      const payload = (await result.value.json()) as P;
      return pick(payload);
    }

    next.materials = await resolveList<{ items?: Material[] }, Material>(materialsRes, "materials", (p) => p.items ?? []);
    next.orders = await resolveList<OrdersListResponse, Order>(ordersRes, "orders", (p) => p.items ?? []);
    next.reports = await resolveList<{ items?: Report[] }, Report>(reportsRes, "reports", (p) => p.items ?? []);
    next.proofs = await resolveList<AdminPaymentProofsResponse, AdminPaymentProof>(proofsRes, "proofs", (p) => p.items ?? []);
    next.activities = await resolveList<ActivityLogsResponse, ActivityLog>(activitiesRes, "activities", (p) => p.items ?? []);
    setState(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeStart = parseDate(fromDate);
  const rangeEnd = parseDate(toDate);

  const filteredOrders = useMemo(() => {
    return state.orders.filter((o) => {
      const current = parseDate(o.created_at);
      if (current == null || rangeStart == null || rangeEnd == null) return true;
      return current >= rangeStart && current <= rangeEnd + 1000 * 60 * 60 * 24;
    });
  }, [state.orders, rangeEnd, rangeStart]);

  const filteredActivities = useMemo(() => {
    return state.activities.filter((a) => {
      const current = parseDate(a.created_at);
      if (current == null || rangeStart == null || rangeEnd == null) return true;
      return current >= rangeStart && current <= rangeEnd + 1000 * 60 * 60 * 24;
    });
  }, [rangeEnd, rangeStart, state.activities]);

  const pendingMaterials = state.materials.filter((m) => m.status === "pending_review").length;
  const pendingProofs = state.proofs.filter((p) => p.review_status === "pending").length;
  const pendingReports = state.reports.filter((r) => r.status === "pending").length;
  const abnormalOrders = filteredOrders.filter((o) => o.status === "cancelled" || o.status === "rejected").length;

  const publishedMaterials = state.materials.filter((m) => m.status === "published").length;
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + Math.floor(Number(o.total_amount ?? o.total_price ?? 0)), 0);
  const usersCount = new Set([
    ...filteredOrders.map((o) => o.user_id).filter(Boolean),
    ...state.reports.map((r) => r.reporter_id).filter(Boolean),
    ...state.proofs.map((p) => p.user_id).filter(Boolean),
  ]).size;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1F2937]">歡迎回來，管理員！</h1>
          <p className="mt-1 text-sm text-[#6B7280]">今天需要處理的事項與平台概況</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm shadow-sm">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-[#E5E7EB] px-2 py-1" />
          <span className="text-[#6B7280]">-</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-[#E5E7EB] px-2 py-1" />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminTaskCard icon="📚" title="待審核教材" count={pendingMaterials} description="等待管理員確認上架資格。" href="/admin/materials?status=pending_review" />
        <AdminTaskCard icon="🧾" title="待審核付款憑證" count={pendingProofs} description="使用者上傳付款證明待核准。" href="/admin/payment-proofs?status=pending" />
        <AdminTaskCard icon="🚩" title="待處理檢舉" count={pendingReports} description="請盡快判斷是否違反平台規範。" href="/admin/reports?status=pending" />
        <AdminTaskCard icon="⚠️" title="異常訂單" count={abnormalOrders} description="取消或異常狀態訂單需要追蹤。" href="/admin/orders?status=cancelled" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AdminKpiCard label="教材總數" value={state.materials.length.toLocaleString("zh-TW")} subtext="本期累計" />
        <AdminKpiCard label="已發布教材" value={publishedMaterials.toLocaleString("zh-TW")} subtext="可銷售數量" />
        <AdminKpiCard label="訂單總數" value={filteredOrders.length.toLocaleString("zh-TW")} subtext="本期累計" />
        <AdminKpiCard label="成交金額" value={`NT$ ${totalRevenue.toLocaleString("zh-TW")}`} subtext="本期累計" />
        <AdminKpiCard label="用戶總數" value={usersCount.toLocaleString("zh-TW")} subtext="去重統計" />
        <AdminKpiCard label="評論總數" value={mockReviews.length.toLocaleString("zh-TW")} subtext="較上週 +12%" />
      </section>

      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <h2 className="mb-3 text-base font-bold text-[#1F2937]">快速操作</h2>
        <AdminQuickActions />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <RecentActivityList items={filteredActivities.slice(0, 8)} loading={state.loading} error={state.errors.activities ?? null} />
        <RecentOrdersTable orders={filteredOrders.slice(0, 5)} loading={state.loading} error={state.errors.orders ?? null} />
      </div>

      {!state.loading && Object.keys(state.errors).length > 0 ? (
        <p className="text-sm text-[#B91C1C]">
          部分區塊載入失敗：
          {Object.entries(state.errors)
            .map(([k]) => k)
            .join("、")}
          。可{" "}
          <button type="button" onClick={() => void load()} className="font-semibold text-[#6C63FF] underline">
            重新載入
          </button>
          。
        </p>
      ) : null}

      <div className="flex justify-end">
        <Link href="/admin/activity-logs" className="text-sm font-semibold text-[#6C63FF] hover:underline">
          查看活動紀錄
        </Link>
      </div>
    </div>
  );
}
