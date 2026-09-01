"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ReportCase,
  ReportCaseDetailResponse,
  ReportCasesResponse,
  ReportEvent,
  ReportResolution,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
import {
  MATERIAL_STATUS_LABEL,
  REPORT_EVENT_LABEL,
  REPORT_RESOLUTION_HINT,
  REPORT_RESOLUTION_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  LEGACY_REPORT_STATUS_HINT,
  actorRoleLabel,
  isLegacyReportStatus,
} from "../../../lib/admin-labels";
import {
  AccentTextLink,
  DataToolbar,
  DetailField,
  DetailGrid,
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  Pagination,
  RefreshControl,
  SearchField,
  StatusPill,
} from "../../../components/ds";
import { AdminReviewPlaceholder, AdminReviewWorkspace } from "../../../components/admin/AdminReviewWorkspace";
import { MaterialFeedbackContext } from "../../../components/admin/MaterialFeedbackContext";

/**
 * 檢舉管理（Epic §2）。
 *
 * ## 這一頁取代了什麼
 *
 * 舊版只有一顆「標記已處理」—— `pending → reviewed`，沒有調查、沒有與創作者溝通、
 * 沒有處置、沒有歷程。Admin 能做的只有「把它從清單上弄掉」。
 *
 * 現在是一個案件流程：
 *   待處理 → 開始調查 → （必要時）要求創作者補充說明 → 創作者回覆 → 判定與處置。
 * 每一步都寫進 `report_events`，案件詳情就是完整的處理歷程。
 *
 * ## 狀態不是憑空新增的
 *
 * 五個狀態與四個處置都由 Backend 的 `utils/reportWorkflow.js` 定義，
 * 並經 `GET /admin/report-cases/:id` 的 `allowedTransitions` / `availableResolutions`
 * 回傳。UI **不自己判斷**哪些按鈕該出現 —— 那會在 workflow 改變時默默地過期。
 *
 * ## 沒有做的事
 *
 * 沒有即時聊天室（case-based response 而已）、沒有附件上傳（需要新的儲存與
 * 病毒掃描政策）、沒有推播通知（平台沒有 notifications 資料表）。
 * 創作者是主動到 `/creator/cases` 查看待回覆案件。
 */

/**
 * 篩選是**兩層**的：第一層是處理階段，第二層才是該階段內的細分狀態。
 *
 * 原本七個 chip 全部平鋪在同一層，但它們並不是同一個維度：
 * 「待處理中」= 新進 + 調查中 + 等待創作者，三者的數字會被第一個 chip 重複計入，
 * 看起來卻像七個互斥的選項。
 *
 * URL 仍然只有一個 `status` 參數（deep link 不變），第一層只是它的其中三個值。
 */
const OPEN = "open";
const ACTIONABLE = "actionable";
const CLOSED = "closed";

const OPEN_FILTERS = [OPEN, ACTIONABLE, "pending", "investigating", "awaiting_creator"] as const;
const CLOSED_FILTERS = [CLOSED, "resolved", "dismissed"] as const;
const FILTERS = [...OPEN_FILTERS, ...CLOSED_FILTERS, "all"] as const;

/**
 * UI filter → API `status`。
 *
 * `open` 是 Backend 既有的別名；`closed` 沒有對應的別名，因此展開成 CSV
 * （`GET /admin/report-cases?status=` 支援逗號分隔）。**API 沒有改動**。
 *
 * CSV 裡包含 legacy 的 `reviewed`：那是舊版「標記已讀」的終態，它確實是已結案的案件，
 * 不放進來的話這些案件只有在「全部」看得到，而各分類的數字也會加不回總數。
 */
const API_STATUS: Record<string, string | undefined> = {
  [OPEN]: "open",
  /*
   * **待我處理** = 球在 Admin 手上（`pending` + `investigating`）。
   *
   * 與 Backend `reportWorkflow.ADMIN_ACTIONABLE_REPORT_STATUSES` 以及 Dashboard
   * 待辦卡的 `actionableReportsCount` 是**同一個定義** —— Dashboard 的
   * `?status=actionable` deep link 就是連到這裡，點進來看到的清單與卡片數字一致。
   * `awaiting_creator` 不在其中：那是在等創作者回覆。
   */
  [ACTIONABLE]: "pending,investigating",
  pending: "pending",
  investigating: "investigating",
  awaiting_creator: "awaiting_creator",
  [CLOSED]: "resolved,dismissed,reviewed",
  resolved: "resolved",
  dismissed: "dismissed",
  all: undefined,
};

