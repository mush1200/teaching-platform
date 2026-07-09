"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SelectField, SurfaceCard } from "@teaching-platform/ui";
import type {
  CreatorSalesByMaterial,
  CreatorSalesListResponse,
  CreatorSalesRecord,
  CreatorSalesSummary,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "已成交（approved/completed）", value: "all" },
  { label: "approved", value: "approved" },
  { label: "completed", value: "completed" },
  { label: "pending_payment", value: "pending_payment" },
  { label: "rejected", value: "rejected" },
];

const PAGE_SIZE = 10;

function formatMoney(value: number) {
  return `NT$ ${Math.floor(Number(value) || 0).toLocaleString("zh-TW")}`;
}

function toDateInput(raw?: string | null) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

type MonthlyBucket = {
  month: string;
  soldUnits: number;
  revenue: number;
};

function formatMonth(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildLastSixMonthKeys() {
  const out: string[] = [];
  const now = new Date();
  now.setDate(1);
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setMonth(now.getMonth() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function buildSalesQuery(params: {
  status: string;
  fromDate: string;
  toDate: string;
  materialId: string;
  page?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.fromDate) q.set("from", params.fromDate);
  if (params.toDate) q.set("to", params.toDate);
  if (params.materialId) q.set("materialId", params.materialId);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  return q.toString();
}

function CreatorSalesPageContent() {
  const searchParams = useSearchParams();
  const recordsSectionRef = useRef<HTMLDivElement | null>(null);
  const tab = searchParams.get("tab");
  const [summary, setSummary] = useState<CreatorSalesSummary | null>(null);
  const [materials, setMaterials] = useState<CreatorSalesByMaterial[]>([]);
  const [records, setRecords] = useState<CreatorSalesRecord[]>([]);
  const [recordsTotalPages, setRecordsTotalPages] = useState(1);
  const [recordsTotalItems, setRecordsTotalItems] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendWindowDays, setTrendWindowDays] = useState<7 | 14 | 30>(14);

  const materialOptions = useMemo(() => {
    const base = [{ label: "全部教材", value: "all" }];
    const rest = materials.map((m) => ({ label: `${m.title}（${m.soldUnits} 份）`, value: m.materialId }));
    return [...base, ...rest];
  }, [materials]);

  const monthlyBuckets = useMemo<MonthlyBucket[]>(() => {
    if (!summary?.trend) return [];
    const map = new Map<string, MonthlyBucket>();
    for (const item of summary.trend) {
      const key = formatMonth(item.day);
      const existing = map.get(key) ?? { month: key, soldUnits: 0, revenue: 0 };
      existing.soldUnits += Number(item.soldUnits || 0);
      existing.revenue += Number(item.revenue || 0);
      map.set(key, existing);
    }
    const keys = buildLastSixMonthKeys();
    return keys.map((key) => map.get(key) ?? { month: key, soldUnits: 0, revenue: 0 });
  }, [summary?.trend]);

  const topMaterials = useMemo(() => {
    return [...materials]
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
      .slice(0, 5);
  }, [materials]);

  const chartRows = useMemo(() => {
    const rows = summary?.trend?.slice(-trendWindowDays) ?? [];
    const maxRevenue = Math.max(1, ...rows.map((r) => Number(r.revenue || 0)));
    const maxUnits = Math.max(1, ...rows.map((r) => Number(r.soldUnits || 0)));
    return rows.map((r) => ({
      day: toDateInput(r.day),
      soldUnits: Number(r.soldUnits || 0),
      revenue: Number(r.revenue || 0),
      unitHeightPct: Math.round((Number(r.soldUnits || 0) / maxUnits) * 100),
      revenueHeightPct: Math.round((Number(r.revenue || 0) / maxRevenue) * 100),
    }));
  }, [summary?.trend, trendWindowDays]);

  const revenueExtremes = useMemo(() => {
    if (chartRows.length === 0) return null;
    let max = chartRows[0];
    let min = chartRows[0];
    for (const row of chartRows) {
      if (row.revenue > max.revenue) max = row;
      if (row.revenue < min.revenue) min = row;
    }
    return {
      maxDay: max.day,
      maxRevenue: max.revenue,
      minDay: min.day,
      minRevenue: min.revenue,
    };
  }, [chartRows]);

  useEffect(() => {
    if (tab === "records") {
      recordsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [tab, loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summaryQuery = buildSalesQuery({
        status: statusFilter,
        fromDate,
        toDate,
        materialId: "",
      });
      const materialQuery = buildSalesQuery({
        status: statusFilter,
        fromDate,
        toDate,
        materialId: "",
        page: 1,
        limit: 100,
      });
      const recordsQuery = buildSalesQuery({
        status: statusFilter,
        fromDate,
        toDate,
        materialId: materialFilter === "all" ? "" : materialFilter,
        page: recordsPage,
        limit: PAGE_SIZE,
      });

      const [summaryRes, materialsRes, recordsRes] = await Promise.all([
        apiFetch(`teacher/sales/summary?${summaryQuery}`),
        apiFetch(`teacher/sales/materials?${materialQuery}`),
        apiFetch(`teacher/sales/records?${recordsQuery}`),
      ]);

      if (!summaryRes.ok) {
        setError(await parseApiErrorMessage(summaryRes));
        setSummary(null);
        setMaterials([]);
        setRecords([]);
        return;
      }
      if (!materialsRes.ok) {
        setError(await parseApiErrorMessage(materialsRes));
        setSummary(null);
        setMaterials([]);
        setRecords([]);
        return;
      }
      if (!recordsRes.ok) {
        setError(await parseApiErrorMessage(recordsRes));
        setSummary(null);
        setMaterials([]);
        setRecords([]);
        return;
      }

      const summaryPayload = (await summaryRes.json()) as CreatorSalesSummary;
      const materialsPayload = (await materialsRes.json()) as CreatorSalesListResponse<CreatorSalesByMaterial>;
      const recordsPayload = (await recordsRes.json()) as CreatorSalesListResponse<CreatorSalesRecord>;

      setSummary(summaryPayload);
      setMaterials(Array.isArray(materialsPayload.items) ? materialsPayload.items : []);
      const nextRecords = Array.isArray(recordsPayload.items) ? recordsPayload.items : [];
      setRecords(nextRecords);
      setRecordsTotalPages(Math.max(1, recordsPayload.pagination?.totalPages ?? 1));
      setRecordsTotalItems(recordsPayload.pagination?.total ?? nextRecords.length);
    } catch {
      setError("無法連線至伺服器，請稍後再試。");
      setSummary(null);
      setMaterials([]);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, materialFilter, recordsPage, statusFilter, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setRecordsPage(1);
  }, [statusFilter, materialFilter, fromDate, toDate]);

  function exportCsv() {
    const headers = [
      "orderId",
      "orderItemId",
      "materialId",
      "materialTitle",
      "quantity",
      "unitPrice",
      "subtotal",
      "orderStatus",
      "createdAt",
      "paidAt",
      "buyerId",
    ];
    const rows = records.map((item) => [
      item.orderId,
      item.orderItemId,
      item.materialId,
      item.materialTitle,
      String(item.quantity),
      String(item.unitPrice),
      String(item.subtotal),
      item.orderStatus,
      item.createdAt ?? "",
      item.paidAt ?? "",
      item.buyerId ?? "",
    ]);
    const content = [headers, ...rows]
      .map((cols) =>
        cols
          .map((cell) => {
            const safe = String(cell ?? "").replaceAll('"', '""');
            return `"${safe}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creator-sales-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTopMaterialsCsv() {
    const headers = ["rank", "materialId", "title", "soldUnits", "revenue", "lastSoldAt"];
    const rows = topMaterials.map((item, index) => [
      String(index + 1),
      item.materialId,
      item.title,
      String(item.soldUnits),
      String(item.revenue),
      item.lastSoldAt ?? "",
    ]);
    const content = [headers, ...rows]
      .map((cols) =>
        cols
          .map((cell) => {
            const safe = String(cell ?? "").replaceAll('"', '""');
            return `"${safe}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creator-top-materials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">{tab === "records" ? "銷售紀錄" : "教材銷售中心"}</h1>
          <p className="text-sm text-slate-600">
            {tab === "records" ? "聚焦查看每筆成交明細，可直接匯出 CSV。" : "查看你名下教材的銷量、營收、成交明細與趨勢。"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button intent="action" onPress={exportCsv} disabled={records.length === 0}>
            匯出 CSV
          </Button>
          <Link href="/creator/materials">
            <Button intent="neutral">返回教材管理</Button>
          </Link>
        </div>
      </div>

      <SurfaceCard title="篩選條件" description="可依狀態、日期與教材篩選銷售資料。" level="flat">
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField id="teacher-sales-status" label="訂單狀態" value={statusFilter} options={statusOptions} onValueChange={setStatusFilter} />
          <SelectField id="teacher-sales-material" label="教材" value={materialFilter} options={materialOptions} onValueChange={setMaterialFilter} />
          <label className="space-y-1 text-sm text-slate-700">
            <span>起始日期</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-700">
            <span>結束日期</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </SurfaceCard>

      {loading ? <LoadingState title="載入銷售資料中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}

      {!loading && !error && summary ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <SurfaceCard title="總賣出份數" description={`${summary.totalSoldUnits.toLocaleString("zh-TW")} 份`} level="elevated" />
            <SurfaceCard title="總營收" description={formatMoney(summary.totalRevenue)} level="elevated" />
            <SurfaceCard title="成交訂單數" description={`${summary.totalOrders.toLocaleString("zh-TW")} 筆`} level="elevated" />
            <SurfaceCard title="有成交教材數" description={`${summary.materialsCount.toLocaleString("zh-TW")} 項`} level="elevated" />
          </div>

          <SurfaceCard title="銷售趨勢（日）" description="依日期聚合的每日銷量與營收（Phase 3）。" level="default">
            {summary.trend.length === 0 ? (
              <EmptyState title="目前沒有趨勢資料" description="當有成交訂單後，這裡會顯示每日銷售走勢。" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {monthlyBuckets.map((bucket) => (
                    <div key={bucket.month} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">{bucket.month}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(bucket.revenue)}</p>
                      <p className="text-xs text-slate-600">{bucket.soldUnits} 份</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">紫色柱狀為銷量，藍色點線為營收相對高度</p>
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
                      {[7, 14, 30].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setTrendWindowDays(days as 7 | 14 | 30)}
                          className={`rounded-md px-2 py-1 text-xs ${
                            trendWindowDays === days
                              ? "bg-indigo-600 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {days} 天
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded bg-violet-400/80" />
                      銷量
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                      營收
                    </span>
                    {chartRows.length > 0 ? (
                      <>
                        <span>
                          最大營收：{formatMoney(Math.max(...chartRows.map((r) => Number(r.revenue || 0))))}
                        </span>
                        <span>
                          最小營收：{formatMoney(Math.min(...chartRows.map((r) => Number(r.revenue || 0))))}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex h-44 items-end gap-2 overflow-x-auto pb-1">
                    {chartRows.map((row) => (
                      <div key={row.day} className="flex min-w-[40px] flex-col items-center justify-end gap-1">
                        <div className="h-4">
                          {revenueExtremes && revenueExtremes.maxDay === row.day ? (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                              MAX
                            </span>
                          ) : null}
                          {revenueExtremes && revenueExtremes.minDay === row.day ? (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                              MIN
                            </span>
                          ) : null}
                        </div>
                        <div className="relative flex h-28 w-6 items-end">
                          <div
                            className="w-full rounded-t bg-violet-400/80"
                            style={{ height: `${Math.max(4, row.unitHeightPct)}%` }}
                            title={`${row.day}\n銷量：${row.soldUnits} 份\n營收：${formatMoney(row.revenue)}`}
                          />
                          <div
                            className="absolute left-1/2 w-2 -translate-x-1/2 rounded-full bg-blue-500"
                            style={{ bottom: `${Math.max(4, row.revenueHeightPct)}%`, height: "8px" }}
                            title={`${row.day}\n銷量：${row.soldUnits} 份\n營收：${formatMoney(row.revenue)}`}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500">{row.day.slice(5)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {chartRows.map((row) => (
                    <div key={`row-${row.day}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-700">{row.day}</span>
                      <span className="text-slate-600">銷量 {row.soldUnits} 份</span>
                      <span className="font-semibold text-slate-900">{formatMoney(row.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard title="熱銷教材 Top 5" description="依目前篩選條件下的營收排序。" level="default">
            <div className="mb-3 flex justify-end">
              <Button size="sm" intent="action" onPress={exportTopMaterialsCsv} disabled={topMaterials.length === 0}>
                匯出 Top 5 CSV
              </Button>
            </div>
            {topMaterials.length === 0 ? (
              <EmptyState title="目前沒有熱銷資料" description="有成交後會顯示 Top 5 教材。" />
            ) : (
              <div className="space-y-2">
                {topMaterials.map((item, index) => (
                  <div key={item.materialId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <div className="min-w-[220px]">
                      <p className="text-sm font-semibold text-slate-900">
                        #{index + 1} {item.title}
                      </p>
                      <p className="text-xs text-slate-500">{item.materialId}</p>
                    </div>
                    <p className="text-sm text-slate-600">賣出 {item.soldUnits} 份</p>
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(item.revenue)}</p>
                    <div className="flex gap-2">
                      <Link href={`/creator/materials/${encodeURIComponent(item.materialId)}/reviews`}>
                        <Button size="sm" intent="action">
                          教學回饋
                        </Button>
                      </Link>
                      <Link href={`/creator/materials/${encodeURIComponent(item.materialId)}/edit`}>
                        <Button size="sm" intent="action">
                          編輯
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard title="教材銷售彙總（Phase 1）" description={`共 ${materials.length} 項`} level="default">
            {materials.length === 0 ? (
              <EmptyState title="目前沒有銷售資料" description="當教材開始成交後，這裡會列出每份教材賣出份數與營收。" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-2">教材</th>
                      <th className="px-3 py-2">賣出份數</th>
                      <th className="px-3 py-2">營收</th>
                      <th className="px-3 py-2">最近成交</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((item) => (
                      <tr key={item.materialId} className="border-b border-slate-100 text-slate-700">
                        <td className="px-3 py-2">
                          <div>
                            <p className="font-medium text-slate-900">{item.title}</p>
                            <p className="text-xs text-slate-500">{item.materialId}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2">{item.soldUnits}</td>
                        <td className="px-3 py-2">{formatMoney(item.revenue)}</td>
                        <td className="px-3 py-2">{toDateInput(item.lastSoldAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SurfaceCard>

          <div ref={recordsSectionRef}>
            <SurfaceCard title="成交明細（Phase 2）" description={`共 ${recordsTotalItems} 筆`} level="default">
            {records.length === 0 ? (
              <EmptyState title="查無成交明細" description="請調整篩選條件，或等待新訂單成交後再查看。" />
            ) : (
              <div className="space-y-3">
                <Pagination page={recordsPage} totalPages={recordsTotalPages} totalItems={recordsTotalItems} onPageChange={setRecordsPage} />
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">時間</th>
                        <th className="px-3 py-2">教材</th>
                        <th className="px-3 py-2">數量</th>
                        <th className="px-3 py-2">單價</th>
                        <th className="px-3 py-2">小計</th>
                        <th className="px-3 py-2">狀態</th>
                        <th className="px-3 py-2">訂單</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((row) => (
                        <tr key={row.orderItemId} className="border-b border-slate-100 text-slate-700">
                          <td className="px-3 py-2">{toDateInput(row.createdAt)}</td>
                          <td className="px-3 py-2">
                            <div>
                              <p className="font-medium text-slate-900">{row.materialTitle}</p>
                              <p className="text-xs text-slate-500">{row.materialId}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2">{row.quantity}</td>
                          <td className="px-3 py-2">{formatMoney(row.unitPrice)}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{formatMoney(row.subtotal)}</td>
                          <td className="px-3 py-2">{row.orderStatus}</td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-slate-500">{row.orderId}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </SurfaceCard>
          </div>
        </>
      ) : null}
    </section>
  );
}

function CreatorSalesPageFallback() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">教材銷售中心</h1>
      <p className="text-sm text-slate-600">載入中...</p>
    </section>
  );
}

export default function CreatorSalesPage() {
  return (
    <Suspense fallback={<CreatorSalesPageFallback />}>
      <CreatorSalesPageContent />
    </Suspense>
  );
}
