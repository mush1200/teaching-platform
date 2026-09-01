"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";
import { ErrorState, LoadingState, StatusPill } from "../ds";

/**
 * 帳號凍結／解除凍結的 Admin 操作面板（`OPS-02` / `DEC-LEGAL-10`）。
 *
 * ## 為什麼掛在使用者活動紀錄頁
 *
 * 這是平台上**唯一**的「依人查詢」入口（IA §6），Admin 追查某個帳號時本來就會到這裡。
 * `IA-07` 已刻意判定還不做使用者管理模組，因此**不新建 list 頁、不動側欄**——
 * 把控制項放在既有的 per-user surface 是最小且一致的做法。
 *
 * ## 單一 Admin 模型
 *
 * `DEC-LEGAL-10` 明訂 MVP **不採 two-admin approval**：admin 只能由維運 CLI 建立，
 * 現階段可能只有一位，強制第二人覆核會製造「凍結得了、解凍不了」的鎖死風險。
 * 因此這裡是單人操作 ＋ 明確確認 ＋ 完整稽核，而不是簽核佇列。
 *
 * ## 文案只描述系統真的做得到的事
 *
 * 凍結**不是**永久停權、**不是**法律違規認定、**不是**已確認詐欺。
 * 它擋的是受 `requireActiveAccount` 保護的寫入；被凍結的人**仍可登入、
 * 仍可查看、仍可提出申訴**（`BUY-02` 建立的產品事實）。
 */

type ReasonOption = { code: string; label: string };

type AccountStatus = {
  id: string;
  email: string;
  role: string;
  accountStatus: "active" | "frozen";
  frozenAt: string | null;
  frozenBy: string | null;
  freezeReason: string | null;
  unfrozenAt: string | null;
  unfrozenBy: string | null;
  currentReasonCode: string | null;
  currentNote: string | null;
};

type Payload = {
  user: AccountStatus;
  reasonOptions: ReasonOption[];
  canFreeze: boolean;
};

function formatTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-TW", { hour12: false });
}

