"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  CreatorSalesByMaterial,
  CreatorSalesListResponse,
  CreatorSalesRecord,
  CreatorSalesSummary,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import {
  PRESET_LABELS,
  REPORTING_TIMEZONE,
  formatIsoDateForDisplay,
  parseRangeSelection,
  toRangeQuery,
  type RangeSelection,
} from "../../../lib/reportingRange";
import { AccentTextLink, EmptyState, ErrorState, SurfaceCard } from "../../../components/ds";
import { Button } from "../../../components/ui/Button";
import { ReportingRangeSelector } from "../../../components/reporting/ReportingRangeSelector";
import { StatCard } from "../../../components/reporting/StatCard";
import { TrendChart } from "../../../components/reporting/TrendChart";

/**
 * Creator 銷售頁。
 *
 * **統計語意（見 docs/mvp_rules.md §18）：**
 *
 * 這頁顯示的是 **Creator Gross Sales** —— 已成交（`orders.status = 'approved'`）的
 * 創作者商品行金額，**折扣前**（`SUM(order_items.subtotal)`），認列於 `orders.paid_at`。
 * 文案一律用「銷售額」，不用「營收」（那是 Admin 的 recognized revenue，折扣後）
 * 或「收益」（需要抽成與結算模型，本平台沒有）。
 *
 * **呈現層規則：**
 *
 * - 期間選擇器是 **page-level control**：整頁每一個數字與明細都依它計算，因此放在
 *   標題列旁，而不是包成一張「統計期間」卡片。
 * - 三支 endpoint **各自**持有 loading / error state。一支失敗不得清掉其他已成功的
 *   資料 —— 舊版的 all-or-nothing 會讓 records 掛掉時連 KPI 與趨勢一起消失。
 * - `lg` 以下不使用 table：中文欄位在窄欄會被壓成一行一個字，且金額欄會被推出畫面。
 *   改用同一份資料渲染的清單列。
 */

const PAGE_SIZE = 10;
const CONNECTION_ERROR = "無法連線至伺服器，請稍後再試。";
const SERVER_ERROR = "伺服器暫時無法回應，請稍後再試。";
const EMPTY_HINT = "當訂單付款經核准後，這裡就會出現成交資料。";

function formatMoney(value: number) {
  return `NT$ ${Math.floor(Number(value) || 0).toLocaleString("zh-TW")}`;
}

function formatCount(value: number) {
  return (Number(value) || 0).toLocaleString("zh-TW");
}

/**
 * 成交時間一律以 **Asia/Taipei** 呈現，不跟隨瀏覽器時區 —— 統計期間是台北日曆日，
 * 明細時間若用瀏覽器時區顯示，兩者會對不起來。
 */
const taipeiDateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: REPORTING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const taipeiDate = new Intl.DateTimeFormat("zh-TW", {
  timeZone: REPORTING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatTaipeiDateTime(raw?: string | null) {
  if (!raw) return "-";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "-" : taipeiDateTime.format(d);
}
function formatTaipeiDate(raw?: string | null) {
  if (!raw) return "-";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "-" : taipeiDate.format(d);
}

/** `ord_mo2q2du20ytgpj0` → `#ytgpj0`。完整值仍以 `title` 提供。 */
function shortId(id?: string | null) {
  const raw = String(id ?? "");
  return raw.length > 6 ? `#${raw.slice(-6)}` : raw;
}

/** 每支 endpoint 各自一份，彼此不互相清空。 */
type Section<T> = { data: T | null; loading: boolean; error: string | null };

const initialSection = <T,>(): Section<T> => ({ data: null, loading: true, error: null });

const sectionHeading = "text-lg font-semibold text-ds-heading";

export default function CreatorSalesPage() {
  return (
    <Suspense fallback={<CreatorSalesFallback />}>
      <CreatorSalesContent />
    </Suspense>
  );
}

function CreatorSalesFallback() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5">
      <h1 className="text-2xl font-bold text-ds-heading">我的銷售</h1>
    </section>
  );
}

function CreatorSalesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 是期間的 single source of truth：reload / bookmark / 上一頁下一頁都自然成立。
  const searchKey = searchParams?.toString() ?? "";
  const [selection, setSelection] = useState<RangeSelection>(() => parseRangeSelection(searchParams));
  useEffect(() => {
    setSelection(parseRangeSelection(new URLSearchParams(searchKey)));
  }, [searchKey]);

  const [summary, setSummary] = useState<Section<CreatorSalesSummary>>(initialSection);
  const [materials, setMaterials] = useState<Section<CreatorSalesListResponse<CreatorSalesByMaterial>>>(initialSection);
  const [records, setRecords] = useState<Section<CreatorSalesListResponse<CreatorSalesRecord>>>(initialSection);
  const [recordsPage, setRecordsPage] = useState(1);
  const [materialFilter, setMaterialFilter] = useState("all");

  const rangeQuery = toRangeQuery(selection);

  /*
   * 每支 endpoint 各自的序號 + AbortController。共用一份會讓某一支的取消
   * 順手殺掉另一支仍然有效的請求；分開也讓 partial failure 自然成立。
   */
  const seqs = useRef({ summary: 0, materials: 0, records: 0 });
  const aborts = useRef<Record<string, AbortController | null>>({ summary: null, materials: null, records: null });

  const fetchSection = useCallback(
    async <T,>(key: "summary" | "materials" | "records", path: string, set: (s: Section<T>) => void) => {
      aborts.current[key]?.abort();
      const controller = new AbortController();
      aborts.current[key] = controller;
      const seq = seqs.current[key] + 1;
      seqs.current[key] = seq;

      set({ data: null, loading: true, error: null });
      try {
        const res = await apiFetch(path, { signal: controller.signal });
        if (seq !== seqs.current[key]) return;
        if (!res.ok) {
          // 5xx 的 body 是給維運看的（例如 "server error"），不要原樣顯示給創作者；
          // 4xx 才帶有對使用者有意義的訊息（例如日期區間不合法）。
          const message = res.status >= 500 ? SERVER_ERROR : await parseApiErrorMessage(res);
          set({ data: null, loading: false, error: message });
          return;
        }
        const payload = (await res.json()) as T;
        if (seq !== seqs.current[key]) return;
        set({ data: payload, loading: false, error: null });
      } catch {
        if (controller.signal.aborted || seq !== seqs.current[key]) return;
        set({ data: null, loading: false, error: CONNECTION_ERROR });
      }
    },
    [],
  );

  const loadSummary = useCallback(
    (query: string) => fetchSection<CreatorSalesSummary>("summary", `teacher/sales/summary?${query}`, setSummary),
    [fetchSection],
  );
  const loadMaterials = useCallback(
    (query: string) => {
      const q = new URLSearchParams(query);
      q.set("page", "1");
      q.set("limit", "100");
      return fetchSection<CreatorSalesListResponse<CreatorSalesByMaterial>>("materials", `teacher/sales/materials?${q}`, setMaterials);
    },
    [fetchSection],
  );
  const loadRecords = useCallback(
    (query: string, page: number, material: string) => {
      const q = new URLSearchParams(query);
      q.set("page", String(page));
      q.set("limit", String(PAGE_SIZE));
      if (material !== "all") q.set("materialId", material);
      return fetchSection<CreatorSalesListResponse<CreatorSalesRecord>>("records", `teacher/sales/records?${q}`, setRecords);
    },
    [fetchSection],
  );

  useEffect(() => {
    void loadSummary(rangeQuery);
    void loadMaterials(rangeQuery);
  }, [loadSummary, loadMaterials, rangeQuery]);

  useEffect(() => {
    void loadRecords(rangeQuery, recordsPage, materialFilter);
  }, [loadRecords, rangeQuery, recordsPage, materialFilter]);

  // 換期間或換教材時回到第一頁，避免停在一個已不存在的頁碼上。
  useEffect(() => {
    setRecordsPage(1);
  }, [rangeQuery, materialFilter]);

  /*
   * Legacy deep link 相容：舊的側欄連結是 `?tab=records`。
   * 它現在只是錨點語意（捲到成交明細），**不再改變 h1** —— 那是假的導覽狀態。
   * 新連結請用 `#records`。期間參數不受影響。
   */
  const legacyTab = searchParams?.get("tab");
  useEffect(() => {
    if (legacyTab !== "records") return;
    document.getElementById("records")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [legacyTab, records.loading]);

  // push（非 replace）讓上一頁／下一頁能在期間之間來回。
  const applySelection = useCallback(
    (next: RangeSelection) => router.push(`/creator/sales?${toRangeQuery(next)}`, { scroll: false }),
    [router],
  );

  const s = summary.data;
  // 用 useMemo 穩定參考：直接寫 `?? []` 每次 render 都是新陣列，會讓下游 useMemo 失效。
  const materialItems = useMemo(() => materials.data?.items ?? [], [materials.data]);
  const recordItems = records.data?.items ?? [];
  const recordsTotal = records.data?.pagination?.total ?? recordItems.length;
  const recordsTotalPages = Math.max(1, records.data?.pagination?.totalPages ?? 1);

  /**
   * 期間文字優先採 API 解析結果；summary 失敗時退回本地選擇（custom 才有明確日期），
   * 避免永遠停在「期間載入中…」。preset 由 server 依台北今日推導，本地無法預先得知日期。
   */
  const periodLabel = s
    ? `${formatIsoDateForDisplay(s.periodFrom)} – ${formatIsoDateForDisplay(s.periodTo)}`
    : selection.preset === "custom"
      ? `${formatIsoDateForDisplay(selection.from)} – ${formatIsoDateForDisplay(selection.to)}`
      : null;

  const materialOptions = useMemo(
    () => [{ value: "all", label: "全部教材" }, ...materialItems.map((m) => ({ value: m.materialId, label: m.title }))],
    [materialItems],
  );

  function downloadCsv(filename: string, headers: string[], rows: string[][]) {
    const content = [headers, ...rows]
      .map((cols) => cols.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportRecordsCsv() {
    downloadCsv(
      `creator-sales-records-${s?.periodFrom ?? "all"}_${s?.periodTo ?? ""}.csv`,
      ["orderId", "orderItemId", "materialId", "materialTitle", "quantity", "unitPrice", "subtotal", "orderStatus", "paidAt", "createdAt", "buyerId"],
      recordItems.map((r) => [
        r.orderId, r.orderItemId, r.materialId, r.materialTitle,
        String(r.quantity), String(r.unitPrice), String(r.subtotal),
        r.orderStatus, r.paidAt ?? "", r.createdAt ?? "", r.buyerId ?? "",
      ]),
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5">
      {/*
        期間選擇器就在標題旁：它控制整頁，因此屬於 page-level control。
        舊版把它包成一張「統計期間」卡並附上一句說明，等於用 250px 的首屏高度
        去解釋一件位置本身就能表達的事。
      */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ds-heading">我的銷售</h1>
          <p className="mt-1 text-sm text-ds-textMuted" data-testid="creator-period-label" title={`統計時區：${REPORTING_TIMEZONE}`}>
            {periodLabel ?? (summary.loading ? "期間載入中…" : PRESET_LABELS[selection.preset])}
            <span className="sr-only">（時區 {s?.periodTimezone ?? REPORTING_TIMEZONE}）</span>
          </p>
        </div>
        <ReportingRangeSelector
          selection={selection}
          onChange={applySelection}
          resolvedFrom={s?.periodFrom ?? null}
          resolvedTo={s?.periodTo ?? null}
          busy={summary.loading}
        />
      </header>

      {/* 銷售表現 —— 依 Creator 的決策順序排列：先看賺多少，再看幾筆、幾份、幾個教材。 */}
      <section aria-labelledby="creator-performance" className="space-y-3">
        <h2 id="creator-performance" className={sectionHeading}>
          銷售表現
        </h2>
        {summary.error ? (
          <ErrorState variant="inline" retryLabel="重新載入" title="銷售數據暫時無法載入" description={summary.error} onRetry={() => void loadSummary(rangeQuery)} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="銷售額" value={s ? formatMoney(s.totalSalesAmount) : null} subtext="折扣前" loading={summary.loading} />
            <StatCard label="成交訂單" value={s ? formatCount(s.totalOrders) : null} subtext="筆" loading={summary.loading} />
            <StatCard label="賣出份數" value={s ? formatCount(s.totalSoldUnits) : null} subtext="份" loading={summary.loading} />
            <StatCard label="有成交教材" value={s ? formatCount(s.materialsCount) : null} subtext="項" loading={summary.loading} />
          </div>
        )}
      </section>

      {/* 趨勢與 KPI 同屬 summary endpoint，因此共用它的 loading / error。 */}
      <TrendChart
        title="銷售額趨勢"
        titleAs="h2"
        titleClassName={sectionHeading}
        description="依成交時間統計"
        points={(s?.trend ?? []).map((p) => ({ key: p.key, value: p.salesAmount }))}
        granularity={s?.granularity ?? "day"}
        loading={summary.loading}
        error={summary.error}
        formatValue={formatMoney}
        zeroLabel="此期間尚無成交。"
      />

      {/* ── 教材銷售表現 ──────────────────────────────────────────────────────── */}
      <section id="materials" aria-labelledby="creator-materials" className="scroll-mt-20 space-y-2 lg:scroll-mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="creator-materials" className={sectionHeading}>
            教材銷售表現
          </h2>
          <p className="text-caption text-ds-textMuted">依所選期間的銷售額排序</p>
        </div>

        {materials.loading ? (
          <ListSkeleton rows={3} />
        ) : materials.error ? (
          <ErrorState variant="inline" retryLabel="重新載入" title="教材銷售資料暫時無法載入" description={materials.error} onRetry={() => void loadMaterials(rangeQuery)} />
        ) : materialItems.length === 0 ? (
          <EmptyState
            title="此期間沒有教材成交資料"
            description={EMPTY_HINT}
            action={<AccentTextLink href="/creator/materials">前往我的教材</AccentTextLink>}
          />
        ) : (
          <SurfaceCard elevation="raised" className="overflow-hidden">
            {/* Desktop：表格。`lg` 以下改清單 —— 768px 四欄已經開始壓縮中文欄位。 */}
            <table className="hidden w-full table-auto text-left text-sm lg:table">
              <caption className="sr-only">教材銷售表現：教材、賣出份數、銷售額（折扣前）、最近成交時間</caption>
              <thead>
                <tr className="border-b border-ds-borderMuted text-caption text-ds-textMuted">
                  <th scope="col" className="w-full max-w-0 px-4 py-2 font-medium">教材</th>
                  <th scope="col" className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">賣出份數</th>
                  <th scope="col" className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">銷售額</th>
                  <th scope="col" className="w-px whitespace-nowrap px-4 py-2 font-medium">最近成交</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-borderMuted">
                {materialItems.map((m) => (
                  <tr key={m.materialId} className="hover:bg-ds-surfaceMuted">
                    {/* max-w-0 + truncate：長標題不再撐寬整欄，把數字擠到畫面右緣。 */}
                    <td className="w-full max-w-0 px-4 py-2.5">
                      <p className="truncate font-medium text-ds-heading" title={m.title}>{m.title}</p>
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ds-body">{m.soldUnits}</td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-ds-heading">{formatMoney(m.salesAmount)}</td>
                    <td className="w-px whitespace-nowrap px-4 py-2.5 text-meta text-ds-textMuted">{formatTaipeiDate(m.lastSoldAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile / tablet：簡單分隔線清單，不做第二層卡片。 */}
            <ul className="divide-y divide-ds-borderMuted lg:hidden">
              {materialItems.map((m) => (
                <li key={m.materialId} className="px-4 py-3">
                  <p className="line-clamp-2 text-sm font-medium text-ds-heading" title={m.title}>{m.title}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-ds-heading">{formatMoney(m.salesAmount)}</p>
                  <p className="mt-0.5 text-caption text-ds-textMuted">
                    {m.soldUnits} 份・最近成交 {formatTaipeiDate(m.lastSoldAt)}
                  </p>
                </li>
              ))}
            </ul>
          </SurfaceCard>
        )}
      </section>

      {/* ── 成交明細 ─────────────────────────────────────────────────────────── */}
      <section id="records" aria-labelledby="creator-records" className="scroll-mt-20 space-y-2 lg:scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="creator-records" className={sectionHeading}>
            成交明細
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* 教材篩選只影響成交明細，因此放在這一區，而不是期間控制旁。 */}
            <label htmlFor="creator-records-material" className="text-caption text-ds-textMuted">
              教材
            </label>
            <select
              id="creator-records-material"
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="min-h-10 max-w-[14rem] truncate rounded-xl border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            >
              {materialOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button intent="neutral" variant="outline" onClick={exportRecordsCsv} disabled={recordItems.length === 0} className="min-h-10 px-3 py-1.5">
              匯出 CSV
            </Button>
          </div>
        </div>

        {records.loading ? (
          <ListSkeleton rows={4} />
        ) : records.error ? (
          <ErrorState variant="inline" retryLabel="重新載入" title="成交明細暫時無法載入" description={records.error} onRetry={() => void loadRecords(rangeQuery, recordsPage, materialFilter)} />
        ) : recordItems.length === 0 ? (
          <EmptyState title="此期間沒有成交明細" description={EMPTY_HINT} />
        ) : (
          <SurfaceCard elevation="raised" className="overflow-hidden">
            <table className="hidden w-full table-auto text-left text-sm lg:table">
              <caption className="sr-only">成交明細：成交時間、教材、數量、單價、小計、訂單編號</caption>
              <thead>
                <tr className="border-b border-ds-borderMuted text-caption text-ds-textMuted">
                  <th scope="col" className="w-px whitespace-nowrap px-4 py-2 font-medium">成交時間</th>
                  <th scope="col" className="w-full max-w-0 px-3 py-2 font-medium">教材</th>
                  <th scope="col" className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">數量</th>
                  <th scope="col" className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">單價</th>
                  <th scope="col" className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">小計</th>
                  <th scope="col" className="w-px whitespace-nowrap px-4 py-2 font-medium">訂單</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-borderMuted">
                {recordItems.map((r) => (
                  <tr key={r.orderItemId} className="hover:bg-ds-surfaceMuted">
                    <td className="w-px whitespace-nowrap px-4 py-2.5 text-meta text-ds-textMuted">{formatTaipeiDateTime(r.paidAt)}</td>
                    <td className="w-full max-w-0 px-3 py-2.5">
                      <p className="truncate font-medium text-ds-heading" title={r.materialTitle}>{r.materialTitle}</p>
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ds-body">{r.quantity}</td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ds-body">{formatMoney(r.unitPrice)}</td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-ds-heading">{formatMoney(r.subtotal)}</td>
                    {/* opaque id 降權：畫面只顯示末六碼，完整值放 title。 */}
                    <td className="w-px whitespace-nowrap px-4 py-2.5 font-mono text-meta text-ds-textMuted" title={r.orderId}>{shortId(r.orderId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-ds-borderMuted lg:hidden">
              {recordItems.map((r) => (
                <li key={r.orderItemId} className="px-4 py-3">
                  <p className="text-caption text-ds-textMuted">{formatTaipeiDateTime(r.paidAt)}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-medium text-ds-heading" title={r.materialTitle}>{r.materialTitle}</p>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <span className="text-caption tabular-nums text-ds-textMuted">
                      {r.quantity} 份 × {formatMoney(r.unitPrice)}
                    </span>
                    <span className="text-base font-semibold tabular-nums text-ds-heading">{formatMoney(r.subtotal)}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-caption text-ds-textMuted" title={r.orderId}>訂單 {shortId(r.orderId)}</p>
                </li>
              ))}
            </ul>

            {/* 分頁放在清單下方（標準位置）；筆數只在這裡出現一次，不與區塊標題重複。 */}
            <nav aria-label="成交明細分頁" className="flex flex-wrap items-center justify-between gap-2 border-t border-ds-borderMuted px-4 py-3">
              <p className="text-caption text-ds-textMuted">共 {recordsTotal.toLocaleString("zh-TW")} 筆</p>
              <div className="flex items-center gap-2">
                <Button
                  intent="neutral" variant="outline" className="min-h-10 px-3 py-1.5"
                  onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                  disabled={recordsPage <= 1}
                >
                  上一頁
                </Button>
                <span className="text-caption tabular-nums text-ds-textMuted">
                  第 {recordsPage} / {recordsTotalPages} 頁
                </span>
                <Button
                  intent="neutral" variant="outline" className="min-h-10 px-3 py-1.5"
                  onClick={() => setRecordsPage((p) => Math.min(recordsTotalPages, p + 1))}
                  disabled={recordsPage >= recordsTotalPages}
                >
                  下一頁
                </Button>
              </div>
            </nav>
          </SurfaceCard>
        )}
      </section>
    </section>
  );
}

/** 保留區塊高度的載入骨架，避免切換期間時版面塌陷再彈回。 */
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <SurfaceCard elevation="raised" className="divide-y divide-ds-borderMuted" role="status" aria-live="polite">
      <span className="sr-only">載入中</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5" aria-hidden>
          <span className="h-4 w-1/2 animate-pulse motion-reduce:animate-none rounded-full bg-ds-surfaceMuted" />
          <span className="h-4 w-20 animate-pulse motion-reduce:animate-none rounded-full bg-ds-surfaceMuted" />
        </div>
      ))}
    </SurfaceCard>
  );
}