/** 目前 filter 屬於哪一個處理階段（第一層 chip 的選取狀態）。 */
function filterGroup(filter: string): typeof OPEN | typeof CLOSED | "all" {
  if ((OPEN_FILTERS as readonly string[]).includes(filter)) return OPEN;
  if ((CLOSED_FILTERS as readonly string[]).includes(filter)) return CLOSED;
  return "all";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function AdminReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const query = useListQueryState("/admin/reports", {
    /*
     * 預設「未結案」——側欄入口本來就帶 `?status=open`，Dashboard 待辦卡帶
     * `?status=actionable`；兩個主要入口都是明示的，預設值只服務直接打網址的情況。
     */
    defaultFilter: OPEN,
    allowedFilters: FILTERS,
    // 換篩選／換搜尋時一併關掉目前開啟的案件（`?case=`），見 hook 內的說明。
    resetParams: ["case"],
  });

  const [data, setData] = useState<ReportCasesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * 選取的案件放在 URL（`?case=<id>`）而不是純 local state。
   *
   * 這樣「教材檢舉脈絡頁 → 前往案件處理」可以直接深連到某一件案件；
   * 重新整理、複製網址給同事、上一頁下一頁也都成立。
   * 篩選／搜尋／分頁的 URL 契約完全不變（那些仍由 `useListQueryState` 管）。
   */
  const selectedId = searchParams?.get("case") || null;
  const setSelectedId = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next) params.set("case", next);
      else params.delete("case");
      const qs = params.toString();
      // `replace`：開關案件不該在瀏覽器歷史堆出一長串條目（與換篩選同一規則）。
      router.replace(qs ? `/admin/reports?${qs}` : "/admin/reports");
    },
    [router, searchParams]
  );
  /** 佇列頁的「最後更新」；沒有它，重新整理按鈕沒有可判斷的依據。 */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // 第二個參數會覆寫 `toApiQuery` 依 filter 自動帶上的 `status`（`closed` 需要展開成 CSV）。
  const apiQuery = query.toApiQuery({ status: API_STATUS[query.filter] });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/report-cases?${apiQuery}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as ReportCasesResponse);
      setUpdatedAt(new Date());
    } catch {
      setData(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.statusCounts ?? {};
  /**
   * `open`（未結案）= 案件還沒結束；`actionable`（待我處理）= 球在 Admin 手上。
   * 兩者刻意分開 —— `open = actionable + awaiting_creator`。
   */
  const actionableCount = (counts.pending ?? 0) + (counts.investigating ?? 0);
  const openCount = actionableCount + (counts.awaiting_creator ?? 0);
  /** legacy「標記已讀」的終態；仍算在已結案內，否則這些案件在分類中無處可去。 */
  const legacyReviewedCount = counts.reviewed ?? 0;
  const closedCount = (counts.resolved ?? 0) + (counts.dismissed ?? 0) + legacyReviewedCount;
  const group = filterGroup(query.filter);

  /**
   * 第一層＝**案件範圍**（案件的生命週期在哪一段）。
   *
   * 「未結案」而不是「待處理中」：這一組包含 `awaiting_creator`，而那些案件的球
   * 在創作者手上 —— 叫「待處理中」會讓人以為它們都是 Admin 的待辦，
   * 也正是它與 Dashboard 數字對不起來的原因。
   * 「現在我要處理什麼」由第二層的「待我處理」與 Dashboard 卡片回答。
   */
  const stageOptions = [
    { value: OPEN, label: "未結案", count: openCount },
    { value: CLOSED, label: "已結案", count: closedCount },
    { value: "all", label: "全部", count: openCount + closedCount },
  ];

  /** 第二層只在選定階段後出現；「全部」沒有細分。 */
  const detailOptions =
    group === OPEN
      ? [
          // 「待我處理」放第一個：那是這一頁的日常工作集合，也是 Dashboard 待辦卡的定義。
          { value: ACTIONABLE, label: "待我處理", count: actionableCount },
          { value: OPEN, label: "全部", count: openCount },
          { value: "pending", label: "新進", count: counts.pending },
          { value: "investigating", label: "調查中", count: counts.investigating },
          { value: "awaiting_creator", label: "等待創作者", count: counts.awaiting_creator },
        ]
      : group === CLOSED
        ? [
            { value: CLOSED, label: "全部", count: closedCount },
            { value: "resolved", label: "已處理", count: counts.resolved },
            { value: "dismissed", label: "已駁回", count: counts.dismissed },
          ]
        : [];

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  /** 取消選取由 hook 的 `resetParams` 一併處理，這裡不再額外 replace 一次 URL。 */
  const selectFilter = (next: string) => {
    query.setFilter(next);
  };

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="檢舉管理"
        description="從案件佇列查看檢舉內容、與創作者往返、做出判定並留下處理歷程。"
        action={<RefreshControl updatedAt={updatedAt} onRefresh={() => void load()} busy={loading} />}
      />

      <DataToolbar
        search={
          <SearchField
            id="admin-reports-search"
            label="搜尋檢舉案件"
            placeholder="搜尋教材標題、檢舉理由或相關人員 Email"
            value={query.search}
            /*
             * 換搜尋／換篩選一律取消選取（`?case=` 由 hook 的 `resetParams` 移除）：
             * 窄螢幕在選取狀態下是看不到清單的，不清掉的話使用者會停在一件不屬於
             * 新條件的案件上，而清單就在背後被換掉。
             */
            onSubmit={query.setSearch}
            disabled={loading}
          />
        }
        filters={
          <div className="space-y-2">
            {/*
              第一層＝**案件範圍**（還需不需要平台處理），用 segmented control：
              形狀本身就表達「這是主切換」，不會與第二層混淆。
            */}
            <FilterTabs
              ariaLabel="案件範圍"
              options={stageOptions}
              value={group}
              onChange={selectFilter}
              disabled={loading}
              variant="segmented"
            />
            {/*
              第二層＝**處理狀態**（球在誰手上）。label 刻意不是「細分」——
              那描述的是層級關係，不是這一層在篩什麼。
            */}
            {detailOptions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pl-1">
                <span className="text-caption text-ds-textSubtle">處理狀態</span>
                <FilterTabs
                  ariaLabel={group === OPEN ? "待處理中案件的處理狀態" : "已結案案件的處理狀態"}
                  options={detailOptions}
                  value={query.filter}
                  onChange={selectFilter}
                  disabled={loading}
                  // 兩層都有 value 為 `open` / `closed` 的「全部」，testid 必須分開。
                  testIdPrefix="filter-subtab"
                />
              </div>
            ) : null}
            {/*
              §8：等待創作者的案件必須看得見，但要讓 Admin 一眼知道那不是我方待辦。
            */}
            {query.filter === "awaiting_creator" ? (
              <p data-testid="awaiting-creator-hint" className="text-caption text-ds-textSubtle">
                這些案件正在等創作者回覆，不計入「待我處理」與 Dashboard 的待辦數字；創作者回覆後會自動回到「調查中」。
              </p>
            ) : null}
            {group === CLOSED && legacyReviewedCount > 0 ? (
              <p className="text-caption text-ds-textSubtle">
                其中 {legacyReviewedCount} 件為舊版「標記已讀」結案（沒有處置紀錄），只出現在「全部」。
              </p>
            ) : null}
          </div>
        }
      />

      <AdminReviewWorkspace
        listLabel="檢舉案件佇列"
        detailLabel="檢舉案件詳情"
        backLabel="返回案件清單"
        onBackToList={() => setSelectedId(null)}
        placeholder={
          <AdminReviewPlaceholder
            title="選擇一件檢舉案件"
            description="從左側佇列點選案件後，檢舉內容、處理歷程與可執行的動作都會顯示在這裡。"
          />
        }
        list={
          <div className="space-y-3">
            {loading ? <LoadingState title="載入檢舉案件中…" /> : null}
            {!loading && error ? (
              <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />
            ) : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState
                title="沒有符合條件的案件"
                description={query.search ? `找不到符合「${query.search}」的檢舉案件。` : "目前沒有需要處理的檢舉。"}
              />
            ) : null}

            {!loading && !error && items.length > 0 ? (
              <>
                {items.map((row) => (
                  <CaseRow
                    key={row.id}
                    row={row}
                    selected={selectedId === row.id}
                    onToggle={() => setSelectedId(selectedId === row.id ? null : row.id)}
                  />
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
              </>
            ) : null}
          </div>
        }
        detail={
          selectedId ? (
            /*
             * `key` 讓換案件時整個面板重新掛載：CaseDetail 內有 request / note /
             * resolution 的表單狀態，沿用同一個 instance 會把上一件案件打到一半的
             * 文字帶到下一件。
             */
            <CaseDetail
              key={selectedId}
              reportId={selectedId}
              onChanged={load}
              onClose={() => setSelectedId(null)}
            />
          ) : null
        }
      />
    </section>
  );
}

function CaseRow({
  row,
  selected,
  onToggle,
}: {
  row: ReportCase;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      data-testid="admin-report-row"
      aria-current={selected ? "true" : undefined}
      className={`rounded-ds-card border bg-ds-surface p-4 shadow-ds-card-soft transition-colors ${
        selected ? "border-edu-primary ring-1 ring-edu-primary" : "border-ds-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-title text-ds-heading">{row.material_title ?? row.material_id}</p>
          <p className="mt-0.5 text-meta text-ds-textMuted">創作者：{row.creator_email ?? row.creator_id ?? "—"}</p>
        </div>
        <StatusPill tone={REPORT_STATUS_TONE[row.status] ?? "neutral"} label={REPORT_STATUS_LABEL[row.status] ?? row.status} />
      </div>

      {row.reason ? <p className="mt-2 line-clamp-2 text-body text-ds-body">「{row.reason}」</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ds-textMuted">
        <span>檢舉人：{row.reporter_email ?? row.reporter_id ?? "—"}</span>
        <span>檢舉時間：{formatDateTime(row.created_at)}</span>
        {row.event_count ? <span>處理歷程 {row.event_count} 筆</span> : null}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={selected}
          data-testid="report-case-open"
          className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors ${
            selected
              ? "border border-ds-border bg-ds-surface text-ds-heading hover:bg-edu-page"
              : "bg-edu-primary text-white hover:brightness-95"
          }`}
        >
          {/* 雙欄版型下沒有「收合」這件事 —— 再按一次是取消選取。 */}
          {selected ? "取消選取" : "查看案件"}
        </button>
      </div>
    </article>
  );
}

function CaseDetail({
  reportId,
  onChanged,
  onClose,
}: {
  reportId: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ReportCaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [requestText, setRequestText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [resolution, setResolution] = useState<ReportResolution | "">("");
  const [resolutionNote, setResolutionNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/report-cases/${encodeURIComponent(reportId)}`);
      if (!res.ok) {
        setDetail(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setDetail((await res.json()) as ReportCaseDetailResponse);
    } catch {
      setDetail(null);
      setError("無法載入案件資料。");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, body: Record<string, unknown>, successMessage: string) {
    setMessage(null);
    setBusy(action);
    try {
      const res = await apiFetch(`admin/report-cases/${encodeURIComponent(reportId)}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage(successMessage);
      setRequestText("");
      setNoteText("");
      setResolutionNote("");
      setResolution("");
      await load();
      await onChanged();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingState title="載入案件中…" />;
  if (error) return <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const { report, events, availableResolutions, allowedTransitions } = detail;
  // 按鈕的可見性由 Backend 回傳的 allowedTransitions 決定，UI 不自行推論。
  const canInvestigate = allowedTransitions.includes("investigating") && report.status === "pending";
  const canRequestResponse = allowedTransitions.includes("awaiting_creator");
  const canResolve = allowedTransitions.includes("resolved") || allowedTransitions.includes("dismissed");
  const isClosed = allowedTransitions.length === 0;

  return (
    <article
      data-testid="report-case-detail"
      className="space-y-5 rounded-ds-card border border-edu-primary bg-ds-surface p-5 shadow-ds-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3 text-ds-heading">{report.material_title ?? report.material_id}</h2>
          <p className="mt-1 text-meta text-ds-textMuted">案件 ID：{report.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill
            tone={REPORT_STATUS_TONE[report.status] ?? "neutral"}
            label={REPORT_STATUS_LABEL[report.status] ?? report.status}
          />
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-ds-border px-3 text-sm font-medium text-ds-textMuted hover:bg-edu-page"
          >
            關閉
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-title text-ds-heading">案件資料</h3>
          {/*
            IA-03：檢舉案件詳情 → 被檢舉教材的活動時間軸。
            判定一件檢舉時要知道的是這份教材身上發生過什麼（被退回過幾次、
            換過檔案沒有、是不是已經被下架）。在這之前這一頁只連得到「此教材的檢舉」，
            也就是同一類事件，看不到教材本身的歷程。

            目的地是**既有**的 entity route（`/admin/materials/:materialId/activity-logs`），
            不在這裡複製第二套教材詳情，也不新增任何 API。
          */}
          {report.material_id ? (
            <AccentTextLink
              href={`/admin/materials/${encodeURIComponent(report.material_id)}/activity-logs`}
              className="text-sm"
              data-testid="report-case-material-activity-link"
            >
              查看此教材的活動紀錄
            </AccentTextLink>
          ) : null}
        </div>
        <DetailGrid>
          <DetailField label="檢舉理由">{report.reason ?? "—"}</DetailField>
          <DetailField label="檢舉時間">{formatDateTime(report.created_at)}</DetailField>
          <DetailField label="檢舉人">{report.reporter_email ?? report.reporter_id ?? "—"}</DetailField>
          <DetailField label="被檢舉教材">
            <Link
              href={`/admin/materials/${encodeURIComponent(report.material_id)}/reports`}
              className="text-edu-primary underline"
            >
              {report.material_title ?? report.material_id}
            </Link>
          </DetailField>
          <DetailField label="創作者">{report.creator_email ?? report.creator_id ?? "—"}</DetailField>
          <DetailField label="教材目前狀態">
            {MATERIAL_STATUS_LABEL[report.material_status as keyof typeof MATERIAL_STATUS_LABEL] ??
              report.material_status ??
              "—"}
          </DetailField>
          {report.resolution ? (
            <DetailField label="最終處置">{REPORT_RESOLUTION_LABEL[report.resolution]}</DetailField>
          ) : null}
          {report.reviewed_at ? (
            <DetailField label="結案時間">
              {formatDateTime(report.reviewed_at)}
              {report.reviewed_by_email ? `（${report.reviewed_by_email}）` : ""}
            </DetailField>
          ) : null}
        </DetailGrid>
        <p className="text-caption text-ds-textSubtle">
          目前沒有檢舉附件功能；檢舉內容僅有文字理由。
        </p>
      </section>

      {/*
        判斷檢舉時要看的教材脈絡：這份教材被使用者怎麼評價。
        唯讀，不提供任何回饋處置動作 —— 見 `MaterialFeedbackContext` 的說明。
      */}
      {report.material_id ? <MaterialFeedbackContext materialId={report.material_id} /> : null}

      <section className="space-y-2">
        <h3 className="text-title text-ds-heading">處理歷程</h3>
        {events.length === 0 ? (
          <p className="text-body text-ds-textMuted">尚未有任何處理紀錄。</p>
        ) : (
          <ol className="space-y-2" data-testid="report-case-timeline">
            {events.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>

      {isClosed ? (
        <div className="space-y-2 rounded-xl bg-edu-page p-4">
          <p className="text-body text-ds-textMuted">
            此案件已結案，不能再變更狀態。若有新事證，請由檢舉人重新提出檢舉。
          </p>
          {/*
            Legacy 案件要說清楚它「結案」的意思與新版不同 —— 它沒有處置紀錄。
            這裡不提供任何「重新處理」的 legacy 動作：那條路徑已經退出正式流程。
          */}
          {isLegacyReportStatus(report.status) ? (
            <p data-testid="report-case-legacy-hint" className="text-meta text-ds-textSubtle">
              {LEGACY_REPORT_STATUS_HINT}
            </p>
          ) : null}
        </div>
      ) : (
        <section className="space-y-4 rounded-xl bg-edu-page p-4">
          <h3 className="text-title text-ds-heading">處理動作</h3>

          {canInvestigate ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act("investigate", {}, "已接手此案件，狀態為調查中。")}
              data-testid="report-investigate"
              className="min-h-11 rounded-xl bg-edu-primary px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
            >
              {busy === "investigate" ? "處理中…" : "開始調查"}
            </button>
          ) : null}

          {canRequestResponse ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-meta text-ds-textMuted">要求創作者補充說明（創作者會在後台看到這段文字）</span>
                <textarea
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  rows={3}
                  data-testid="report-request-message"
                  placeholder="例如：請說明第 3 頁圖片的來源與授權"
                  className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
                />
              </label>
              <button
                type="button"
                disabled={busy !== null || !requestText.trim()}
                onClick={() =>
                  void act("request-response", { message: requestText.trim() }, "已要求創作者補充說明。")
                }
                data-testid="report-request-response"
                className="min-h-11 rounded-xl border border-edu-primary px-5 text-sm font-semibold text-edu-primary transition-colors hover:bg-white disabled:opacity-50"
              >
                {busy === "request-response" ? "處理中…" : "要求創作者說明"}
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block">
              <span className="text-meta text-ds-textMuted">內部調查筆記（只有管理員看得到）</span>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                rows={2}
                data-testid="report-admin-note"
                className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
              />
            </label>
            <button
              type="button"
              disabled={busy !== null || !noteText.trim()}
              onClick={() => void act("notes", { message: noteText.trim() }, "已新增內部筆記。")}
              className="min-h-11 rounded-xl border border-ds-border bg-ds-surface px-5 text-sm font-medium text-ds-heading transition-colors hover:bg-white disabled:opacity-50"
            >
              {busy === "notes" ? "處理中…" : "新增筆記"}
            </button>
          </div>

          {canResolve ? (
            <div className="space-y-2 border-t border-ds-borderMuted pt-4">
              <fieldset className="space-y-2">
                <legend className="text-meta text-ds-textMuted">最終處置</legend>
                {availableResolutions.map((code) => (
                  <label key={code} className="flex items-start gap-2 text-body text-ds-heading">
                    <input
                      type="radio"
                      name="report-resolution"
                      value={code}
                      checked={resolution === code}
                      onChange={() => setResolution(code)}
                      data-testid={`report-resolution-${code}`}
                      className="mt-1"
                    />
                    <span>
                      {REPORT_RESOLUTION_LABEL[code]}
                      <span className="block text-meta text-ds-textMuted">{REPORT_RESOLUTION_HINT[code]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="block">
                <span className="text-meta text-ds-textMuted">處置說明（選填，會記入案件歷程）</span>
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  rows={2}
                  data-testid="report-resolution-note"
                  className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
                />
              </label>
              <button
                type="button"
                disabled={busy !== null || !resolution}
                onClick={() =>
                  void act(
                    "resolve",
                    { resolution, note: resolutionNote.trim() || undefined },
                    "已完成處置並結案。"
                  )
                }
                data-testid="report-resolve"
                className="min-h-11 rounded-xl bg-edu-primary px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
              >
                {busy === "resolve" ? "處理中…" : "確認處置並結案"}
              </button>
            </div>
          ) : null}

          {message ? (
            <p data-testid="report-case-message" className="text-body text-edu-warning">
              {message}
            </p>
          ) : null}
        </section>
      )}
    </article>
  );
}

function TimelineItem({ event }: { event: ReportEvent }) {
  const resolution = typeof event.meta?.resolution === "string" ? (event.meta.resolution as ReportResolution) : null;
  const from = typeof event.meta?.from === "string" ? event.meta.from : null;
  const to = typeof event.meta?.to === "string" ? event.meta.to : null;

  return (
    <li className="rounded-xl border border-ds-borderMuted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-title text-ds-heading">{REPORT_EVENT_LABEL[event.event_type] ?? event.event_type}</span>
        <span className="text-meta text-ds-textMuted">
          {actorRoleLabel(event.actor_role)}
          {event.actor_email ? ` ${event.actor_email}` : ""} · {formatDateTime(event.created_at)}
        </span>
      </div>
      {resolution ? (
        <p className="mt-1 text-body text-ds-heading">處置：{REPORT_RESOLUTION_LABEL[resolution]}</p>
      ) : null}
      {!resolution && from && to ? (
        <p className="mt-1 text-meta text-ds-textMuted">
          {REPORT_STATUS_LABEL[from as keyof typeof REPORT_STATUS_LABEL] ?? from} →{" "}
          {REPORT_STATUS_LABEL[to as keyof typeof REPORT_STATUS_LABEL] ?? to}
        </p>
      ) : null}
      {event.message ? <p className="mt-1 whitespace-pre-wrap text-body text-ds-body">{event.message}</p> : null}
      {event.meta?.materialUnpublished === true ? (
        <p className="mt-1 text-meta text-edu-error">已將教材下架。</p>
      ) : null}
    </li>
  );
}

function AdminReportsFallback() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader title="檢舉管理" />
      <LoadingState title="載入檢舉案件中…" />
    </section>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<AdminReportsFallback />}>
      <AdminReportsContent />
    </Suspense>
  );
}
