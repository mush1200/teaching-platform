"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ActivityLog,
  ActivityLogsResponse,
  AdminDashboardSummary,
  AdminDashboardTrends,
  AdminMaterialsListResponse,
  Order,
  OrdersListResponse,
} from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";
import { comparisonLabel, formatIsoDateForDisplay, parseRangeSelection, toRangeQuery, type RangeSelection } from "../../lib/reportingRange";
import { AdminKpiCard, type KpiComparison } from "./AdminKpiCard";
import { AdminTaskCard } from "./AdminTaskCard";
import { ReportingRangeSelector } from "../reporting/ReportingRangeSelector";
import { RecentActivityList } from "./RecentActivityList";
import { RecentOrdersTable } from "./RecentOrdersTable";
import { TrendChart } from "../reporting/TrendChart";

/** 「最近訂單」／「最近活動」各顯示幾筆。activity-logs 亦以此值向後端要資料。 */
const RECENT_LIMIT = 8;

const CONNECTION_ERROR = "無法連線至伺服器，請稍後再試。";

/** 期間無關的資料：只在掛載時取一次，切換期間不重新取得。 */
type StaticState = {
  /**
   * 教材的**全表**狀態計數，由 `GET /admin/materials` 的 `statusCounts` 提供。
   *
   * 這裡不再保存教材清單：該 endpoint 現在是 server-side 分頁的（Epic §6），
   * 一次只回一頁，把回來的 items 自己 `filter().length` 會在教材超過一頁時
   * 靜靜地算出錯的 KPI。要總數就讀總數。
   */
  materialCounts: { pending_review: number; published: number } | null;
  orders: Order[];
  activities: ActivityLog[];
  loading: boolean;
  errors: Partial<Record<"materials" | "orders" | "activities", string>>;
};

/** 期間相關的資料：切換期間時只有這一份會重新取得。 */
type SummaryState = {
  data: AdminDashboardSummary | null;
  loading: boolean;
  error: string | null;
};

/**
 * 趨勢資料與 summary 分開存放。
 * 兩支 endpoint 各自成功／失敗：summary 掛掉不該讓圖表消失，圖表掛掉也不該讓 KPI 變成 `—`。
 */
type TrendsState = {
  data: AdminDashboardTrends | null;
  loading: boolean;
  error: string | null;
};

function emptyStatic(loading: boolean): StaticState {
  return { materialCounts: null, orders: [], activities: [], loading, errors: {} };
}

function formatCount(value: number | null | undefined): string | null {
  return value == null ? null : value.toLocaleString("zh-TW");
}

function formatMoney(value: number | null | undefined): string | null {
  return value == null ? null : `NT$ ${Math.floor(Number(value) || 0).toLocaleString("zh-TW")}`;
}

/** 圖表與 KPI 共用同一組格式化，避免同一筆金額在兩處長得不一樣。 */
const moneyTick = (value: number) => `NT$ ${Math.floor(Number(value) || 0).toLocaleString("zh-TW")}`;
const orderTick = (value: number) => `${Number(value) || 0} 筆`;

const sectionHeading = "text-meta font-semibold text-ds-textMuted";

/**
 * Admin Dashboard。
 *
 * **統計語意（見 docs/mvp_rules.md §15）：**
 *
 * - 期間選擇器**只**控制「本期表現」。待處理卡、平台摘要、最近訂單／活動一律是
 *   current snapshot 或 latest-N feed，永遠不受期間影響 —— 待辦被期間濾掉不代表已處理完。
 * - 期間一律以 **Asia/Taipei 日曆日**解讀，邊界為 half-open `[from 00:00, to+1 00:00)`。
 *   換算由 Backend 負責；前端只負責 URL state 與輸入驗證，顯示的區間文字則直接採用
 *   API 回傳的 `periodFrom` / `periodTo`，確保畫面與實際查詢一致。
 * - `/admin/dashboard/summary` 是所有 KPI 的 canonical source。失敗時顯示 `—`，
 *   **不得**改用前端就地計算的另一份數字頂替。
 */
