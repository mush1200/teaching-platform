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
  DataToolbar,
  DetailField,
  DetailGrid,
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  Pagination,
  SearchField,
  StatusPill,
} from "../../../components/ds";

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

  async function afterDecision() {
    await load();
    if (selectedId) await loadDetail(selectedId);
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="付款審核"
        description="搜尋訂單編號或購買者 Email 找到案件，於同一畫面完成判斷與處理。"
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-4 text-sm font-medium text-ds-heading transition-colors hover:bg-edu-page disabled:opacity-50"
          >
            重新整理
          </button>
        }
      />

      <DataToolbar
        search={
          <SearchField
            id="admin-payment-search"
            label="搜尋付款案件"
            placeholder="搜尋訂單編號或購買者 Email"
            value={query.search}
            onSubmit={query.setSearch}
            disabled={loading}
          />
        }
        filters={
          <FilterTabs
            ariaLabel="付款審核狀態篩選"
            options={filterOptions}
            value={query.filter}
            onChange={query.setFilter}
            disabled={loading}
          />
        }
      />

      {loading ? <LoadingState title="載入付款案件中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
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
        <div className="space-y-3">
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
        </div>
      ) : null}

      {selectedId ? (
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
      ) : null}
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
  return (
    <article
      data-testid="admin-payment-proof-row"
      className={`rounded-ds-card border bg-ds-surface p-4 shadow-ds-card-soft transition-colors ${
        selected ? "border-edu-primary" : "border-ds-border"
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
          className="min-h-10 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white transition-colors hover:brightness-95"
        >
          {selected ? "收合審核" : "開始審核"}
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
          : { note: note.trim() || undefined };
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
        <h3 className="text-title text-ds-heading">訂單資料</h3>
        <DetailGrid>
          <DetailField label="訂單編號">{proof.order_id}</DetailField>
          <DetailField label="購買者">{proof.buyer_email ?? proof.user_id ?? "—"}</DetailField>
          <DetailField label="應付金額">{formatMoney(proof.order_total_amount)}</DetailField>
          <DetailField label="付款方式">
            {proof.order_payment_mode === "manual_transfer" ? "銀行轉帳（人工核帳）" : (proof.order_payment_mode ?? "—")}
          </DetailField>
          <DetailField label="訂單建立時間">{formatDateTime(proof.order_created_at)}</DetailField>
          <DetailField label="付款期限">
            <span className={isOverdue(proof.order_payment_due_at) ? "text-edu-error" : undefined}>
              {formatDateTime(proof.order_payment_due_at)}
              {isOverdue(proof.order_payment_due_at) ? "（已逾期）" : ""}
            </span>
          </DetailField>
          {proof.order_discount_amount ? (
            <DetailField label="折扣">
              -{formatMoney(proof.order_discount_amount)}
              {proof.order_promo_code ? `（${proof.order_promo_code}）` : ""}
            </DetailField>
          ) : null}
        </DetailGrid>

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
        {proof.proof_url ? (
          <div className="space-y-2">
            {/* 憑證是外部 URL（Backend 的 /uploads 靜態路徑），不走 next/image 最佳化 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proof.proof_url}
              alt={`訂單 ${proof.order_id} 的付款憑證`}
              data-testid="payment-proof-image"
              className="max-h-[420px] w-full rounded-xl border border-ds-borderMuted bg-edu-page object-contain"
            />
            <a
              href={proof.proof_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm font-medium text-edu-primary underline"
            >
              在新分頁查看原始影像
            </a>
          </div>
        ) : (
          <p className="text-body text-ds-textMuted">此筆沒有可顯示的憑證影像。</p>
        )}
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
