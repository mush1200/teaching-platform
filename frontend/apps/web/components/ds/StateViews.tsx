import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * Canonical feedback states（Empty / Loading / Error）— Tailwind + `feedback.*` / `ds.*` token。
 *
 * 分層：design-system composition（`components/ds`）。三者皆由 surface + typography +
 * 選用的 action 組成，且 `ErrorState` 會 reuse `components/ui/Button`，屬 composed pattern
 * 而非 primitive。詳見 `docs/ui-design-system.md` §3。
 *
 * 狀態標題一律用 `<p>` 而非 `<h*>`：這些是暫時性的狀態訊息，內嵌在任意容器時
 * 不應插入標題階層。
 */

const shellBase = "flex flex-col items-center justify-center gap-2 rounded-ds-card border px-4 py-6 text-center";

const titleBase = "text-title";

const descriptionBase = "max-w-sm text-body";

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** 選用的裝飾性圖示；會以 `aria-hidden` 包覆 */
  icon?: ReactNode;
  /** 選用的操作；請傳入 canonical `Button` 或 `components/ds` 的 CTA link */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`${shellBase} border-ds-border bg-ds-surfaceSubtle ${className}`.trim()}>
      {icon ? (
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-feedback-emptyIconBg text-feedback-emptyAction"
        >
          {icon}
        </span>
      ) : null}
      <p className={`${titleBase} text-feedback-emptyTitle`}>{title}</p>
      {description ? <p className={`${descriptionBase} text-feedback-emptyDescription`}>{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export type LoadingStateProps = {
  title?: string;
  className?: string;
};

export function LoadingState({ title = "載入中…", className = "" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${shellBase} border-ds-border bg-ds-surface ${className}`.trim()}
    >
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-feedback-loadingSpinnerTrack border-t-feedback-loadingSpinnerPrimary"
      />
      <p className={`${descriptionBase} text-feedback-loadingText`}>{title}</p>
    </div>
  );
}

export type ErrorStateProps = {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
  /**
   * `block`（預設）＝ 置中的整版錯誤區塊。
   * `inline` ＝ 單一區塊（section）的錯誤：單行排版、較小內距、retry 為 secondary。
   * 局部失敗不該長成比它取代的內容還大的卡片，也不該讓 retry 比頁面主要動作更醒目。
   */
  variant?: "block" | "inline";
};

export function ErrorState({
  title,
  description,
  retryLabel = "重新整理",
  onRetry,
  className = "",
  variant = "block",
}: ErrorStateProps) {
  if (variant === "inline") {
    return (
      <div
        role="alert"
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ds-card border border-feedback-errorBorder bg-ds-surface px-4 py-3 ${className}`.trim()}
      >
        <CircleAlert aria-hidden className="size-4 shrink-0 text-feedback-errorText" />
        <p className={`${titleBase} text-feedback-errorText`}>{title}</p>
        {description ? <p className="text-caption text-ds-textMuted">{description}</p> : null}
        {onRetry ? (
          <Button intent="neutral" variant="outline" className="ml-auto min-h-10 px-3 py-1.5" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`${shellBase} border-feedback-errorBorder bg-ds-surface ${className}`.trim()}
    >
      <CircleAlert aria-hidden className="size-5 text-feedback-errorText" />
      <p className={`${titleBase} text-feedback-errorText`}>{title}</p>
      {description ? <p className={`${descriptionBase} text-ds-textMuted`}>{description}</p> : null}
      {onRetry ? (
        <div className="pt-1">
          <Button intent="action" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
