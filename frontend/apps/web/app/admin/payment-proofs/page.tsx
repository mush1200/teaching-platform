"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import type {
  AdminPaymentProofDetailResponse,
  AdminPaymentProofRow,
  AdminPaymentProofsListResponse,
  PaymentRejectionReason,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import { useListQueryState } from "../../../lib/useListQueryState";
import {
  PAYMENT_REJECTION_REASONS,
  PAYMENT_REJECTION_REASON_LABEL,
  PAYMENT_REVIEW_STATUS_LABEL,
  PAYMENT_REVIEW_STATUS_TONE,
  REASON_REQUIRING_NOTE,
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
import {
  downloadPaymentProof,
  fetchPaymentProofObjectUrl,
  revokeProofObjectUrl,
} from "../../../lib/payment-proof";

/**
 * 付款審核（Epic §3 / §4）。
 *
 * ## 取代了什麼
 *
 * 舊版有一張「手動審核（若已知憑證 ID）」的表單 —— 要 Admin 手動輸入
 * `manual_payment_proofs.id` 才能操作。那是把 internal identifier 當成主要 UX。
 * 現在的入口是 **搜尋訂單編號或購買者 Email**，選一筆之後進入審核面板。
 * Internal id 仍然存在（列尾的 metadata、API、URL），只是不再是找到案件的方式。
 *
 * ## Decision context
 *
 * 選取一筆之後，同一個畫面內就有：訂單編號、購買者、應付金額、建立時間、付款期限、
 * 訂單明細、憑證影像、**同一張訂單先前被退回的理由**。核准／退回按鈕就在旁邊。
 *
 * ## 這個平台沒有的東西（不編造）
 *
 * `POST /orders/:id/payment-proof` 只收檔案，沒有付款日期／匯款金額／帳號末碼／
 * 付款人姓名，`manual_payment_proofs` 也沒有這些欄位。因此**沒有**「使用者付款申報」
 * 區塊 —— 那需要先改買家端的上傳流程與 schema，列在最終報告的待決事項。
 */

const ALL = "all";
const FILTERS = [ALL, "pending", "approved", "rejected"] as const;

function formatMoney(value?: number | null) {
  if (value == null) return "—";
  return `NT$ ${Math.floor(Number(value)).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

/** 逾期只是提示，不是阻擋條件 —— 逾期的付款仍然可以被核准。 */
function isOverdue(dueAt?: string | null) {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

function AdminPaymentProofsContent() {
  const query = useListQueryState("/admin/payment-proofs", {
    defaultFilter: "pending",
    allowedFilters: FILTERS,
  });

  const [data, setData] = useState<AdminPaymentProofsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 佇列頁的「最後更新」；沒有它，重新整理按鈕沒有可判斷的依據。 */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [detail, setDetail] = useState<AdminPaymentProofDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const apiQuery = query.toApiQuery();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/payment-proofs?${apiQuery}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as AdminPaymentProofsListResponse);
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

  const loadDetail = useCallback(async (proofId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`admin/payment-proofs/${encodeURIComponent(proofId)}`);
      if (!res.ok) {
        setDetail(null);
        setDetailError(await parseApiErrorMessage(res));
        return;
      }
      setDetail((await res.json()) as AdminPaymentProofDetailResponse);
    } catch {
      setDetail(null);
      setDetailError("無法載入審核資料。");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    // 換一筆案件時先清空：留著上一筆的內容會讓 Admin 看到別人的訂單金額。
    setDetail(null);
    if (!selectedId) return;
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const counts = data?.statusCounts;
  const filterOptions = [
    { value: ALL, label: "全部", count: counts?.total },
    { value: "pending", label: "待審核", count: counts?.pending },
    { value: "approved", label: "已核准", count: counts?.approved },
    { value: "rejected", label: "已退回", count: counts?.rejected },
  ];

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  /*
   * 換篩選／換搜尋一律取消選取：窄螢幕在選取狀態下是看不到清單的，
   * 不清掉的話使用者會停在一筆不屬於新條件的案件上，而清單就在背後被換掉。
   */
  const selectFilter = (next: string) => {
    setSelectedId(null);
    query.setFilter(next);
  };
  const submitSearch = (next: string) => {
    setSelectedId(null);
    query.setSearch(next);
  };

  async function afterDecision() {
    await load();
    if (selectedId) await loadDetail(selectedId);
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="付款審核"
        description="搜尋訂單編號或購買者 Email 找到案件，於同一畫面完成判斷與處理。"
        action={<RefreshControl updatedAt={updatedAt} onRefresh={() => void load()} busy={loading} />}
      />

      <DataToolbar
        search={
          <SearchField
            id="admin-payment-search"
            label="搜尋付款案件"
            placeholder="搜尋訂單編號或購買者 Email"
            value={query.search}
            onSubmit={submitSearch}
            disabled={loading}
          />
        }
        filters={
          <FilterTabs
            ariaLabel="付款審核狀態篩選"
            options={filterOptions}
            value={query.filter}
            onChange={selectFilter}
            disabled={loading}
          />
        }
      />

      <AdminReviewWorkspace
        listLabel="付款案件佇列"
        detailLabel="付款審核詳情"
        backLabel="返回案件清單"
        onBackToList={() => setSelectedId(null)}
        placeholder={
          <AdminReviewPlaceholder
            title="選擇一筆付款案件"
            description="從左側佇列點選案件後，訂單資料、憑證影像與審核決定都會顯示在這裡。"
          />
        }
        list={
          <div className="space-y-3">
            {loading ? <LoadingState title="載入付款案件中…" /> : null}
            {!loading && error ? (
              <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />
            ) : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState
                title="沒有符合條件的付款案件"
                description={
                  query.search
                    ? `找不到符合「${query.search}」的案件。可以試試完整的訂單編號，或購買者的 Email。`
                    : "此狀態目前沒有待處理的付款案件。"
                }
              />
            ) : null}

            {!loading && !error && items.length > 0 ? (
              <>
                {items.map((row) => (
                  <ProofRow
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
            <div data-testid="payment-review-panel" className="space-y-3">
              {/*
               * 重新載入時**不卸載**已顯示的面板。
               *
               * 核准／退回之後會重新抓一次詳情；若在 `detailLoading` 期間把面板換成 loading，
               * React 會卸載它，面板內的「已核准／已退回」訊息與表單狀態就一起消失了 ——
               * Admin 按下按鈕後只會看到畫面閃一下，不知道到底成功了沒有。
               * 只有「還沒有任何資料」時才顯示 loading。
               */}
              {detailLoading && !detail ? <LoadingState title="載入審核資料中…" /> : null}
              {detailError && !detail ? (
                <ErrorState title="載入失敗" description={detailError} onRetry={() => void loadDetail(selectedId)} />
              ) : null}
              {detailError && detail ? (
                <ErrorState
                  variant="inline"
                  title="更新審核資料失敗"
                  description={detailError}
                  onRetry={() => void loadDetail(selectedId)}
                />
              ) : null}
              {detail ? (
                <PaymentReviewPanel detail={detail} onDone={afterDecision} onClose={() => setSelectedId(null)} />
              ) : null}
            </div>
          ) : null
        }
      />
    </section>
  );
}

function ProofRow({
  row,
  selected,
  onToggle,
}: {
  row: AdminPaymentProofRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const overdue = isOverdue(row.order_payment_due_at);
  /*
   * 按鈕文案跟著 `review_status` 走。
   *
   * `manual_payment_proofs.review_status` 只有 `pending` / `approved` / `rejected`
   * 三個值 —— **沒有**「審核中」這個狀態，因此不會有「繼續審核」。已核准／已退回的
   * 案件面板本來就是唯讀的（`decided` 分支不 render 核准／退回按鈕），文案寫成
   * 「開始審核」只是把唯讀詳情講成可以再審一次。
   */
  const pending = row.review_status === "pending";
  const openLabel = pending ? "開始審核" : "查看詳情";
  return (
    <article
      data-testid="admin-payment-proof-row"
      aria-current={selected ? "true" : undefined}
      className={`rounded-ds-card border bg-ds-surface p-4 shadow-ds-card-soft transition-colors ${
        selected ? "border-edu-primary ring-1 ring-edu-primary" : "border-ds-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 訂單編號是 Admin 手上真的會有的識別；憑證 id 降到最下方的 metadata。 */}
          <p className="truncate text-title text-ds-heading">訂單 {row.order_id}</p>
          <p className="mt-0.5 text-meta text-ds-textMuted">{row.buyer_email ?? row.user_id ?? "—"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {overdue && row.review_status === "pending" ? <StatusPill tone="warning" label="已逾付款期限" /> : null}
          {/* 核帳逾時與付款逾期是**兩件事**：前者是平台自己的處理義務逾期。 */}
          {row.review_overdue && row.review_status === "pending" ? (
            <StatusPill tone="danger" label="核帳已逾時" />
          ) : null}
          <StatusPill
            tone={PAYMENT_REVIEW_STATUS_TONE[row.review_status] ?? "neutral"}
            label={PAYMENT_REVIEW_STATUS_LABEL[row.review_status] ?? row.review_status}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ds-textMuted">
        <span className="font-semibold text-ds-heading">{formatMoney(row.order_total_amount)}</span>
        <span>上傳：{formatDateTime(row.uploaded_at ?? row.created_at)}</span>
        {(row.order_proof_count ?? 0) > 1 ? <span>此訂單共 {row.order_proof_count} 張憑證</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          data-testid="payment-proof-open"
          aria-expanded={selected}
          className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors ${
            pending
              ? "bg-edu-primary text-white hover:brightness-95"
              : "border border-ds-border bg-ds-surface text-ds-heading hover:bg-edu-page"
          }`}
        >
          {/* 雙欄版型下「收合」已不成立 —— 再按一次是取消選取，右欄回到提示。 */}
          {selected ? "取消選取" : openLabel}
        </button>
        <span className="text-caption text-ds-textSubtle">憑證 ID：{row.id}</span>
      </div>
    </article>
  );
}

/**
 * 審核面板：判斷所需的一切 + 決定。
 *
 * 拒絕**必須**選一個原因（Backend 也會擋，見 `utils/paymentProofReview.js`）；
 * 選「其他」時補充說明變成必填，否則買家收到的是一句空話。
 */
/**
 * 憑證影像的安全 inline 預覽。
 *
 * ## 為什麼要一個元件而不是一行 `<img src>`
 *
 * 憑證讀取端點要求 `Authorization: Bearer`，而 `<img>` 的子資源請求不會帶這個 header
 * （見 `lib/payment-proof.ts`）。所以位元組必須先用 `apiFetch` 取回來、轉成 object URL，
 * 再交給 `<img>` —— 那是一個非同步、可能失敗、而且**必須在卸載時釋放**的流程。
 *
 * ## 為什麼仍然是 inline 預覽而不是「下載後自己開」
 *
 * 付款審核是一天要做幾十次的動作，審核者要看的就是那張匯款畫面。改成每次都得先
 * 下載到電腦再開，等於把一步變成三步 —— 安全性沒有因此提高（位元組一樣交出去了），
 * 只是把成本轉嫁給審核者。「下載原始檔」另外留一顆按鈕，而且**只有那個動作寫稽核**。
 */
function PaymentProofPreview({
  orderId,
  proofId,
  available,
  filename,
}: {
  orderId: string;
  proofId: string;
  available: boolean;
  filename: string | null;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!available) {
      setObjectUrl(null);
      setError(null);
      return;
    }
    // 換一筆憑證時要中止上一筆還在飛的請求，否則慢的那個回來會蓋掉新的預覽。
    const controller = new AbortController();
    let created: string | null = null;
    setLoading(true);
    setError(null);
    fetchPaymentProofObjectUrl(orderId, proofId, { signal: controller.signal })
      .then((url) => {
        created = url;
        setObjectUrl(url);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "憑證影像載入失敗。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      // object URL 不釋放就是把整張圖一直留在分頁記憶體裡。
      revokeProofObjectUrl(created);
      setObjectUrl(null);
    };
  }, [orderId, proofId, available]);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadPaymentProof(orderId, proofId, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "下載失敗，請稍後再試。");
    } finally {
      setDownloading(false);
    }
  }

  if (!available) {
    return (
      <p className="text-body text-ds-textMuted" data-testid="payment-proof-unavailable">
        此筆沒有可顯示的憑證影像（舊資料尚未轉入安全儲存，或檔案已遺失）。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {loading ? <p className="text-body text-ds-textMuted">憑證影像載入中…</p> : null}
      {objectUrl ? (
        /* object URL 指向瀏覽器記憶體中的 blob，不是可最佳化的遠端圖片 */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={objectUrl}
          alt={`訂單 ${orderId} 的付款憑證`}
          data-testid="payment-proof-image"
          className="max-h-[420px] w-full rounded-xl border border-ds-borderMuted bg-edu-page object-contain"
        />
      ) : null}
      {error ? <p className="text-body text-edu-error">{error}</p> : null}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        data-testid="payment-proof-download"
        className="inline-block text-sm font-medium text-edu-primary underline disabled:opacity-60"
      >
        {downloading ? "下載中…" : "下載原始憑證檔"}
      </button>
    </div>
  );
}

function PaymentReviewPanel({
  detail,
  onDone,
  onClose,
}: {
  detail: AdminPaymentProofDetailResponse;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const { proof, orderItems, otherProofs } = detail;
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState<PaymentRejectionReason>("amount_mismatch");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /*
   * 平台在銀行帳戶**實際觀察到**的入帳時間（P1-09 Gate 6）。
   *
   * **刻意留空，不預設任何值** —— 不預設 NOW()、不抄買家申報的匯款時間、
   * 也不抄 `paid_at`。Admin 不知道真正入帳時間時就留空，保持 NULL，
   * 而不是製造一個看起來精確其實是猜的時間。
   */
  const [paymentReceivedAt, setPaymentReceivedAt] = useState("");

  const decided = proof.review_status !== "pending";
  const noteRequired = reason === REASON_REQUIRING_NOTE;

  async function submit(action: "approve" | "reject") {
    if (action === "reject" && noteRequired && !note.trim()) {
      setMessage("選擇「其他」時必須填寫說明，購買者才知道要怎麼補件。");
      return;
    }
    setMessage(null);
    setBusy(action);
    try {
      const body =
        action === "reject"
          ? { rejection_reason: reason, note: note.trim() || undefined }
          : {
              note: note.trim() || undefined,
              // 只在 Admin 真的填了才送 —— 沒填就不帶這個鍵，後端維持既有值（多為 NULL）。
              paymentReceivedAt: paymentReceivedAt.trim()
                ? new Date(paymentReceivedAt).toISOString()
                : undefined,
            };
      const res = await apiFetch(`admin/payment-proofs/${encodeURIComponent(proof.id)}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage(action === "approve" ? "已核准付款，訂單狀態已更新。" : "已退回付款憑證，購買者會收到通知。");
      setMode("idle");
      setNote("");
      setPaymentReceivedAt("");
      await onDone();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="space-y-5 rounded-ds-card border border-edu-primary bg-ds-surface p-5 shadow-ds-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-ds-heading">審核訂單 {proof.order_id}</h2>
          <p className="mt-1 text-meta text-ds-textMuted">憑證 ID：{proof.id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 rounded-xl border border-ds-border px-3 text-sm font-medium text-ds-textMuted hover:bg-edu-page"
        >
          關閉
        </button>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-title text-ds-heading">訂單資料</h3>
          {/*
            IA-03：付款審核面板 → 該訂單的活動時間軸。
            判斷一張憑證時常需要知道「這張訂單之前發生過什麼」（上傳過幾次、
            上一次為什麼被退、通知信有沒有寄出去）。在這之前，Admin 必須離開審核面板、
            自己回到活動紀錄再搜一次訂單編號。

            目的地是**既有**的 entity route（`/admin/orders/:orderId/activity-logs`），
            不在這裡複製第二套訂單詳情，也不新增任何 API。
          */}
          <AccentTextLink
            href={`/admin/orders/${encodeURIComponent(proof.order_id)}/activity-logs`}
            className="text-sm"
            data-testid="payment-proof-order-activity-link"
          >
            查看此訂單的活動紀錄
          </AccentTextLink>
        </div>
        <DetailGrid>
          <DetailField label="訂單編號">{proof.order_id}</DetailField>
          <DetailField label="購買者">{proof.buyer_email ?? proof.user_id ?? "—"}</DetailField>
          <DetailField label="應付金額">{formatMoney(proof.order_total_amount)}</DetailField>
          <DetailField label="付款方式">
            {proof.order_payment_mode === "manual_transfer" ? "銀行轉帳（人工核帳）" : (proof.order_payment_mode ?? "—")}
          </DetailField>
          <DetailField label="訂單建立時間">{formatDateTime(proof.order_created_at)}</DetailField>
          <DetailField label="平台收到付款通知">
            {formatDateTime(proof.order_payment_info_submitted_at)}
          </DetailField>
          <DetailField label="銀行實際入帳時間">
            {proof.order_payment_received_at ? (
              formatDateTime(proof.order_payment_received_at)
            ) : (
              <span className="text-ds-muted">尚未確認</span>
            )}
          </DetailField>
          <DetailField label="付款期限">
            {proof.order_payment_due_at ? (
              <span className={isOverdue(proof.order_payment_due_at) ? "text-edu-error" : undefined}>
                {formatDateTime(proof.order_payment_due_at)}
                {isOverdue(proof.order_payment_due_at) ? "（已逾期）" : ""}
              </span>
            ) : (
              // legacy 訂單：**不得**顯示推算出來的假期限。
              <span className="text-ds-muted">未設定付款期限（舊訂單）</span>
            )}
          </DetailField>
          {/*
            Admin 必須看得出「買家現在還能不能補件」（Wave 2 #12）——
            否則會出現 Admin 請買家重傳、但 backend 回 409 的矛盾。
            **值來自 backend canonical 判準**，前端不自行計算 eligibility。
          */}
          <DetailField label="買家可否補件">
            {proof.order_payment_submission_allowed === false ? (
              <span className="text-edu-error" data-testid="admin-submission-blocked">
                否 —— 付款期限已過且未曾於期限內提交
              </span>
            ) : (
              <span data-testid="admin-submission-allowed">
                可以
                {proof.order_payment_deadline_expired
                  ? "（期限雖已過，但買家曾於期限內提交，仍可重傳）"
                  : ""}
              </span>
            )}
          </DetailField>
          <DetailField label="核帳期限">
            {proof.order_review_due_at ? (
              <span className={proof.review_overdue ? "text-edu-error" : undefined}>
                {formatDateTime(proof.order_review_due_at)}
                {proof.review_overdue ? "（已逾時）" : ""}
              </span>
            ) : (
              <span className="text-ds-muted">尚未提交付款資訊</span>
            )}
          </DetailField>
          {proof.order_discount_amount ? (
            <DetailField label="折扣">
              -{formatMoney(proof.order_discount_amount)}
              {proof.order_promo_code ? `（${proof.order_promo_code}）` : ""}
            </DetailField>
          ) : null}
        </DetailGrid>

        {/*
          * **買家申報的匯款資訊** —— 標題與每個標籤都必須明確標示這是買家提供的，
          * 不得寫成「實際入帳銀行／金額／時間」。平台查證的事實在上方的
          * 「銀行實際入帳時間」，兩個來源刻意並存（付款爭議時兩邊都要留得住）。
          */}
        {proof.reported_bank_name ||
        proof.reported_account_last4 ||
        proof.reported_amount != null ||
        proof.reported_transfer_at ? (
          <section className="mt-2 rounded-xl border border-ds-borderMuted bg-ds-surfaceMuted p-4">
            <h3 className="text-sm font-semibold text-ds-heading">購買者申報的匯款資訊</h3>
            <p className="mt-1 text-xs text-ds-muted">
              以下由購買者填寫，尚未經平台查證，請與銀行帳戶紀錄核對後再決定。
            </p>
            <div className="mt-3">
            <DetailGrid>
              <DetailField label="購買者填寫的匯款銀行">{proof.reported_bank_name ?? "—"}</DetailField>
              <DetailField label="購買者填寫的帳號末四碼">
                {proof.reported_account_last4 ? `****${proof.reported_account_last4}` : "—"}
              </DetailField>
              <DetailField label="購買者填寫的匯款金額">
                {proof.reported_amount == null ? "—" : formatMoney(proof.reported_amount)}
              </DetailField>
              <DetailField label="購買者填寫的匯款時間">
                {formatDateTime(proof.reported_transfer_at)}
              </DetailField>
            </DetailGrid>
            </div>
          </section>
        ) : (
          <p className="mt-2 text-xs text-ds-muted">購買者未填寫匯款資訊，請直接以憑證圖片與銀行紀錄核對。</p>
        )}

        {orderItems.length > 0 ? (
          <ul className="mt-2 divide-y divide-ds-borderMuted rounded-xl border border-ds-borderMuted">
            {orderItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body">
                <span className="min-w-0 truncate text-ds-heading">{item.material_title}</span>
                <span className="shrink-0 text-ds-textMuted">
                  × {item.quantity} · {formatMoney(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-title text-ds-heading">憑證</h3>
        <DetailGrid>
          <DetailField label="上傳時間">{formatDateTime(proof.uploaded_at ?? proof.created_at)}</DetailField>
          <DetailField label="檔案">
            {proof.original_filename ?? "—"}
            {proof.proof_size_bytes ? `（${Math.round(proof.proof_size_bytes / 1024)} KB）` : ""}
          </DetailField>
        </DetailGrid>
        <PaymentProofPreview
          orderId={proof.order_id}
          proofId={proof.id}
          available={proof.proof_file_available !== false}
          filename={proof.original_filename ?? null}
        />
      </section>

      {otherProofs.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-title text-ds-heading">此訂單的其他憑證</h3>
          <ul className="space-y-2">
            {otherProofs.map((other) => (
              <li key={other.id} className="rounded-xl border border-ds-borderMuted p-3 text-body">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    tone={PAYMENT_REVIEW_STATUS_TONE[other.review_status] ?? "neutral"}
                    label={PAYMENT_REVIEW_STATUS_LABEL[other.review_status] ?? other.review_status}
                  />
                  <span className="text-meta text-ds-textMuted">{formatDateTime(other.uploaded_at)}</span>
                </div>
                {other.rejection_reason ? (
                  <p className="mt-1 text-ds-heading">
                    退回原因：{PAYMENT_REJECTION_REASON_LABEL[other.rejection_reason]}
                  </p>
                ) : null}
                {other.note ? <p className="mt-0.5 text-ds-textMuted">備註：{other.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl bg-edu-page p-4">
        <h3 className="text-title text-ds-heading">審核決定</h3>

        {decided ? (
          <div className="space-y-1 text-body">
            <p className="text-ds-heading">
              此憑證已於 {formatDateTime(proof.reviewed_at)} 由 {proof.reviewed_by_email ?? proof.reviewed_by ?? "—"} 處理。
            </p>
            {proof.rejection_reason ? (
              <p className="text-ds-textMuted">
                退回原因：{PAYMENT_REJECTION_REASON_LABEL[proof.rejection_reason]}
              </p>
            ) : null}
            {proof.note ? <p className="text-ds-textMuted">備註：{proof.note}</p> : null}
          </div>
        ) : mode === "idle" ? (
          <>
            {/*
              * 銀行實際入帳時間（P1-09 Gate 6）。**選填、且不預設任何值。**
              * 它與 `paid_at`（Admin 按下核准的那一刻）是兩件事：
              * 前者是銀行帳戶上發生的事實，後者是平台的核准動作。
              * 不知道就留空 —— 保持 NULL 比填一個猜的時間誠實。
              */}
            <label className="block">
              <span className="text-meta text-ds-textMuted">
                銀行實際入帳時間（選填；不確定請留空，不要猜）
              </span>
              <input
                type="datetime-local"
                value={paymentReceivedAt}
                onChange={(event) => setPaymentReceivedAt(event.target.value)}
                data-testid="payment-received-at"
                className="mt-1 min-h-10 w-full rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              />
              <span className="mt-1 block text-meta text-ds-textMuted">
                請填寫您在銀行帳戶上看到的入帳時間，而非購買者申報的匯款時間。
              </span>
            </label>
            <label className="block">
              <span className="text-meta text-ds-textMuted">備註（選填，核准時一併記錄）</span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：已於銀行對帳單確認入帳"
                className="mt-1 min-h-10 w-full rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submit("approve")}
                disabled={busy !== null}
                data-testid="payment-approve"
                className="min-h-11 rounded-xl bg-edu-success px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
              >
                {busy === "approve" ? "處理中…" : "核准付款"}
              </button>
              <button
                type="button"
                onClick={() => setMode("reject")}
                disabled={busy !== null}
                data-testid="payment-reject-open"
                className="min-h-11 rounded-xl border border-edu-error px-5 text-sm font-semibold text-edu-error transition-colors hover:bg-[#FEF2F2] disabled:opacity-50"
              >
                退回付款
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-meta text-ds-textMuted">退回原因（必選，購買者會看到）</legend>
              {PAYMENT_REJECTION_REASONS.map((code) => (
                <label key={code} className="flex items-center gap-2 text-body text-ds-heading">
                  <input
                    type="radio"
                    name="rejection-reason"
                    value={code}
                    checked={reason === code}
                    onChange={() => setReason(code)}
                    data-testid={`rejection-reason-${code}`}
                  />
                  {PAYMENT_REJECTION_REASON_LABEL[code]}
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="text-meta text-ds-textMuted">
                補充說明{noteRequired ? "（必填）" : "（選填）"}
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                data-testid="rejection-note"
                placeholder="說明購買者需要怎麼處理，例如：請重新上傳可看清匯款金額的畫面"
                className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-heading"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submit("reject")}
                disabled={busy !== null}
                data-testid="payment-reject-confirm"
                className="min-h-11 rounded-xl bg-edu-error px-5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
              >
                {busy === "reject" ? "處理中…" : "確認退回"}
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={busy !== null}
                className="min-h-11 rounded-xl border border-ds-border px-5 text-sm font-medium text-ds-textMuted hover:bg-ds-surface"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {message ? (
          <p data-testid="payment-review-message" className="text-body text-edu-warning">
            {message}
          </p>
        ) : null}
      </section>
    </article>
  );
}

function AdminPaymentProofsFallback() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader title="付款審核" />
      <LoadingState title="載入付款案件中…" />
    </section>
  );
}

export default function AdminPaymentProofsPage() {
  return (
    <Suspense fallback={<AdminPaymentProofsFallback />}>
      <AdminPaymentProofsContent />
    </Suspense>
  );
}
