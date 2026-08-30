"use client";

/**
 * 佇列頁的「最後更新時間 + 重新整理」。
 *
 * ## Admin Refresh UX rule（見 docs/admin-information-architecture.md）
 *
 * 1. **只有 Queue／Inbox 型頁面**才提供手動重新整理 —— 那是「內容會被別人改變、
 *    我盯著它清空」的頁面（教材審核、付款審核、檢舉管理）。
 *    Reference / Audit / Investigation 型頁面（訂單、活動紀錄、教學回饋）不提供。
 * 2. **有重新整理就必須有「最後更新」** —— 沒有時間戳的按鈕，使用者無從判斷是否該按。
 * 3. 載入失敗的重試由 `ErrorState` 負責，不需要頁首再放一顆。
 * 4. 它是**次要動作**：icon + 時間戳，不與該頁的主要動作（核准／退回）搶視覺權重。
 *
 * `updatedAt` 由呼叫端在每次成功載入後更新；尚未載入完成時傳 `null`，
 * 此時只顯示按鈕（避免 server render 與 client 時間不一致造成 hydration 警告）。
 */
export function RefreshControl({
  updatedAt,
  onRefresh,
  busy = false,
  label = "重新整理",
}: {
  updatedAt: Date | null;
  onRefresh: () => void;
  busy?: boolean;
  label?: string;
}) {
  const stamp = updatedAt
    ? updatedAt.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;

  return (
    <div className="flex items-center gap-2">
      {stamp ? (
        <span data-testid="refresh-last-updated" className="text-caption text-ds-textSubtle">
          最後更新 {stamp}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        data-testid="refresh-button"
        aria-label={label}
        title={label}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-ds-border bg-ds-surface text-ds-textMuted transition-colors hover:bg-edu-page hover:text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:opacity-50"
      >
        <span aria-hidden className={busy ? "animate-spin motion-reduce:animate-none" : undefined}>
          ↻
        </span>
      </button>
    </div>
  );
}