export function AccountFreezePanel({ userId }: { userId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<null | "freeze" | "unfreeze">(null);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/users/${encodeURIComponent(userId)}/account-status`);
      if (!res.ok) {
        setData(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setData((await res.json()) as Payload);
    } catch {
      setData(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setConfirming(null);
    setReasonCode("");
    setNote("");
    setActionError(null);
  }

  async function submit(kind: "freeze" | "unfreeze") {
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(`admin/users/${encodeURIComponent(userId)}/${kind}`, {
        method: "POST",
        body: JSON.stringify(kind === "freeze" ? { reasonCode, note: note.trim() || undefined } : {}),
      });
      if (!res.ok) {
        // Backend 的錯誤原樣呈現 —— 不在前端另編一套說法。
        setActionError(await parseApiErrorMessage(res));
        return;
      }
      setDone(kind === "freeze" ? "已凍結此帳號。" : "已解除此帳號的凍結。");
      resetForm();
      await load();
    } catch {
      setActionError("無法連線至伺服器，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState title="載入帳號狀態中…" />;
  if (error) return <ErrorState title="無法載入帳號狀態" description={error} onRetry={() => void load()} />;
  if (!data) return null;

  const { user, reasonOptions, canFreeze } = data;
  const frozen = user.accountStatus === "frozen";
  const otherNeedsNote = reasonCode === "other" && !note.trim();

  return (
    <article
      className="space-y-4 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft"
      data-testid="account-freeze-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-title text-ds-heading">帳號狀態</h2>
          <p className="mt-1 text-meta text-ds-textMuted">{user.email}</p>
        </div>
        <span data-testid="account-status-pill">
          <StatusPill tone={frozen ? "danger" : "success"} label={frozen ? "已凍結" : "正常"} />
        </span>
      </header>

      {/* 凍結歷程一律顯示，解凍後也不隱藏 —— 「曾經被凍結過」是稽核事實。 */}
      {user.frozenAt ? (
        <dl className="grid gap-2 rounded-ds-card bg-edu-page p-3 text-meta text-ds-textMuted sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ds-heading">凍結時間</dt>
            <dd data-testid="frozen-at">{formatTime(user.frozenAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ds-heading">操作者</dt>
            <dd>{user.frozenBy ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-ds-heading">凍結原因</dt>
            <dd data-testid="freeze-reason">{user.freezeReason ?? "—"}</dd>
          </div>
          {user.currentReasonCode ? (
            <div className="sm:col-span-2">
              <dt className="font-medium text-ds-heading">原因代碼</dt>
              <dd data-testid="freeze-reason-code">{user.currentReasonCode}</dd>
            </div>
          ) : null}
          {user.unfrozenAt ? (
            <div className="sm:col-span-2">
              <dt className="font-medium text-ds-heading">解除凍結時間</dt>
              <dd>{formatTime(user.unfrozenAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {done ? (
        <p role="status" className="rounded-ds-card bg-emerald-50 px-3 py-2 text-meta text-emerald-800">
          {done}
        </p>
      ) : null}

      {!canFreeze ? (
        /*
         * 前端只是把不合法操作藏起來；backend 仍會各自再擋一次
         * （`cannot_freeze_self` / `cannot_freeze_admin`）。UI 不是授權邊界。
         */
        <p className="text-meta text-ds-textMuted" data-testid="freeze-unavailable">
          此帳號不適用凍結操作（管理員帳號，或為您自己的帳號）。
        </p>
      ) : frozen ? (
        <div className="space-y-3">
          {confirming === "unfreeze" ? (
            <div className="space-y-3 rounded-ds-card border border-ds-border p-3" data-testid="unfreeze-confirm">
              <p className="text-body text-ds-heading">
                確定要解除凍結？此帳號將恢復受限制的交易操作。既有的凍結紀錄會保留。
              </p>
              {actionError ? (
                <p role="alert" className="text-meta text-rose-700" data-testid="freeze-error">
                  {actionError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit("unfreeze")}
                  data-testid="unfreeze-submit"
                  className="min-h-11 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "處理中…" : "確認解除凍結"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetForm}
                  className="min-h-11 rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-textMuted"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setConfirming("unfreeze");
              }}
              data-testid="unfreeze-open"
              className="min-h-11 rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-heading"
            >
              解除凍結
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {confirming === "freeze" ? (
            <div className="space-y-3 rounded-ds-card border border-ds-border p-3" data-testid="freeze-confirm">
              <label className="block text-meta font-medium text-ds-heading" htmlFor="freeze-reason-code">
                凍結原因（必選）
              </label>
              <select
                id="freeze-reason-code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                disabled={busy}
                data-testid="freeze-reason-select"
                className="min-h-11 w-full rounded-xl border border-ds-border bg-white px-3 text-sm text-ds-heading"
              >
                <option value="">請選擇原因</option>
                {reasonOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <label className="block text-meta font-medium text-ds-heading" htmlFor="freeze-note">
                補充說明{reasonCode === "other" ? "（必填）" : "（選填）"}
              </label>
              <textarea
                id="freeze-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                rows={3}
                data-testid="freeze-note"
                className="w-full rounded-xl border border-ds-border bg-white px-3 py-2 text-sm text-ds-heading"
              />

              {/*
                只描述系統真的做得到的事。**不得**寫成永久停權、法律違規或已確認詐欺 ——
                那些都需要平台目前不具備的認定。
              */}
              <p className="rounded-ds-card bg-edu-page px-3 py-2 text-meta text-ds-textMuted">
                凍結後，此帳號將無法建立訂單、提交付款資訊、新增或修改教材、發表評價。
                但仍可登入、查看既有資料，並提出申訴。凍結為營運處置，可再解除。
              </p>

              {actionError ? (
                <p role="alert" className="text-meta text-rose-700" data-testid="freeze-error">
                  {actionError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !reasonCode || otherNeedsNote}
                  onClick={() => void submit("freeze")}
                  data-testid="freeze-submit"
                  className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "處理中…" : "確認凍結帳號"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetForm}
                  className="min-h-11 rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-textMuted"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setConfirming("freeze");
              }}
              data-testid="freeze-open"
              className="min-h-11 rounded-xl border border-rose-300 px-4 text-sm font-semibold text-rose-700"
            >
              凍結帳號
            </button>
          )}
        </div>
      )}
    </article>
  );
}
