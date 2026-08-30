"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type {
  ComplaintDetailResponse,
  ComplaintListResponse,
  ComplaintRow,
} from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import {
  DetailField,
  DetailGrid,
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  RefreshControl,
  StatusPill,
} from "../../../components/ds";
import { AdminReviewPlaceholder, AdminReviewWorkspace } from "../../../components/admin/AdminReviewWorkspace";
import {
  COMPLAINT_EVENT_LABEL,
  COMPLAINT_STATUS_REQUIRES_RESOLUTION,
  COMPLAINT_STATUS_TONE,
  COMPLAINT_TRANSITIONS,
  complaintStatusLabel,
  complaintTypeLabel,
  type ComplaintStatus,
} from "../../../lib/complaint-labels";
import { EvidenceAttachment } from "@/components/complaints/EvidenceAttachment";

/**
 * 消費申訴管理（P1-09 Gate 3 / Wave 2 #10）。
 *
 * ## 這一頁只做 Wave 2 #6 backend 已支援的事
 *
 *   * `GET /admin/complaints`（`?status=` / `?overdue=1`）
 *   * `GET /admin/complaints/:id`（含 `internal_note`，Admin 才看得到）
 *   * `POST /admin/complaints/:id/transition`
 *   * `POST /admin/complaints/:id/link-remedy-case`
 *
 * **沒有新增任何 backend feature**，也沒有任何 frontend-only 狀態：
 * 逾期與否是 backend 的 `overdue`（`utils/complaintSla.js` 由 `statutory_due_at` 算出），
 * 前端**不自行推算法定期限**。
 *
 * ## 與檢舉／退款分離
 *
 * `/admin/reports` 是**內容檢舉**、`/admin/remedy-cases` 是**退款補救**，
 * 本頁是**買家對自己交易的申訴**。三者不共用資料也不共用入口（`mvp_rules.md` §12.10.1）。
 * `resolved` **不等於已退款** —— 需要退款時由人另建 remedy case 再於此連結。
 */
export default function AdminComplaintsPage() {
  return (
    <Suspense fallback={<LoadingState title="載入申訴中…" />}>
      <AdminComplaintsContent />
    </Suspense>
  );
}

const FILTERS = ["all", "submitted", "under_review", "responded", "resolved", "closed", "overdue"] as const;

function AdminComplaintsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFilter = searchParams?.get("status") ?? "all";
  const filter = (FILTERS as readonly string[]).includes(rawFilter) ? rawFilter : "all";
  const selectedId = searchParams?.get("id") ?? "";

  const [items, setItems] = useState<ComplaintRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [detail, setDetail] = useState<ComplaintDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** 最後成功載入時間 —— Admin 需要知道畫面上的佇列是什麼時候的。 */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      // `overdue` 是 backend 的查詢條件（partial index），不是前端過濾。
      const query =
        filter === "all" ? "" : filter === "overdue" ? "?overdue=1" : `?status=${encodeURIComponent(filter)}`;
      const res = await apiFetch(`admin/complaints${query}`);
      if (!res.ok) {
        setListError(await parseApiErrorMessage(res));
        setItems(null);
        return;
      }
      const data = (await res.json()) as ComplaintListResponse;
      setItems(Array.isArray(data.items) ? data.items : []);
      setUpdatedAt(new Date());
    } catch {
      setListError("載入失敗，請稍後再試。");
      setItems(null);
    } finally {
      setListLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`admin/complaints/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setDetailError(await parseApiErrorMessage(res));
        setDetail(null);
        return;
      }
      setDetail((await res.json()) as ComplaintDetailResponse);
    } catch {
      setDetailError("載入失敗，請稍後再試。");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function select(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) params.set("id", id);
    else params.delete("id");
    router.replace(`/admin/complaints?${params.toString()}`);
  }

  async function refreshBoth() {
    await Promise.all([loadList(), loadDetail(selectedId)]);
  }

  const list = (
    <div>
      <FilterTabs
        options={FILTERS.map((f) => ({
          value: f,
          label:
            f === "all"
              ? "全部"
              : f === "overdue"
                ? "已逾法定期限"
                : complaintStatusLabel(f),
        }))}
        value={filter}
        ariaLabel="申訴狀態篩選"
        testIdPrefix="complaint-filter"
        onChange={(next) => {
          const params = new URLSearchParams();
          if (next !== "all") params.set("status", next);
          router.replace(`/admin/complaints${params.toString() ? `?${params.toString()}` : ""}`);
        }}
      />

      {listLoading ? <LoadingState title="載入申訴中…" /> : null}
      {!listLoading && listError ? (
        <ErrorState title="無法載入申訴" description={listError} onRetry={() => void loadList()} />
      ) : null}
      {!listLoading && !listError && items && items.length === 0 ? (
        <EmptyState title="沒有符合條件的申訴" description="切換上方篩選，或稍後再回來查看。" />
      ) : null}

      {/*
        **排序來自 backend**（`ORDER BY statutory_due_at ASC`）——
        期限最近的排最前面，因此逾期案件天然浮在最上方，不會被普通 pending 淹沒。
        前端**不重新排序**：那會讓「看到的順序」與「API 回傳的順序」分家。
      */}
      {!listLoading && !listError && items && items.length > 0 ? (
        <ul className="mt-3 space-y-2" data-testid="admin-complaint-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select(item.id)}
                data-testid="admin-complaint-row"
                className={`w-full rounded-ds-card border p-3 text-left transition-colors ${
                  item.id === selectedId
                    ? "border-edu-primary bg-ds-surfaceMuted"
                    : "border-ds-border bg-ds-surface hover:border-edu-primary"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-ds-heading">
                    {item.subject}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {item.overdue ? <StatusPill label="已逾法定期限" tone="danger" /> : null}
                    <StatusPill
                      label={complaintStatusLabel(item.status)}
                      tone={COMPLAINT_STATUS_TONE[item.status as ComplaintStatus] ?? "neutral"}
                    />
                  </span>
                </div>
                <p className="mt-1 text-meta text-ds-textMuted">
                  {complaintTypeLabel(item.complaint_type)}
                  {item.order_id ? ` · 訂單 ${item.order_id}` : " · 帳號層級"}
                </p>
                {/*
                  期限與逾期天數都是 backend 的值（`statutory_due_at` / `daysUntilDue`）——
                  前端**不做任何日期比較**。
                */}
                <p
                  className={`mt-1 text-meta ${item.overdue ? "font-semibold text-edu-error" : "text-ds-textMuted"}`}
                  data-testid="complaint-deadline"
                >
                  法定處理期限：{formatDate(item.statutory_due_at)}
                  {typeof item.daysUntilDue === "number"
                    ? item.daysUntilDue < 0
                      ? `（已逾期 ${Math.abs(item.daysUntilDue)} 天）`
                      : `（剩 ${item.daysUntilDue} 天）`
                    : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6" data-testid="admin-complaints-page">
      <PageHeader
        title="消費申訴"
        description="買家對自己交易提出的申訴。依消費者保護法 §43 II，應於申訴之日起十五日內妥適處理。"
        action={<RefreshControl updatedAt={updatedAt} onRefresh={() => void refreshBoth()} />}
      />
      <AdminReviewWorkspace
        list={list}
        detail={
          selectedId ? (
            detailLoading ? (
              <LoadingState title="載入申訴詳情…" />
            ) : detailError || !detail ? (
              <ErrorState
                title="無法載入申訴詳情"
                description={detailError ?? "找不到這筆申訴。"}
                onRetry={() => void loadDetail(selectedId)}
              />
            ) : (
              <ComplaintDetailPanel detail={detail} onDone={refreshBoth} />
            )
          ) : null
        }
        placeholder={
          <AdminReviewPlaceholder
            title="選擇一筆申訴"
            description="從左側佇列點選申訴，即可在此查看內容、證據與處理歷程。"
          />
        }
        onBackToList={() => select("")}
        listLabel="申訴佇列"
        detailLabel="申訴詳情"
      />
    </main>
  );
}

function ComplaintDetailPanel({
  detail,
  onDone,
}: {
  detail: ComplaintDetailResponse;
  onDone: () => Promise<void>;
}) {
  const { complaint, events, evidence } = detail;
  const status = complaint.status as ComplaintStatus;
  const allowed = COMPLAINT_TRANSITIONS[status] ?? [];

  const [toStatus, setToStatus] = useState<ComplaintStatus | "">("");
  const [message, setMessage] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [visibleToBuyer, setVisibleToBuyer] = useState(true);
  const [remedyCaseId, setRemedyCaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const needsResolution =
    toStatus !== "" && COMPLAINT_STATUS_REQUIRES_RESOLUTION.includes(toStatus as ComplaintStatus);

  async function transition() {
    setFeedback(null);
    if (!toStatus) return setFeedback("請先選擇要轉移到的狀態。");
    if (!message.trim()) return setFeedback("請填寫處理說明 —— 每一個影響買家救濟的決定都必須說得出理由。");
    if (needsResolution && !resolutionSummary.trim()) {
      return setFeedback("結案或完成處理時必須填寫處理結果，買家才知道發生了什麼。");
    }
    setBusy(true);
    try {
      const res = await apiFetch(`admin/complaints/${encodeURIComponent(complaint.id)}/transition`, {
        method: "POST",
        body: JSON.stringify({
          status: toStatus,
          message: message.trim(),
          resolutionSummary: resolutionSummary.trim() || undefined,
          visibleToBuyer,
        }),
      });
      if (!res.ok) {
        setFeedback(await parseApiErrorMessage(res));
        return;
      }
      setToStatus("");
      setMessage("");
      setResolutionSummary("");
      setFeedback("已更新申訴狀態。");
      await onDone();
    } catch {
      setFeedback("操作失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function linkRemedyCase() {
    setFeedback(null);
    if (!remedyCaseId.trim()) return setFeedback("請輸入補救案件編號。");
    setBusy(true);
    try {
      const res = await apiFetch(`admin/complaints/${encodeURIComponent(complaint.id)}/link-remedy-case`, {
        method: "POST",
        body: JSON.stringify({ remedyCaseId: remedyCaseId.trim() }),
      });
      if (!res.ok) {
        setFeedback(await parseApiErrorMessage(res));
        return;
      }
      setRemedyCaseId("");
      setFeedback("已關聯補救案件。");
      await onDone();
    } catch {
      setFeedback("操作失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article data-testid="admin-complaint-detail" className="space-y-4 rounded-ds-card border border-edu-primary bg-ds-surface p-5 shadow-ds-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-title text-ds-heading">{complaint.subject}</h2>
        <span className="flex shrink-0 gap-1">
          {complaint.overdue ? <StatusPill label="已逾法定期限" tone="danger" /> : null}
          <StatusPill
            label={complaintStatusLabel(status)}
            tone={COMPLAINT_STATUS_TONE[status] ?? "neutral"}
          />
        </span>
      </div>

      {/*
        **逾期橫幅只在 backend 判定 overdue 時出現。**
        `resolved` / `closed` 在 backend 一律回 `overdue=false`
        （`utils/complaintSla.js` 的 `isOverdue`），因此終態案件不會被呈現成
        「需要立即處理」—— 前端不需要、也不得自行再判斷一次。
      */}
      {complaint.overdue ? (
        <div
          role="status"
          data-testid="complaint-overdue-banner"
          className="rounded-xl border border-edu-error/40 bg-status-rejectedBg px-3 py-2"
        >
          <p className="text-body font-semibold text-status-rejectedText">
            已逾法定處理期限
            {typeof complaint.daysUntilDue === "number" && complaint.daysUntilDue < 0
              ? ` ${Math.abs(complaint.daysUntilDue)} 天`
              : ""}
          </p>
          <p className="mt-1 text-meta text-status-rejectedText">
            法定期限 {formatDate(complaint.statutory_due_at)}（消保法 §43 II）。請優先完成處理並回覆申訴人。
          </p>
        </div>
      ) : null}

      <DetailGrid>
        <DetailField label="申訴編號">{complaint.id}</DetailField>
        <DetailField label="申訴類型">{complaintTypeLabel(complaint.complaint_type)}</DetailField>
        <DetailField label="買家">{complaint.buyer_id}</DetailField>
        <DetailField label="相關訂單">{complaint.order_id ?? "無（帳號層級爭議）"}</DetailField>
        <DetailField label="提出時間">{formatDateTime(complaint.submitted_at)}</DetailField>
        <DetailField label="法定處理期限">
          <span className={complaint.overdue ? "text-edu-error" : undefined}>
            {formatDateTime(complaint.statutory_due_at)}
            {complaint.overdue ? "（已逾期）" : ""}
          </span>
        </DetailField>
        <DetailField label="關聯補救案件">
          {complaint.related_remedy_case_id ?? "尚未關聯"}
        </DetailField>
        <DetailField label="最後處理者">{complaint.reviewed_by ?? "—"}</DetailField>
      </DetailGrid>

      <div>
        <p className="text-meta text-ds-textMuted">買家陳述</p>
        <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading">{complaint.statement}</p>
      </div>

      {complaint.resolution_summary ? (
        <div className="rounded-xl border border-edu-primary/30 bg-ds-surfaceMuted p-3">
          <p className="text-meta text-ds-textMuted">處理結果（買家看得到）</p>
          <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading">{complaint.resolution_summary}</p>
        </div>
      ) : null}

      <section>
        <h3 className="text-body font-semibold text-ds-heading">買家提供的證據</h3>
        <p className="mt-1 text-meta text-ds-textMuted">
          付款爭議不得只以平台自己的紀錄為唯一認定依據，請一併參酌。
        </p>
        {evidence.length === 0 ? (
          <p className="mt-2 text-body text-ds-textMuted">買家尚未提供證據。</p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="admin-complaint-evidence">
            {evidence.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-ds-borderMuted px-3 py-2">
                {/*
                  * 與買家端**共用同一個元件** —— 兩邊看到的證據呈現必須一致，
                  * 否則會出現「買家說我傳了、Admin 說我沒看到」這種無法對帳的爭議。
                  */}
                <EvidenceAttachment evidence={ev} complaintId={complaint.id} scope="admin" />
                {ev.external_reference ? (
                  <p className="mt-1 whitespace-pre-wrap text-meta text-ds-textMuted">{ev.external_reference}</p>
                ) : null}
                <p className="mt-1 text-meta text-ds-textMuted">{formatDateTime(ev.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-body font-semibold text-ds-heading">處理歷程（含內部註記）</h3>
        {events.length === 0 ? (
          <p className="mt-2 text-body text-ds-textMuted">目前沒有歷程紀錄。</p>
        ) : (
          <ol className="mt-2 space-y-3" data-testid="admin-complaint-events">
            {events.map((ev) => (
              <li key={ev.id} className="border-l-2 border-ds-borderMuted pl-3">
                <p className="text-meta text-ds-textMuted">
                  {COMPLAINT_EVENT_LABEL[ev.event_type] ?? ev.event_type} · {formatDateTime(ev.created_at)}
                  {ev.event_type === "internal_note" ? " · 買家看不到" : ""}
                </p>
                {ev.message ? (
                  <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading">{ev.message}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {allowed.length === 0 ? (
        <p
          className="rounded-xl bg-ds-surfaceMuted px-3 py-2 text-meta text-ds-textMuted"
          data-testid="admin-complaint-terminal"
        >
          本案已結案，沒有可執行的處理動作。
        </p>
      ) : (
        <section className="space-y-3 border-t border-ds-borderMuted pt-4" data-testid="admin-complaint-actions">
          <h3 className="text-body font-semibold text-ds-heading">處理這筆申訴</h3>
          <label className="block">
            <span className="text-meta text-ds-textMuted">轉移到</span>
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.currentTarget.value as ComplaintStatus | "")}
              data-testid="complaint-transition-status"
              className="mt-1 min-h-11 w-full rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
            >
              <option value="">請選擇…</option>
              {allowed.map((next) => (
                <option key={next} value={next}>
                  {complaintStatusLabel(next)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-meta text-ds-textMuted">處理說明（必填）</span>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              data-testid="complaint-transition-message"
              className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-heading"
            />
          </label>

          <label className="flex items-center gap-2 text-body text-ds-heading">
            <input
              type="checkbox"
              checked={visibleToBuyer}
              onChange={(e) => setVisibleToBuyer(e.currentTarget.checked)}
              data-testid="complaint-visible-to-buyer"
            />
            這則說明要讓買家看到（取消勾選則記為內部註記）
          </label>

          {needsResolution ? (
            <label className="block">
              <span className="text-meta text-ds-textMuted">處理結果（買家看得到，必填）</span>
              <textarea
                rows={3}
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.currentTarget.value)}
                data-testid="complaint-resolution-summary"
                className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-heading"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void transition()}
            disabled={busy}
            data-testid="complaint-transition-submit"
            className="min-h-11 rounded-xl bg-intent-action px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "處理中…" : "送出處理"}
          </button>

          <div className="border-t border-ds-borderMuted pt-3">
            <label className="block">
              <span className="text-meta text-ds-textMuted">
                關聯補救案件（選填）—— 需退款時請先建立補救案件，再於此填入其編號
              </span>
              <input
                type="text"
                value={remedyCaseId}
                onChange={(e) => setRemedyCaseId(e.currentTarget.value)}
                placeholder="補救案件編號"
                data-testid="complaint-remedy-case-id"
                className="mt-1 min-h-11 w-full rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
              />
            </label>
            <p className="mt-1 text-meta text-ds-textMuted">
              「已處理完成」不等於「已退款」—— 實際退款由補救案件流程執行。
            </p>
            <button
              type="button"
              onClick={() => void linkRemedyCase()}
              disabled={busy}
              data-testid="complaint-link-remedy-submit"
              className="mt-2 min-h-11 rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-heading disabled:opacity-60"
            >
              關聯補救案件
            </button>
          </div>

          {feedback ? (
            <p role="status" className="text-body text-ds-textMuted" data-testid="complaint-action-feedback">
              {feedback}
            </p>
          ) : null}
        </section>
      )}
    </article>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