export function AdminDashboardPage() {
  return (
    <Suspense fallback={<AdminDashboardFallback />}>
      <AdminDashboardContent />
    </Suspense>
  );
}

function AdminDashboardFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-section-md">
      <DashboardHeader />
    </div>
  );
}

/**
 * `action` 放期間選擇器：與問候語同一列，而不是自成一區。
 * 拆成上下兩塊時，控制項與「本期表現」之間會多出一段空白，把 KPI 與趨勢圖往下推。
 * 期間實際影響哪些數字，仍由「本期表現」標題下的區間文字，以及其他區塊自己的標題
 * （「目前待處理」「平台摘要（截至目前）」）表達。
 */
function DashboardHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        {/* Mobile 縮小標題並隱藏副標：副標與下方待處理卡資訊重疊，且標題區在矮視窗會吃掉近三成高度 */}
        <h1 className="text-2xl font-bold text-[#1F2937] sm:text-3xl">歡迎回來，管理員！</h1>
        <p className="mt-1 hidden text-sm text-[#6B7280] sm:block">今天需要處理的事項與平台概況</p>
      </div>
      {action}
    </header>
  );
}

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // URL 是期間的 single source of truth：reload / bookmark / 上一頁下一頁都自然成立。
  // 不合法的參數安全退回近 30 天（`parseRangeSelection`），不讓 dashboard 崩潰。
  const searchKey = searchParams?.toString() ?? "";
  const [selection, setSelection] = useState<RangeSelection>(() => parseRangeSelection(searchParams));

  useEffect(() => {
    setSelection(parseRangeSelection(new URLSearchParams(searchKey)));
  }, [searchKey]);

  const [staticState, setStaticState] = useState<StaticState>(() => emptyStatic(true));
  const [summary, setSummary] = useState<SummaryState>({ data: null, loading: true, error: null });
  const [trends, setTrends] = useState<TrendsState>({ data: null, loading: true, error: null });

  const loadStatic = useCallback(async () => {
    setStaticState(emptyStatic(true));
    const [materialsRes, ordersRes, activitiesRes] = await Promise.allSettled([
      // `limit=1`：只要 statusCounts，不需要任何一頁的內容。
      apiFetch("admin/materials?limit=1"),
      apiFetch("admin/orders"),
      apiFetch(`admin/activity-logs?page=1&limit=${RECENT_LIMIT}`),
    ]);

    const next = emptyStatic(false);

    /** 失敗時記錄錯誤並回傳 `null`；呼叫端顯示 `—` 或錯誤態，不做替代口徑計算。 */
    async function resolvePayload<P>(
      result: PromiseSettledResult<Response>,
      key: keyof StaticState["errors"],
    ): Promise<P | null> {
      if (result.status === "rejected") {
        next.errors[key] = CONNECTION_ERROR;
        return null;
      }
      if (!result.value.ok) {
        next.errors[key] = await parseApiErrorMessage(result.value);
        return null;
      }
      return (await result.value.json()) as P;
    }

    const materialsPayload = await resolvePayload<AdminMaterialsListResponse>(materialsRes, "materials");
    next.materialCounts = materialsPayload?.statusCounts
      ? {
          pending_review: materialsPayload.statusCounts.pending_review ?? 0,
          published: materialsPayload.statusCounts.published ?? 0,
        }
      : null;
    next.orders = (await resolvePayload<OrdersListResponse>(ordersRes, "orders"))?.items ?? [];
    next.activities = (await resolvePayload<ActivityLogsResponse>(activitiesRes, "activities"))?.items ?? [];
    setStaticState(next);
  }, []);

  /*
   * 期間切換的 race protection。
   *
   * 快速點「近 7 天 → 近 30 天 → 今日」時，較早發出的請求可能較晚回來。序號 + AbortController
   * 兩層：AbortController 讓已作廢的請求盡早中斷，序號確保就算它仍完成也不會覆寫較新的結果。
   */
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // 趨勢用**獨立**的序號與 controller：共用一個 controller 會讓 summary 的取消
  // 順手殺掉仍然有效的趨勢請求（反之亦然）。
  const trendSeq = useRef(0);
  const trendAbortRef = useRef<AbortController | null>(null);

  const loadSummary = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;

    setSummary((prev) => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch(`admin/dashboard/summary?${query}`, { signal: controller.signal });
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        // 失敗時把 data 清成 null：寧可整組顯示 `—`，也不要留著上一個期間的數字。
        setSummary({ data: null, loading: false, error: await parseApiErrorMessage(res) });
        return;
      }
      const payload = (await res.json()) as AdminDashboardSummary;
      if (seq !== requestSeq.current) return;
      setSummary({ data: payload, loading: false, error: null });
    } catch {
      if (controller.signal.aborted || seq !== requestSeq.current) return;
      setSummary({ data: null, loading: false, error: CONNECTION_ERROR });
    }
  }, []);

  const loadTrends = useCallback(async (query: string) => {
    trendAbortRef.current?.abort();
    const controller = new AbortController();
    trendAbortRef.current = controller;
    const seq = trendSeq.current + 1;
    trendSeq.current = seq;

    setTrends((prev) => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch(`admin/dashboard/trends?${query}`, { signal: controller.signal });
      if (seq !== trendSeq.current) return;
      if (!res.ok) {
        setTrends({ data: null, loading: false, error: await parseApiErrorMessage(res) });
        return;
      }
      const payload = (await res.json()) as AdminDashboardTrends;
      if (seq !== trendSeq.current) return;
      setTrends({ data: payload, loading: false, error: null });
    } catch {
      if (controller.signal.aborted || seq !== trendSeq.current) return;
      setTrends({ data: null, loading: false, error: CONNECTION_ERROR });
    }
  }, []);

  useEffect(() => {
    void loadStatic();
  }, [loadStatic]);

  const rangeQuery = toRangeQuery(selection);
  useEffect(() => {
    void loadSummary(rangeQuery);
    void loadTrends(rangeQuery);
  }, [loadSummary, loadTrends, rangeQuery]);

  // push（非 replace）讓上一頁／下一頁能在期間之間來回。
  const applySelection = useCallback(
    (next: RangeSelection) => {
      router.push(`/admin?${toRangeQuery(next)}`, { scroll: false });
    },
    [router],
  );

  const data = summary.data;
  const periodLoading = summary.loading;
  /** 尚未有任何一次成功回應時，snapshot 卡也還沒有值可顯示。 */
  const summaryPending = data == null && summary.loading;

  const periodLabel =
    data != null ? `${formatIsoDateForDisplay(data.periodFrom)} – ${formatIsoDateForDisplay(data.periodTo)}` : null;

  /**
   * 比較列。`deltaPercent` 直接採用 Backend 的 canonical 值（含 `null` = 「新增」），
   * 前端不重算任何數學；文案依 preset 決定，`title` 補上實際的比較基準期。
   */
  const comparisonFor = (deltaPercent: number | null | undefined): KpiComparison | null => {
    if (data == null || deltaPercent === undefined) return null;
    return {
      deltaPercent,
      label: comparisonLabel(data.periodPreset),
      title: `比較基準期：${formatIsoDateForDisplay(data.previousPeriodFrom)} – ${formatIsoDateForDisplay(data.previousPeriodTo)}`,
    };
  };

  /*
   * 教材相關計數不在 summary API 內，改由 `/admin/materials` 的 `statusCounts` 提供
   * （**全表**計數，不受分頁影響）；該來源失敗時同樣顯示 `—`。
   *
   * KPI 的名稱、順序與語意都沒有改變 —— 只換掉會在資料變多時算錯的來源。
   */
  const materialsUnavailable = staticState.errors.materials != null || staticState.materialCounts == null;
  const pendingMaterials = materialsUnavailable ? null : staticState.materialCounts!.pending_review;
  const publishedMaterials = materialsUnavailable ? null : staticState.materialCounts!.published;

  const failedSections = [
    ...Object.keys(staticState.errors),
    ...(summary.error ? ["summary"] : []),
    ...(trends.error ? ["trends"] : []),
  ];

  return (
    // 區塊節奏用 canonical layout token（--layout-section-gap-md = 24px），不用任意值
    <div className="mx-auto max-w-7xl space-y-section-md">
      <DashboardHeader
        action={
          <ReportingRangeSelector
            selection={selection}
            onChange={applySelection}
            resolvedFrom={data?.periodFrom ?? null}
            resolvedTo={data?.periodTo ?? null}
            busy={periodLoading}
          />
        }
      />

      {/*
        本期表現 — 唯一受期間控制的區塊。
        區間文字採用 API 回傳的 periodFrom / periodTo，等於後端真正查詢的範圍；
        時區改成 sr-only + tooltip（與 Creator 一致），畫面上只留日期，標題區壓成兩行。
      */}
      <section aria-labelledby="admin-performance-heading" className="space-y-3">
        <div>
          <h2 id="admin-performance-heading" className={sectionHeading}>
            本期表現
          </h2>
          <p
            className="mt-0.5 text-caption text-ds-textSubtle"
            data-testid="admin-period-label"
            title={data?.periodTimezone ? `統計時區：${data.periodTimezone}` : undefined}
          >
            {periodLabel ?? "期間載入中…"}
            {periodLabel ? <span className="sr-only">（時區 {data?.periodTimezone ?? ""}）</span> : null}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AdminKpiCard label="營收" value={formatMoney(data?.periodRevenueAmount)} subtext="所選期間已核准" loading={periodLoading} comparison={comparisonFor(data?.revenueDeltaPercent)} />
          <AdminKpiCard label="新增訂單" value={formatCount(data?.newOrdersCount)} subtext="所選期間" loading={periodLoading} comparison={comparisonFor(data?.newOrdersDeltaPercent)} />
          <AdminKpiCard label="新增用戶" value={formatCount(data?.newUsersCount)} subtext="所選期間" loading={periodLoading} comparison={comparisonFor(data?.newUsersDeltaPercent)} />
          <AdminKpiCard label="新增教材" value={formatCount(data?.newMaterialsCount)} subtext="所選期間" loading={periodLoading} comparison={comparisonFor(data?.newMaterialsDeltaPercent)} />
          <AdminKpiCard label="新增教學回饋" value={formatCount(data?.newReviewsCount)} subtext="所選期間" loading={periodLoading} comparison={comparisonFor(data?.newReviewsDeltaPercent)} />
        </div>

        {/*
          趨勢圖屬於「本期表現」，跟著同一個期間走，沒有自己的 URL state。
          Desktop 兩欄、tablet 以下堆疊；SVG 以 viewBox 縮放，任何寬度都不會橫向溢出。
          兩張圖共用 trends endpoint 的 loading / error —— 它與 summary 各自獨立，
          summary 失敗時 KPI 顯示 `—` 但圖表照常，反之亦然。
        */}
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <TrendChart
            title="營收趨勢"
            description="依管理員核准付款的時間（paid_at）統計，僅計入已核准訂單。"
            points={trends.data?.revenue ?? []}
            granularity={trends.data?.granularity ?? "day"}
            loading={trends.loading}
            error={trends.error}
            formatValue={moneyTick}
          />
          <TrendChart
            title="新增訂單趨勢"
            description="依訂單建立時間（created_at）統計，不分最終狀態。"
            points={trends.data?.orders ?? []}
            granularity={trends.data?.granularity ?? "day"}
            loading={trends.loading}
            error={trends.error}
            formatValue={orderTick}
          />
        </div>
      </section>

      {/*
        目前待處理 — current backlog snapshot。永遠代表「此刻」的待辦量，不受期間控制：
        待辦被期間濾掉不代表它被處理完，會導致漏處理。
      */}
      <section aria-labelledby="admin-pending-heading" className="space-y-3">
        <h2 id="admin-pending-heading" className={sectionHeading}>
          目前待處理
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <AdminTaskCard icon="📚" title="待審核教材" count={pendingMaterials} loading={staticState.loading} description="等待管理員確認上架資格。" href="/admin/materials?status=pending_review" />
          <AdminTaskCard icon="🧾" title="待審核付款憑證" count={data ? data.pendingProofsCount : null} loading={summaryPending} description="使用者上傳付款證明待核准。" href="/admin/payment-proofs?status=pending" />
          <AdminTaskCard icon="🚩" title="待處理檢舉" count={data ? data.pendingReportsCount : null} loading={summaryPending} description="請盡快判斷是否違反平台規範。" href="/admin/reports?status=pending" />
        </div>
      </section>

      {/*
        Operational awareness。訂單在左／活動在右：訂單牽涉金額與狀態、可直接處理，
        活動紀錄偏稽核軌跡。JSX 順序同時決定 breakpoint 以下的堆疊順序。
        items-start：兩張卡各自取自然高度，避免較短的一張被 stretch 出大片空白。

        兩者都是「平台最新 N 筆」的 latest-N feed，不是期間聚合，因此不受期間控制：
        /admin/orders 已 ORDER BY created_at DESC，activity-logs 亦由後端取最新 N 筆。
      */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <RecentOrdersTable orders={staticState.orders.slice(0, RECENT_LIMIT)} loading={staticState.loading} error={staticState.errors.orders ?? null} />
        <RecentActivityList items={staticState.activities.slice(0, RECENT_LIMIT)} loading={staticState.loading} error={staticState.errors.activities ?? null} />
      </div>

      {/*
        平台摘要 — all-time／snapshot 口徑，subtext 必須如實描述，不得出現「本期」。
        營收已成為期間指標（見上方「本期表現」），因此這裡不再並列 all-time 成交金額，
        避免畫面同時出現兩個語意不同的「營收」。
      */}
      <section aria-labelledby="admin-platform-heading" className="space-y-3">
        <h2 id="admin-platform-heading" className={sectionHeading}>
          平台摘要（截至目前）
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AdminKpiCard label="教材總數" value={formatCount(data?.materialsCount)} subtext="歷來累計" loading={summaryPending} />
          <AdminKpiCard label="已發布教材" value={formatCount(publishedMaterials)} subtext="可銷售數量" loading={staticState.loading} />
          <AdminKpiCard label="訂單總數" value={formatCount(data?.ordersCount)} subtext="歷來累計" loading={summaryPending} />
          <AdminKpiCard label="用戶總數" value={formatCount(data?.usersCount)} subtext="歷來累計" loading={summaryPending} />
          <AdminKpiCard label="教學回饋總數" value={formatCount(data?.reviewsCount)} subtext="歷來累計" loading={summaryPending} />
        </div>
      </section>

      {!staticState.loading && !summary.loading && !trends.loading && failedSections.length > 0 ? (
        <p className="text-sm text-[#B91C1C]">
          部分區塊載入失敗（顯示為 —）：{failedSections.join("、")}。可{" "}
          <button
            type="button"
            onClick={() => {
              void loadStatic();
              void loadSummary(rangeQuery);
              void loadTrends(rangeQuery);
            }}
            className="font-semibold text-[#6C63FF] underline"
          >
            重新載入
          </button>
          。
        </p>
      ) : null}
    </div>
  );
}
