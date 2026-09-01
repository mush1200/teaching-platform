"use client";

import { useEffect, useState } from "react";

import type { ComplaintEvidence } from "@/lib/api-types";
import {
  downloadComplaintEvidence,
  fetchComplaintEvidenceObjectUrl,
  formatEvidenceSize,
  revokeComplaintEvidenceObjectUrl,
  type EvidenceScope,
} from "@/lib/complaint-evidence";

/**
 * 一列申訴證據（P1-09 Gate 4 / `N3`，Wave 2 #13）。
 *
 * Buyer 與 Admin **共用這一個元件** —— 兩邊看到的證據呈現方式必須一致，
 * 否則會出現「買家說我傳了、Admin 說我沒看到」這種無法對帳的爭議。
 * 差別只有 `scope`，它決定打哪一條受保護路徑；**授權由 backend 獨立判斷**，
 * 這裡的顯示與否不是 authorization boundary。
 *
 * 兩種證據形態（DB 的 `cce_evidence_has_content` 允許二選一）：
 *
 *   `has_file = true`   → 有附件，提供「查看」（inline 預覽）與「下載」
 *   `has_file = false`  → 純文字外部參照，沒有可下載的東西，**不顯示必定失敗的按鈕**
 */
export function EvidenceAttachment({
  evidence,
  complaintId,
  scope,
}: {
  evidence: ComplaintEvidence;
  complaintId: string;
  scope: EvidenceScope;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // object URL 會讓整個檔案留在分頁記憶體裡直到被釋放 —— 卸載時一定要 revoke。
  useEffect(() => {
    return () => revokeComplaintEvidenceObjectUrl(objectUrl);
  }, [objectUrl]);

  const hasFile = evidence.has_file === true;
  const filename = evidence.original_filename ?? "附件";
  const size = formatEvidenceSize(evidence.size_bytes);
  const isImage = (evidence.mime_type ?? "").startsWith("image/");

  async function onView() {
    if (objectUrl) {
      setObjectUrl((prev) => {
        revokeComplaintEvidenceObjectUrl(prev);
        return null;
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setObjectUrl(await fetchComplaintEvidenceObjectUrl(scope, complaintId, evidence.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法取得證據檔案。");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      await downloadComplaintEvidence(scope, complaintId, evidence.id, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法下載證據檔案。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="evidence-attachment" data-has-file={hasFile ? "true" : "false"}>
      {/* 檔名可能很長（中文附件名尤其）—— 允許斷行，不要把整列撐出畫面。 */}
      <p className="text-body break-words text-ds-heading" data-testid="evidence-name">
        {hasFile ? `📎 ${filename}` : "📝 文字說明"}
      </p>

      {hasFile ? (
        <>
          <p className="mt-0.5 text-meta text-ds-textMuted" data-testid="evidence-meta">
            {[evidence.mime_type, size].filter(Boolean).join(" · ") || "附件"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onView}
              disabled={busy}
              data-testid="evidence-view"
              className="min-h-[44px] rounded-lg border border-ds-borderMuted px-3 text-meta text-ds-heading disabled:opacity-60"
            >
              {busy ? "處理中…" : objectUrl ? "收合" : "查看"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={busy}
              data-testid="evidence-download"
              className="min-h-[44px] rounded-lg border border-ds-borderMuted px-3 text-meta text-ds-heading disabled:opacity-60"
            >
              下載
            </button>
          </div>

          {objectUrl ? (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: URL，Next 的 optimizer 不適用
              <img
                src={objectUrl}
                alt={filename}
                data-testid="evidence-preview"
                className="mt-2 max-h-80 w-full rounded-xl border border-ds-borderMuted object-contain"
              />
            ) : (
              <a
                href={objectUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="evidence-preview-link"
                className="mt-2 inline-block text-meta underline"
              >
                在新分頁開啟
              </a>
            )
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" data-testid="evidence-error" className="mt-2 text-meta text-edu-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
