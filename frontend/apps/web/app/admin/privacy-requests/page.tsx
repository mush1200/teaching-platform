"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "../../../components/ds";

/**
 * 個資權利請求 —— Admin 清單與建案（`OPS-04` / `DEC-LEGAL-13`）。
 *
 * ## 這一頁**不是**消費申訴
 *
 * Owner 明訂兩者是不同的 domain（法律基礎不同：個資法 vs 消保法 §43）。
 * 因此本頁自己的標題、自己的狀態值、自己的 API namespace
 * （`/admin/privacy-requests`），與 `/admin/complaints` 完全分開。
 *
 * ## 對外入口是 Privacy Email
 *
 * `DEC-LEGAL-07` 決定使用者透過個資信箱提出請求；本輪**未新增**任何
 * 站內或匿名提交表單。Admin 收到信之後在這裡建立案件並追蹤處理。
 *
 * ## 這裡沒有期限
 *
 * 申訴頁會顯示法定期限與逾期告警，那有消保法 §43 II 的法源。
 * 個資請求的法定回覆期限**尚未取得律師結論**，因此本頁
 * **不顯示任何天數、不做逾期判定**。
 */

type Option = { code: string; label: string };

type PrivacyRequest = {
  id: string;
  requestType: string;
  requestTypeLabel: string;
  status: string;
  statusLabel: string;
  requesterReference: string;
  summary: string;
  receivedAt: string;
  completedAt: string | null;
  source: string;
};

type ListPayload = {
  items: PrivacyRequest[];
  total: number;
  requestTypeOptions: Option[];
  statusOptions: Option[];
};

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  open: "info",
  in_review: "warning",
  waiting_for_information: "warning",
  completed: "success",
  closed: "neutral",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-TW", { hour12: false });
}

export default function AdminPrivacyRequestsPage() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [creating, setCreating] = useState(false);
  const [requestType, setRequestType] = useState("");
  const [requesterReference, setRequesterReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await apiFetch(`admin/privacy-requests${qs}`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as ListPayload);
    } catch {
      setData(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch("admin/privacy-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType,
          requesterReference: requesterReference.trim(),
          summary: summary.trim(),
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : "",
        }),
      });
      if (!res.ok) {
        // Backend 的錯誤原樣呈現 —— 前端不另編一套說法。
        setFormError(await parseApiErrorMessage(res));
        return;
      }
      setCreating(false);
      setRequestType("");
      setRequesterReference("");
      setReceivedAt("");
      setSummary("");
      await load();
    } catch {
      setFormError("無法連線至伺服器，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(requestType && requesterReference.trim() && receivedAt && summary.trim());

  return (
    <section className="flex w-full flex-col gap-4" data-testid="privacy-requests-page">
      <PageHeader
        title="個資權利請求"
        description="使用者透過個資信箱提出的權利請求，於此受理與追蹤。這與「消費申訴」是不同類型的案件。"
      />

      {/*
        誠實說明入口與邊界。**不得**在此宣稱任何法定期限或身分驗證程序 ——
        兩者的法律結論皆尚未取得。
      */}
      <p
        className="rounded-ds-card border border-ds-border bg-edu-page px-4 py-3 text-meta text-ds-textMuted"
        data-testid="privacy-requests-notice"
      >
        對外受理管道為《隱私權政策》所載之個資信箱；平台目前未提供站內或匿名的請求表單。
        本頁之案件狀態僅記錄平台內部處理進度，<strong className="font-semibold text-ds-heading">
        不代表法律上的處理期限、身分驗證程序或刪除結果</strong>。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="pr-status-filter" className="text-meta text-ds-textMuted">
          狀態篩選
        </label>
        <select
          id="pr-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="privacy-status-filter"
          className="min-h-11 rounded-xl border border-ds-border bg-white px-3 text-sm text-ds-heading"
        >
          <option value="">全部</option>
          {(data?.statusOptions ?? []).map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          data-testid="privacy-create-toggle"
          className="ml-auto min-h-11 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white"
        >
          {creating ? "取消建立" : "建立案件"}
        </button>
      </div>

      {creating ? (
        <article
          className="space-y-3 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft"
          data-testid="privacy-create-form"
        >
          <h2 className="text-title text-ds-heading">依收到的個資信箱來信建立案件</h2>

          <label htmlFor="pr-type" className="block text-meta font-medium text-ds-heading">
            請求類型（必選）
          </label>
          <select
            id="pr-type"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            disabled={busy}
            data-testid="privacy-type-select"
            className="min-h-11 w-full rounded-xl border border-ds-border bg-white px-3 text-sm text-ds-heading"
          >
            <option value="">請選擇請求類型</option>
            {(data?.requestTypeOptions ?? []).map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>

          <label htmlFor="pr-reference" className="block text-meta font-medium text-ds-heading">
            請求者聯絡識別（必填）
          </label>
          <input
            id="pr-reference"
            value={requesterReference}
            onChange={(e) => setRequesterReference(e.target.value)}
            disabled={busy}
            placeholder="來信之電子郵件位址"
            data-testid="privacy-reference-input"
            className="min-h-11 w-full rounded-xl border border-ds-border bg-white px-3 text-sm text-ds-heading"
          />
          {/* 資料最小化：只記回覆所需的聯絡識別。 */}
          <p className="text-meta text-ds-textMuted">
            僅記錄回覆請求所需之聯絡識別；請勿於此輸入身分證字號、護照號碼或金融資訊。
          </p>

          <label htmlFor="pr-received" className="block text-meta font-medium text-ds-heading">
            收到請求時間（必填）
          </label>
          <input
            id="pr-received"
            type="datetime-local"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            disabled={busy}
            data-testid="privacy-received-input"
            className="min-h-11 w-full rounded-xl border border-ds-border bg-white px-3 text-sm text-ds-heading"
          />

          <label htmlFor="pr-summary" className="block text-meta font-medium text-ds-heading">
            內部摘要（必填）
          </label>
          <textarea
            id="pr-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={busy}
            rows={3}
            data-testid="privacy-summary-input"
            className="w-full rounded-xl border border-ds-border bg-white px-3 py-2 text-sm text-ds-heading"
          />

          {formError ? (
            <p role="alert" className="text-meta text-rose-700" data-testid="privacy-form-error">
              {formError}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
            data-testid="privacy-create-submit"
            className="min-h-11 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "建立中…" : "建立案件"}
          </button>
        </article>
      ) : null}

      {loading ? <LoadingState title="載入個資權利請求…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="目前沒有個資權利請求" description="收到個資信箱來信後，可於此建立案件並追蹤處理。" />
      ) : null}

      {!loading && !error && (data?.items.length ?? 0) > 0 ? (
        <ul className="space-y-2" data-testid="privacy-request-list">
          {data!.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/privacy-requests/${item.id}`}
                className="flex flex-wrap items-center gap-3 rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card-soft transition-colors hover:bg-edu-page"
              >
                <StatusPill tone={STATUS_TONE[item.status] ?? "neutral"} label={item.statusLabel} />
                <span className="text-body font-medium text-ds-heading">{item.requestTypeLabel}</span>
                <span className="text-meta text-ds-textMuted">收到：{formatDate(item.receivedAt)}</span>
                <span className="min-w-0 flex-1 truncate text-meta text-ds-textMuted">{item.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
