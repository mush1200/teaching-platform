"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import type { UserRole } from "../../../lib/api-types";
import { Button } from "../../ui/Button";

/*
 * 買家端唯一的檢舉送出入口（`docs/mvp_rules.md` §6）。
 *
 * 兩件事刻意不做：
 * 1. **不做結構化 reason code。** `reports.reason` 是自由文字，schema 沒有 code 欄位，
 *    admin 端（`lib/admin-labels.ts` 的 `report_created.reason`）也是照原文顯示。
 *    在前端拼一組假分類進同一個字串，只會讓 admin 看到前端格式而不是檢舉人說的話。
 * 2. **不查「我檢舉過了沒」。** 平台沒有 buyer 端的 reports 讀取 API，
 *    重複檢舉由 `UNIQUE (material_id, reporter_id)` 擋下並回 409 —— 以 server 的答案為準，
 *    不在前端猜。
 */

type Props = {
  open: boolean;
  materialId: string;
  materialTitle: string;
  /** `tp_role` 只是 UX hint；真正的授權在 Backend 的 `requireRole("parent")`。 */
  role: UserRole | null;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

const REASON_MAX_LENGTH = 500;

/** 把 `POST /reports` 的失敗轉成買家看得懂的話；未知狀態碼落回 server message。 */
async function describeFailure(res: Response): Promise<string> {
  if (res.status === 409) return "你已經檢舉過這個教材了，我們正在處理中。";
  if (res.status === 401) return "登入狀態已失效，請重新登入後再送出檢舉。";
  if (res.status === 403) return "只有購買者帳號可以送出檢舉。";
  if (res.status === 404) return "找不到這個教材，可能已被移除。";
  return await parseApiErrorMessage(res);
}

export function MaterialReportDialog({ open, materialId, materialTitle, role, onClose, triggerRef }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canReport = role === "parent";

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // 在 effect 內取值，避免 cleanup 讀到已變動的 ref（沿用 NavDrawer 的處理方式）。
    const trigger = triggerRef?.current ?? null;
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    (canReport ? textareaRef.current : closeButtonRef.current)?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, onClose, triggerRef, canReport]);

  // 關閉後重置，下次打開不會殘留上一輪的錯誤或已送出狀態。
  useEffect(() => {
    if (open) return;
    setReason("");
    setBusy(false);
    setError(null);
    setSubmitted(false);
  }, [open]);

  const submit = useCallback(async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("請說明檢舉原因。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      /*
       * 這個 dialog 掛在**公開**的教材詳情頁上，401 要留在 dialog 內顯示
       * 「登入狀態已失效，請重新登入後再送出檢舉。」，不要把正在打字的使用者整頁換掉。
       * `apiFetch` 的預設就是頁內處理（`DX-04` 是 opt-in），因此這裡不需要傳任何選項。
       */
      const res = await apiFetch("reports", {
        method: "POST",
        body: JSON.stringify({ material_id: materialId, reason: trimmed }),
      });
      if (!res.ok) {
        setError(await describeFailure(res));
        return;
      }
      setSubmitted(true);
    } catch {
      setError("送出檢舉失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }, [materialId, reason]);

  if (!open) return null;

  const loginHref = `/login?redirect=${encodeURIComponent(`/materials/${materialId}`)}`;

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉檢舉表單"
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="檢舉教材"
        data-testid="material-report-dialog"
        className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-ds-card border border-ds-border bg-ds-surface p-6 shadow-ds-card-hover"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ds-heading">檢舉教材</h2>
            <p className="mt-1 truncate text-sm text-ds-textMuted">{materialTitle}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-ds-textMuted transition-colors hover:bg-ds-surfaceSubtle hover:text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        {submitted ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-ds-heading">已收到你的檢舉。</p>
            <p className="mt-1 text-sm text-ds-textMuted">
              我們會盡快查看。檢舉處理不會通知檢舉人，也不會把你的身分告訴創作者。
            </p>
            <Button intent="neutral" fullWidth className="mt-5" onClick={onClose}>
              關閉
            </Button>
          </div>
        ) : !canReport ? (
          <div className="mt-5">
            <p className="text-sm text-ds-body">請先以購買者帳號登入，才能送出檢舉。</p>
            <Link
              href={loginHref}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-intent-flow)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-button-flow)] transition-colors hover:bg-[var(--color-brand-cta-hover)]"
            >
              前往登入
            </Link>
          </div>
        ) : (
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="material-report-reason" className="text-sm font-medium text-ds-heading">
              檢舉原因
            </label>
            <p className="mt-1 text-xs text-ds-textMuted">
              請具體說明問題所在（例如內容與描述不符、疑似侵權、不當內容），管理員會看到你填的原文。
            </p>
            <textarea
              ref={textareaRef}
              id="material-report-reason"
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              rows={5}
              onChange={(event) => setReason(event.target.value)}
              placeholder="請描述你遇到的問題…"
              className="mt-2 w-full resize-y rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] transition-shadow focus:border-[#6C63FF]/50 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              <p role="alert" className="text-xs text-[#EF4444]">
                {error ?? ""}
              </p>
              <span className="shrink-0 text-xs text-ds-textMuted">
                {reason.length} / {REASON_MAX_LENGTH}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="submit" intent="danger" fullWidth disabled={busy || reason.trim().length === 0}>
                {busy ? "送出中…" : "送出檢舉"}
              </Button>
              <Button type="button" intent="neutral" fullWidth onClick={onClose} disabled={busy}>
                取消
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
