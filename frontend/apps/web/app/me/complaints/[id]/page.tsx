"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { ComplaintDetailResponse } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";
import {
  DetailField,
  DetailGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "../../../../components/ds";
import {
  COMPLAINT_EVENT_LABEL,
  COMPLAINT_STATUS_BUYER_HINT,
  COMPLAINT_STATUS_TONE,
  COMPLAINT_TERMINAL_STATUSES,
  complaintStatusLabel,
  complaintTypeLabel,
  type ComplaintStatus,
} from "../../../../lib/complaint-labels";
import { EvidenceAttachment } from "@/components/complaints/EvidenceAttachment";

/**
 * 我的申訴詳情（P1-09 Gate 3 / Wave 2 #10）。
 *
 * ## 買家視角 ≠ Admin 視角
 *
 * 歷程來自 `GET /me/complaints/:id`，backend 已用 `listEvents(..., { forBuyer: true })`
 * **濾掉 `internal_note`** —— 前端不做任何過濾，也不該做：那會讓「誰能看到什麼」
 * 有兩個來源（`mvp_rules.md` §12.10.3）。
 *
 * ## 非本人一律 403
 *
 * backend 比對 `complaint.buyer_id !== req.user.userId` 後回 403，
 * 前端把它呈現為明確的「無權檢視」而不是空白頁。
 *
 * ## 終態
 *
 * `closed` 之後 backend 會拒絕補件（`complaint_closed`），
 * 因此 UI 也停止顯示補件表單 —— 不呈現一個按了必定失敗的控制項。
 */
export default function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ComplaintDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [externalReference, setExternalReference] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceMsg, setEvidenceMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await apiFetch(`me/complaints/${encodeURIComponent(id)}`);
      if (res.status === 403) {
        setForbidden(true);
        setData(null);
        return;
      }
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setData(null);
        return;
      }
      setData((await res.json()) as ComplaintDetailResponse);
    } catch {
      setError("載入失敗，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEvidence() {
    setEvidenceMsg(null);
    if (!evidenceFile && !externalReference.trim()) {
      setEvidenceMsg("請上傳檔案或填寫文字說明其中一項。");
      return;
    }
    setEvidenceBusy(true);
    try {
      let res: Response;
      if (evidenceFile) {
        const body = new FormData();
        body.append("evidence", evidenceFile);
        if (externalReference.trim()) body.append("externalReference", externalReference.trim());
        res = await apiFetch(`me/complaints/${encodeURIComponent(id)}/evidence`, { method: "POST", body });
      } else {
        res = await apiFetch(`me/complaints/${encodeURIComponent(id)}/evidence`, {
          method: "POST",
          body: JSON.stringify({ externalReference: externalReference.trim() }),
        });
      }
      if (!res.ok) {
        setEvidenceMsg(await parseApiErrorMessage(res));
        return;
      }
      setExternalReference("");
      setEvidenceFile(null);
      setEvidenceMsg("已新增證據。");
      await load();
    } catch {
      setEvidenceMsg("新增失敗，請稍後再試。");
    } finally {
      setEvidenceBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <LoadingState title="載入申訴中…" />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="complaint-forbidden">
        <ErrorState
          title="無權檢視這筆申訴"
          description="這筆申訴不屬於您的帳號。若您認為這是錯誤，請由「我的申訴」重新進入。"
        />
        <Link href="/me/complaints" className="mt-4 inline-block text-body text-edu-primary underline">
          返回我的申訴
        </Link>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <ErrorState
          title="無法載入申訴"
          description={error ?? "找不到這筆申訴。"}
          onRetry={() => void load()}
        />
      </main>
    );
  }

  const { complaint, events, evidence } = data;
  const status = complaint.status as ComplaintStatus;
  const terminal = COMPLAINT_TERMINAL_STATUSES.includes(status);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="complaint-detail-page">
      <PageHeader
        title={complaint.subject}
        description={COMPLAINT_STATUS_BUYER_HINT[status] ?? ""}
        action={
          <Link
            href="/me/complaints"
            className="inline-flex min-h-11 items-center rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-heading"
          >
            返回清單
          </Link>
        }
      />

      <section className="mt-4 rounded-ds-card border border-ds-border bg-ds-surface p-5">
        <div className="mb-3">
          <StatusPill
            label={complaintStatusLabel(status)}
            tone={COMPLAINT_STATUS_TONE[status] ?? "neutral"}
          />
        </div>
        <DetailGrid>
          <DetailField label="申訴類型">{complaintTypeLabel(complaint.complaint_type)}</DetailField>
          <DetailField label="相關訂單">{complaint.order_id ?? "無（帳號層級爭議）"}</DetailField>
          <DetailField label="提出時間">{formatDateTime(complaint.submitted_at)}</DetailField>
          <DetailField label="平台回覆時間">{formatDateTime(complaint.responded_at)}</DetailField>
        </DetailGrid>
        <div className="mt-4">
          <p className="text-meta text-ds-textMuted">申訴內容</p>
          <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading">{complaint.statement}</p>
        </div>
        {complaint.resolution_summary ? (
          <div className="mt-4 rounded-xl border border-edu-primary/30 bg-ds-surfaceMuted p-3">
            <p className="text-meta text-ds-textMuted">處理結果</p>
            <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading" data-testid="complaint-resolution">
              {complaint.resolution_summary}
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-ds-card border border-ds-border bg-ds-surface p-5">
        <h2 className="text-title text-ds-heading">處理歷程</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-body text-ds-textMuted">目前沒有歷程紀錄。</p>
        ) : (
          <ol className="mt-3 space-y-3" data-testid="complaint-events">
            {events.map((ev) => (
              <li key={ev.id} className="border-l-2 border-ds-borderMuted pl-3">
                <p className="text-meta text-ds-textMuted">
                  {COMPLAINT_EVENT_LABEL[ev.event_type] ?? ev.event_type} · {formatDateTime(ev.created_at)}
                </p>
                {ev.message ? (
                  <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading">{ev.message}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded-ds-card border border-ds-border bg-ds-surface p-5">
        <h2 className="text-title text-ds-heading">我提供的證據</h2>
        <p className="mt-1 text-meta text-ds-textMuted">
          付款爭議不會只依平台自己的紀錄認定。您可以提供匯款截圖，或以文字說明外部證明的來源與案號。
        </p>
        {evidence.length === 0 ? (
          <p className="mt-2 text-body text-ds-textMuted">尚未提供任何證據。</p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="complaint-evidence">
            {evidence.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-ds-borderMuted px-3 py-2">
                {/*
                  * Wave 2 #13 之前這裡只是純文字檔名 —— 證據傳得上去、沒有人讀得回來。
                  * 現在走與付款憑證相同的 authenticated blob 取檔（`lib/complaint-evidence.ts`）。
                  */}
                <EvidenceAttachment evidence={ev} complaintId={id} scope="buyer" />
                {ev.external_reference ? (
                  <p className="mt-1 whitespace-pre-wrap text-meta text-ds-textMuted">{ev.external_reference}</p>
                ) : null}
                <p className="mt-1 text-meta text-ds-textMuted">{formatDateTime(ev.created_at)}</p>
              </li>
            ))}
          </ul>
        )}

        {terminal ? (
          <p className="mt-4 rounded-xl bg-ds-surfaceMuted px-3 py-2 text-meta text-ds-textMuted" data-testid="complaint-closed-notice">
            本案已結案，無法再新增證據。若有新的爭議，請另行提出申訴。
          </p>
        ) : (
          <div className="mt-4 space-y-3 border-t border-ds-borderMuted pt-4">
            <label className="block">
              <span className="text-meta text-ds-textMuted">附件（JPG／PNG／WebP，選填）</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setEvidenceFile(e.currentTarget.files?.[0] ?? null)}
                data-testid="evidence-file"
                className="mt-1 block w-full text-sm text-ds-heading"
              />
            </label>
            <label className="block">
              <span className="text-meta text-ds-textMuted">文字說明（選填）</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={externalReference}
                onChange={(e) => setExternalReference(e.currentTarget.value)}
                placeholder="例：台銀 8/20 15:32 轉出 480 元，交易序號 A1234"
                data-testid="evidence-reference"
                className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-heading"
              />
            </label>
            {evidenceMsg ? (
              <p role="status" className="text-body text-ds-textMuted" data-testid="evidence-message">
                {evidenceMsg}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void addEvidence()}
              disabled={evidenceBusy}
              data-testid="evidence-submit"
              className="min-h-11 rounded-xl border border-edu-primary px-4 text-sm font-semibold text-edu-primary disabled:opacity-60"
            >
              {evidenceBusy ? "上傳中…" : "新增證據"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
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
