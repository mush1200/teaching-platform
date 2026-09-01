"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";
import { PageHeader } from "../../../../components/ds";
import {
  COMPLAINT_TYPES,
  COMPLAINT_TYPE_LABEL,
  type ComplaintType,
} from "../../../../lib/complaint-labels";

/**
 * 提出申訴（P1-09 Gate 3 / Wave 2 #10）。
 *
 * ## 訂單 context
 *
 * `?orderId=` 由訂單詳情頁帶入 —— 那是「從正確的交易 context 發起申訴」的入口。
 * **沒有 `orderId` 也必須能提出**：帳號遭冒用（`account_security`）這類爭議
 * 本來就不指向任何訂單（`mvp_rules.md` §12.10.7）。
 *
 * ## 沒有 frontend-only 狀態
 *
 * `buyerId` 一律由 backend 從 token 帶入，**前端不送也送不進去**；
 * 訂單擁有權由 backend 驗證（非本人回 403 `order_not_owned`），
 * 前端不預先判斷、也不隱藏該錯誤。
 */
export default function NewComplaintPage() {
  return (
    <Suspense fallback={null}>
      <NewComplaintForm />
    </Suspense>
  );
}

function NewComplaintForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = (searchParams?.get("orderId") ?? "").trim();

  const [complaintType, setComplaintType] = useState<ComplaintType>(orderId ? "payment" : "account_security");
  const [subject, setSubject] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!subject.trim()) return setError("請填寫申訴主旨。");
    if (!statement.trim()) return setError("請說明申訴內容，平台才能依此調查。");

    setBusy(true);
    try {
      const res = await apiFetch("me/complaints", {
        method: "POST",
        body: JSON.stringify({
          // 只在真的有訂單 context 時才帶 —— 空字串會被 backend 當成無效值。
          orderId: orderId || undefined,
          complaintType,
          subject: subject.trim(),
          statement: statement.trim(),
        }),
      });
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as { complaint?: { id?: string } };
      const id = data.complaint?.id;
      router.push(id ? `/me/complaints/${encodeURIComponent(id)}` : "/me/complaints");
    } catch {
      setError("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6" data-testid="new-complaint-page">
      <PageHeader
        title="提出申訴"
        description={
          orderId
            ? `針對訂單 ${orderId} 提出申訴。平台會依消費者保護法規定處理並回覆您。`
            : "若您的爭議與特定訂單無關（例如帳號遭冒用），可直接於此提出。"
        }
        action={
          <Link
            href="/me/complaints"
            className="inline-flex min-h-11 items-center rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-heading"
          >
            返回申訴清單
          </Link>
        }
      />

      <div className="mt-4 space-y-4 rounded-ds-card border border-ds-border bg-ds-surface p-5">
        {orderId ? (
          <p className="rounded-xl bg-ds-surfaceMuted px-3 py-2 text-meta text-ds-textMuted" data-testid="complaint-order-context">
            申訴對象訂單：<span className="font-semibold text-ds-heading">{orderId}</span>
          </p>
        ) : null}

        <label className="block">
          <span className="text-meta text-ds-textMuted">申訴類型</span>
          <select
            value={complaintType}
            onChange={(e) => setComplaintType(e.currentTarget.value as ComplaintType)}
            data-testid="complaint-type"
            className="mt-1 min-h-11 w-full rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
          >
            {COMPLAINT_TYPES.map((t) => (
              <option key={t} value={t}>
                {COMPLAINT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-meta text-ds-textMuted">主旨</span>
          <input
            type="text"
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.currentTarget.value)}
            placeholder="例：已匯款但訂單仍顯示未付款"
            data-testid="complaint-subject"
            className="mt-1 min-h-11 w-full rounded-xl border border-ds-border bg-ds-surface px-3 text-sm text-ds-heading"
          />
        </label>

        <label className="block">
          <span className="text-meta text-ds-textMuted">申訴內容</span>
          <textarea
            rows={6}
            maxLength={5000}
            value={statement}
            onChange={(e) => setStatement(e.currentTarget.value)}
            placeholder="請說明發生的情況、時間，以及您希望平台如何處理。"
            data-testid="complaint-statement"
            className="mt-1 w-full rounded-xl border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-heading"
          />
          <span className="mt-1 block text-meta text-ds-textMuted">
            送出後可在申訴詳情頁補充匯款截圖等佐證資料。
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-body text-edu-error" data-testid="complaint-error">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          data-testid="complaint-submit"
          className="min-h-11 w-full rounded-xl bg-intent-action px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "送出中…" : "送出申訴"}
        </button>
      </div>
    </main>
  );
}
