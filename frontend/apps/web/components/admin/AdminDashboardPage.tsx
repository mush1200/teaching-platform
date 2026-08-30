"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ActivityLogRow,
  ActivityLogsListResponse,
  AdminDashboardSummary,
  AdminDashboardTrends,
  AdminMaterialsListResponse,
  Order,
  OrdersListResponse,
} from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";
import { ATTENTION_ACTIVITY_ACTION_QUERY, ATTENTION_ORDER_STATUSES } from "../../lib/admin-labels";
import { comparisonLabel, formatIsoDateForDisplay, parseRangeSelection, toRangeQuery, type RangeSelection } from "../../lib/reportingRange";
import { AdminKpiCard, type KpiComparison } from "./AdminKpiCard";
import { AdminTaskCard } from "./AdminTaskCard";
import { ReportingRangeSelector } from "../reporting/ReportingRangeSelector";
import { AttentionActivityList } from "./AttentionActivityList";
import { AttentionOrdersTable } from "./AttentionOrdersTable";
import { TrendChart } from "../reporting/TrendChart";

/**
 * 「需要注意的訂單」／「需要注意的活動」各顯示幾筆。
 * 兩者都以此值向後端要資料 —— 這是**畫面容量**上限，不是篩選條件：
 * 挑哪些訂單／哪些事件一律由 API 決定（`?status=` 與 `?action=`），前端不自己過濾。
 */
