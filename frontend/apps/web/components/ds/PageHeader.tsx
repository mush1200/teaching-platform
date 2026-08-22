import type { ReactNode } from "react";

/**
 * 清單／詳情頁的標準頁首（Epic §13）。
 *
 * Admin 各頁原本的標題全部是就地寫死的 `<h1 className="text-2xl font-bold text-slate-900">`，
 * 而且 `slate-*` 不是這個專案的 token 家族（`ds` / `edu`）。這裡統一標題階層、
 * 描述文字與右側動作區的位置。
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: ReactNode;
  /** 右側主要動作（重新整理、返回等）。 */
  action?: ReactNode;
  /** 標題上方的返回連結／麵包屑。 */
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      {breadcrumb ? <div className="text-sm">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h2 text-ds-heading">{title}</h1>
          {description ? <p className="mt-1 text-body text-ds-textMuted">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}

/** 狀態徽章。色調對照 `tailwind.config.ts` 的 `status.*` token。 */
export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-status-draftBg text-status-draftText",
    info: "bg-status-reviewedBg text-status-reviewedText",
    success: "bg-status-approvedBg text-status-approvedText",
    warning: "bg-status-pendingReviewBg text-status-pendingReviewText",
    danger: "bg-status-rejectedBg text-status-rejectedText",
  };
  return (
    <span
      data-testid="status-pill"
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

/**
 * 「標籤 / 值」的定義列。詳情頁大量使用；統一它才不會出現
 * 一頁用 `<p>標籤：值</p>`、另一頁用表格的情況。
 */
export function DetailField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <dt className="text-meta text-ds-textMuted">{label}</dt>
      <dd className="mt-0.5 break-words text-body text-ds-heading">{children}</dd>
    </div>
  );
}

/** `DetailField` 的網格容器；窄螢幕單欄，寬螢幕兩欄。 */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>;
}
