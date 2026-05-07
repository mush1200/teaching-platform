import type { ReactNode } from "react";

/** 使用者中心內頁共用頂部：層級清楚、留白一致（設計系統 `ds` token） */
export function AccountPageHeader({
  title,
  description,
  badge,
  actions,
  className = "",
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`border-b border-ds-borderMuted pb-8 ${className}`.trim()}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold tracking-wide text-ds-textSubtle">已購內容</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ds-heading md:text-[1.75rem] md:leading-tight">{title}</h1>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          {description ? <p className="max-w-2xl text-[15px] leading-relaxed text-ds-textMuted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function AccountPageHeaderOrders({
  title,
  description,
  badge,
  aside,
  className = "",
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  /** 右上角摘要（例：待處理筆數） */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`border-b border-ds-borderMuted pb-4 ${className}`.trim()}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {/* 行動版頁面標題已在 MobileHeader，避免與此處重複 */}
          <p className="hidden text-[11px] font-semibold tracking-wide text-ds-textSubtle md:block">交易紀錄</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3 md:mt-1">
            <h1 className="hidden text-xl font-bold tracking-tight text-ds-heading md:block md:text-2xl">{title}</h1>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-snug text-ds-textMuted">{description}</p>
          ) : null}
        </div>
        {aside ? (
          <div className="hidden shrink-0 text-sm tabular-nums leading-snug text-[#777777] md:block md:pt-6 md:text-right">{aside}</div>
        ) : null}
      </div>
    </header>
  );
}

export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ds-borderMuted bg-ds-surface px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ds-textMuted shadow-sm">
      {children}
    </span>
  );
}

export function QueryErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-ds-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-lg" aria-hidden>
          !
        </span>
        <div>
          <p className="text-sm font-semibold text-[#991B1B]">無法載入資料</p>
          <p className="mt-0.5 text-sm text-[#B91C1C]/90">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-xl border border-rose-200 bg-ds-surface px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
        >
          重新整理
        </button>
      ) : null}
    </div>
  );
}

export function LibraryGridSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-ds-card border border-ds-border bg-ds-surface shadow-ds-card-soft">
          <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-ds-borderMuted to-ds-border" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-[88%] max-w-[220px] animate-pulse rounded-md bg-ds-borderMuted" />
            <div className="h-3 w-1/2 animate-pulse rounded-md bg-gray-100" />
            <div className="h-3 w-2/3 animate-pulse rounded-md bg-gray-100" />
            <div className="flex gap-2 pt-2">
              <div className="h-10 flex-1 animate-pulse rounded-2xl bg-gray-100" />
              <div className="h-10 flex-1 animate-pulse rounded-2xl bg-gray-100" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OrderListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-ds-card border border-ds-border bg-ds-surface p-6 shadow-ds-card-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <div className="space-y-3">
              <div className="h-8 w-36 animate-pulse rounded-md bg-ds-borderMuted" />
              <div className="h-4 w-24 animate-pulse rounded-md bg-gray-100" />
              <div className="h-4 w-28 animate-pulse rounded-md bg-gray-100" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded-full bg-gray-100" />
          </div>
          <div className="mt-5 h-[72px] animate-pulse rounded-2xl bg-ds-surfaceSubtle" />
          <div className="mt-5 h-11 animate-pulse rounded-xl bg-ds-surfaceSubtle" />
        </div>
      ))}
    </div>
  );
}
