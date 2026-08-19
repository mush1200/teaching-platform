"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityLog, ActivityLogsResponse, AdminDashboardSummary, AdminPaymentProof, AdminPaymentProofsResponse, Material, Order, OrdersListResponse, Report } from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";
import { AdminKpiCard } from "./AdminKpiCard";
import { AdminTaskCard } from "./AdminTaskCard";
import { RecentActivityList } from "./RecentActivityList";
import { RecentOrdersTable } from "./RecentOrdersTable";

type DashboardState = {
  materials: Material[];
  orders: Order[];
  reports: Report[];
  proofs: AdminPaymentProof[];
  activities: ActivityLog[];
  summary: AdminDashboardSummary | null;
  loading: boolean;
  errors: Partial<Record<"materials" | "orders" | "reports" | "proofs" | "activities" | "summary", string>>;
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
    summary: null,
    loading: true,
    errors: {},
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errors: {} }));
    const [materialsRes, ordersRes, reportsRes, proofsRes, activitiesRes, summaryRes] = await Promise.allSettled([
      apiFetch("admin/materials"),
      apiFetch("admin/orders"),
      apiFetch("admin/reports"),
      apiFetch("admin/payment-proofs?status=pending&page=1&limit=200"),
      apiFetch("admin/activity-logs?page=1&limit=8"),
      apiFetch("admin/dashboard/summary"),
    ]);

    const next: DashboardState = {
      materials: [],
      orders: [],
      reports: [],
      proofs: [],
      activities: [],
      summary: null,
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

    /** GET /admin/reports returns a JSON array (see MVP spec §11); tolerate `{ items }` if ever wrapped. */
    async function resolveReportsList(result: PromiseSettledResult<Response>): Promise<Report[]> {
      if (result.status === "rejected") {
        next.errors.reports = "無法連線至伺服器，請稍後再試。";
        return [];
      }
      if (!result.value.ok) {
        next.errors.reports = await parseApiErrorMessage(result.value);
        return [];
      }
      const payload = (await result.value.json()) as unknown;
      if (Array.isArray(payload)) return payload as Report[];
      if (
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { items?: Report[] }).items)
      ) {
        return (payload as { items: Report[] }).items;
      }
      return [];
    }

    next.materials = await resolveList<{ items?: Material[] }, Material>(materialsRes, "materials", (p) => p.items ?? []);
    next.orders = await resolveList<OrdersListResponse, Order>(ordersRes, "orders", (p) => p.items ?? []);
    next.reports = await resolveReportsList(reportsRes);
    next.proofs = await resolveList<AdminPaymentProofsResponse, AdminPaymentProof>(proofsRes, "proofs", (p) => p.items ?? []);
    next.activities = await resolveList<ActivityLogsResponse, ActivityLog>(activitiesRes, "activities", (p) => p.items ?? []);
    next.summary = (await resolveList<AdminDashboardSummary, AdminDashboardSummary>(summaryRes, "summary", (p) => [p]))[0] ?? null;
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
  const pendingProofs = state.summary?.pendingProofsCount ?? state.proofs.filter((p) => p.review_status === "pending").length;
  const pendingReports = state.summary?.pendingReportsCount ?? state.reports.filter((r) => r.status === "pending").length;
  const abnormalOrders = filteredOrders.filter((o) => o.status === "cancelled" || o.status === "rejected").length;

  const publishedMaterials = state.materials.filter((m) => m.status === "published").length;
  const totalRevenue = state.summary?.revenueAmount ?? filteredOrders.reduce((sum, o) => sum + Math.floor(Number(o.total_amount ?? o.total_price ?? 0)), 0);
  const usersCount = state.summary?.usersCount ?? new Set([
    ...filteredOrders.map((o) => o.user_id).filter(Boolean),
    ...state.reports.map((r) => r.reporter_id).filter(Boolean),
    ...state.proofs.map((p) => p.user_id).filter(Boolean),
  ]).size;

  return (
    // 區塊節奏用 canonical layout token（--layout-section-gap-md = 24px），不用任意值
    <div className="mx-auto max-w-7xl space-y-section-md">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {/* Mobile 縮小標題並隱藏副標：副標與下方待處理卡資訊重疊，且標題區在矮視窗會吃掉近三成高度 */}
          <h1 className="text-2xl font-bold text-[#1F2937] sm:text-3xl">歡迎回來，管理員！</h1>
          <p className="mt-1 hidden text-sm text-[#6B7280] sm:block">今天需要處理的事項與平台概況</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm shadow-sm">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-[#E5E7EB] px-2 py-1" />
          <span className="text-[#6B7280]">-</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-[#E5E7EB] px-2 py-1" />
        </div>
      </header>

      {/* Mobile 也維持 2 欄（原本 <640 是單欄，四張卡疊成 660px，首屏只看得到第 1 張） */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <AdminTaskCard icon="📚" title="待審核教材" count={pendingMaterials} description="等待管理員確認上架資格。" href="/admin/materials?status=pending_review" />
        <AdminTaskCard icon="🧾" title="待審核付款憑證" count={pendingProofs} description="使用者上傳付款證明待核准。" href="/admin/payment-proofs?status=pending" />
        <AdminTaskCard icon="🚩" title="待處理檢舉" count={pendingReports} description="請盡快判斷是否違反平台規範。" href="/admin/reports?status=pending" />
        <AdminTaskCard icon="⚠️" title="異常訂單" count={abnormalOrders} description="取消或異常狀態訂單需要追蹤。" href="/admin/orders?status=cancelled" />
      </section>

      {/*
        Operational awareness 緊接在待處理工作之後（IA proposal B）。
        訂單在左／活動在右：訂單牽涉金額與狀態、可直接處理，活動紀錄偏稽核軌跡。
        JSX 順序同時決定 breakpoint 以下的堆疊順序（訂單先、活動後）。
        items-start：兩張卡各自取自然高度，避免較短的一張被 stretch 出大片空白。
      */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <RecentOrdersTable orders={filteredOrders.slice(0, 8)} loading={state.loading} error={state.errors.orders ?? null} />
        <RecentActivityList items={filteredActivities.slice(0, 8)} loading={state.loading} error={state.errors.activities ?? null} />
      </div>

      {/* Platform summary：非即時可操作資訊，排在 operational awareness 之後 */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AdminKpiCard label="教材總數" value={(state.summary?.materialsCount ?? state.materials.length).toLocaleString("zh-TW")} subtext="本期累計" />
        <AdminKpiCard label="已發布教材" value={publishedMaterials.toLocaleString("zh-TW")} subtext="可銷售數量" />
        <AdminKpiCard label="訂單總數" value={(state.summary?.ordersCount ?? filteredOrders.length).toLocaleString("zh-TW")} subtext="本期累計" />
        <AdminKpiCard label="成交金額" value={`NT$ ${totalRevenue.toLocaleString("zh-TW")}`} subtext="本期累計" />
        <AdminKpiCard label="用戶總數" value={usersCount.toLocaleString("zh-TW")} subtext="去重統計" />
        <AdminKpiCard
          label="教學回饋總數"
          value={(state.summary?.reviewsCount ?? 0).toLocaleString("zh-TW")}
          subtext={`較上週 ${state.summary && state.summary.wowReviewDeltaPercent >= 0 ? "+" : ""}${state.summary?.wowReviewDeltaPercent ?? 0}%`}
        />
      </section>

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
    </div>
  );
}