const ATTENTION_LIMIT = 8;

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
  activities: ActivityLogRow[];
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
 * - 期間選擇器**只**控制「本期表現」。待處理卡、平台摘要、需要注意的訂單／活動
 *   一律是 current snapshot，永遠不受期間影響 —— 待辦被期間濾掉不代表已處理完。
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
    const [materialsRes, activitiesRes, ...attentionOrderResults] = await Promise.allSettled([
      // `limit=1`：只要 statusCounts，不需要任何一頁的內容。
      apiFetch("admin/materials?limit=1"),
      /*
       * 需要注意的活動（IA-05）：allowlist 直接送給 API 篩選。
       * 不抓一大頁回來自己 filter —— 高頻事件（加入購物車、下載）會把異常擠出視窗，
       * widget 就會顯示「沒有異常」而其實有，那是靜默漏顯示。
       */
      apiFetch(
        `admin/activity-logs?page=1&limit=${ATTENTION_LIMIT}` +
          `&action=${encodeURIComponent(ATTENTION_ACTIVITY_ACTION_QUERY)}`,
      ),
      /*
       * 需要注意的訂單（IA-04）：每個 attention 狀態各發一次既有的 `?status=` 查詢。
       *
       * 為什麼不抓全部訂單再前端 filter：`GET /admin/orders` 自 `IA-06` 起**已經分頁**
       * （預設 20 筆／頁）。「抓全部再自己算」會安靜地只看到第一頁，
       * 正如教材 KPI 曾經踩過的同一個坑（見上方 materialCounts 的註解）。
       * 用 API 既有的 canonical 篩選，這個 widget 不受分頁影響 ——
       * `ATTENTION_LIMIT`（8）小於預設頁大小，需要注意的訂單不會被切掉。
       */
      ...ATTENTION_ORDER_STATUSES.map((status) => apiFetch(`admin/orders?status=${status}`)),
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
    next.activities =
      (await resolvePayload<ActivityLogsListResponse>(activitiesRes, "activities"))?.items ?? [];

    /*
     * 任何一個 attention 狀態取不到，整個 widget 就進錯誤態。
     * 只顯示拿得到的那一半更糟：畫面看起來正常，實際上少了一整類需要處理的訂單。
     */
    const attentionOrders: Order[] = [];
    for (const result of attentionOrderResults) {
      const payload = await resolvePayload<OrdersListResponse>(result, "orders");
      if (payload) attentionOrders.push(...(payload.items ?? []));
    }
    next.orders = next.errors.orders
      ? []
      : attentionOrders
          // 合併兩組查詢結果後重新排序。順序與各查詢一致（created_at DESC），
          // 這裡只是把兩份已排序的清單併回一份，沒有引入第二種排序規則。
          .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))
          .slice(0, ATTENTION_LIMIT);

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
   * 比較列。`deltaPercent` 直接採用 Backend 的 canonical 值（含 `null` = 前期為 0），
   * 前端不重算任何數學；文案依 preset 決定，`title` 補上實際的比較基準期。
   *
   * `current` / `previous` 只用來區分「兩期都是 0」與「有資料但持平」——
   * 後端對兩者都回傳 `deltaPercent = 0`，把它們顯示成同一句話會讓「這段期間根本沒有
   * 任何資料」看起來像「業績穩定」。這是**顯示層**的判斷，沒有改動任何統計定義。
   */
  const comparisonFor = (
    deltaPercent: number | null | undefined,
    current: number | null | undefined,
    previous: number | null | undefined,
  ): KpiComparison | null => {
    if (data == null || deltaPercent === undefined) return null;
    return {
      deltaPercent,
      emptyBothPeriods: deltaPercent === 0 && Number(current ?? 0) === 0 && Number(previous ?? 0) === 0,
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
          {/*
            subtext 只留在「營收」—— 它補充了標題沒說的統計條件（僅計已核准）。
            四張「新增類」卡片的「所選期間」與區塊標題／日期區間重複，已移除。
          */}
          <AdminKpiCard label="營收" value={formatMoney(data?.periodRevenueAmount)} subtext="所選期間已核准" loading={periodLoading} comparison={comparisonFor(data?.revenueDeltaPercent, data?.periodRevenueAmount, data?.previousPeriodRevenueAmount)} />
          <AdminKpiCard label="新增訂單" value={formatCount(data?.newOrdersCount)} loading={periodLoading} comparison={comparisonFor(data?.newOrdersDeltaPercent, data?.newOrdersCount, data?.previousNewOrdersCount)} />
          <AdminKpiCard label="新增用戶" value={formatCount(data?.newUsersCount)} loading={periodLoading} comparison={comparisonFor(data?.newUsersDeltaPercent, data?.newUsersCount, data?.previousNewUsersCount)} />
          <AdminKpiCard label="新增教材" value={formatCount(data?.newMaterialsCount)} loading={periodLoading} comparison={comparisonFor(data?.newMaterialsDeltaPercent, data?.newMaterialsCount, data?.previousNewMaterialsCount)} />
          <AdminKpiCard label="新增教學回饋" value={formatCount(data?.newReviewsCount)} loading={periodLoading} comparison={comparisonFor(data?.newReviewsDeltaPercent, data?.newReviewsCount, data?.previousNewReviewsCount)} />
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
          {/*
            待處理檢舉 = **球在 Admin 手上**的案件（`pending` + `investigating`），
            由 Backend 依 `reportWorkflow.ADMIN_ACTIONABLE_REPORT_STATUSES` 計算。
            `awaiting_creator` 不計 —— 那是在等創作者回覆，不是我方待辦
            （與教材的 `changes_requested` 同一條原則）。
            deep link 用 `?status=actionable`，點進去看到的清單與這個數字**完全一致**。
          */}
          <AdminTaskCard icon="🚩" title="待處理檢舉" count={data ? data.actionableReportsCount : null} loading={summaryPending} description="新進與調查中的案件，等待你處理。" href="/admin/reports?status=actionable" />
        </div>

        {/*
          **逾期申訴告警**（`P1-09` Gate 3 / Wave 2 #11）。

          刻意**只在真的有逾期時才出現** —— 沒有逾期就不顯示，不製造假警告。
          這與上方常駐的待辦卡不同：那些是日常佇列（0 也有意義），
          這個是**已違反法定期限**的例外狀態，常駐顯示「0 件逾期」只會鈍化它。

          數字與 deep link 指向的集合來自**同一個 backend 判準**
          （`consumerComplaint.service.js` 的 `OVERDUE_SQL`）——
          前端不做任何日期比較。
        */}
        {data && data.overdueComplaintsCount > 0 ? (
          <div
            role="status"
            data-testid="overdue-complaints-alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-ds-card border border-edu-error/40 bg-status-rejectedBg p-4"
          >
            <div className="min-w-0">
              <p className="text-body font-semibold text-status-rejectedText">
                <span aria-hidden className="mr-1">⏰</span>
                逾期申訴
              </p>
              <p className="mt-1 text-meta text-status-rejectedText">
                <span data-testid="overdue-complaints-count">{data.overdueComplaintsCount}</span> 件已超過消費者保護法規定的十五日處理期限，需要優先處理。
              </p>
            </div>
            <Link
              href="/admin/complaints?status=overdue"
              data-testid="overdue-complaints-cta"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-edu-error px-4 text-sm font-semibold text-white"
            >
              查看逾期申訴
            </Link>
          </div>
        ) : null}
      </section>

      {/*
        需要注意（IA-04 / IA-05）。訂單在左／活動在右：訂單牽涉金額與狀態、可直接處理，
        活動紀錄偏稽核軌跡。JSX 順序同時決定 breakpoint 以下的堆疊順序。
        items-start：兩張卡各自取自然高度，避免較短的一張被 stretch 出大片空白。

        這兩張卡**不再是** latest-N feed。舊版顯示「最新的 8 筆訂單／事件」，
        回答的是「剛剛發生了什麼」—— 那個問題已由 KPI 與趨勢圖回答，
        Admin 從清單裡得不到任何行動（IA §1 結論 2、§11 原則 1）。
        現在兩者都是 exception feed：
          訂單 —— Backend `operational_status` ∈ ATTENTION_ORDER_STATUSES
          活動 —— Backend `action` ∈ ATTENTION_ACTIVITY_ACTIONS

        仍然**不受期間控制**，理由與待處理卡相同：需要處理的東西不會因為
        它發生在所選期間之外就不需要處理。兩者都是 current snapshot。
      */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AttentionOrdersTable orders={staticState.orders} loading={staticState.loading} error={staticState.errors.orders ?? null} />
        <AttentionActivityList items={staticState.activities} loading={staticState.loading} error={staticState.errors.activities ?? null} />
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
