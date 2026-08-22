"use client";

/**
 * Canonical 分頁元件（Epic §6 / §13）。
 *
 * ## 為什麼是這一份
 *
 * repo 裡原本有兩個分頁實作，兩個都不夠用：
 *   - `@teaching-platform/ui` 的 `Pagination`（Tamagui）—— 只有上一頁／下一頁，
 *     而且是 legacy-frozen 的技術棧，新程式碼不得新增使用點。
 *   - `components/parent/PaginationBar`（Tailwind）—— 同樣只有上一頁／下一頁，
 *     且沒有每頁筆數。
 *
 * 這裡是**唯一**該被新頁面使用的分頁：頁碼、省略號、每頁筆數。
 * **不要**為某個頁面再做一個 `XxxPagination`。
 *
 * ## 頁碼視窗
 *
 * 永遠顯示第一頁與最後一頁，中間是以目前頁為中心的固定寬度視窗，
 * 兩側視需要插入省略號。頁數很多時控制項寬度不會爆開，
 * 而「跳到最後一頁」永遠只要一次點擊。
 */

export type PaginationProps = {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  disabled?: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
  className?: string;
};

/** 與 `Backend/utils/adminQuery.js` 的 `PAGE_SIZE_OPTIONS` 對齊（上限 100）。 */
export const PAGE_SIZE_OPTIONS = [20, 50, 100];

/** 目前頁前後各保留 1 頁；加上首末頁與省略號，控制項最多 7 個格子。 */
const WINDOW_RADIUS = 1;

/**
 * @returns 依序的頁碼與省略號標記；`"gap-left"` / `"gap-right"` 是 key 用的 sentinel，
 *          兩個缺口可能同時存在，所以不能共用同一個 key。
 */
export function buildPageItems(page: number, totalPages: number): Array<number | "gap-left" | "gap-right"> {
  if (totalPages <= 1) return [1];

  const pages = new Set<number>([1, totalPages]);
  for (let p = page - WINDOW_RADIUS; p <= page + WINDOW_RADIUS; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const items: Array<number | "gap-left" | "gap-right"> = [];
  let previous = 0;
  for (const p of sorted) {
    // 只有真的跳過 2 頁以上才放省略號；差 1 時直接補上那一頁比較不浪費空間。
    if (previous && p - previous > 1) {
      if (p - previous === 2) items.push(previous + 1);
      else items.push(p <= page ? "gap-left" : "gap-right");
    }
    items.push(p);
    previous = p;
  }
  return items;
}

const buttonBase =
  "inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:cursor-not-allowed disabled:opacity-40";
const idleButton = `${buttonBase} border-ds-border bg-ds-surface text-ds-heading hover:bg-edu-page`;
const activeButton = `${buttonBase} border-edu-primary bg-edu-primary text-white`;

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  disabled = false,
  onPageChange,
  onPageSizeChange,
  className = "",
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const items = buildPageItems(page, safeTotalPages);

  return (
    <nav
      aria-label="分頁"
      data-testid="pagination"
      className={`flex flex-wrap items-center justify-between gap-3 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={idleButton}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一頁"
          data-testid="pagination-prev"
        >
          ←
        </button>

        {items.map((item) =>
          typeof item === "number" ? (
            <button
              key={item}
              type="button"
              className={item === page ? activeButton : idleButton}
              aria-current={item === page ? "page" : undefined}
              aria-label={`第 ${item} 頁`}
              disabled={disabled}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ) : (
            <span key={item} aria-hidden className="px-1 text-sm text-ds-textMuted">
              …
            </span>
          )
        )}

        <button
          type="button"
          className={idleButton}
          disabled={disabled || page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一頁"
          data-testid="pagination-next"
        >
          →
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-ds-textMuted">
        {typeof totalItems === "number" ? (
          <span data-testid="pagination-total">
            共 {totalItems} 筆 · 第 {page} / {safeTotalPages} 頁
          </span>
        ) : null}
        {onPageSizeChange && typeof pageSize === "number" ? (
          <label className="flex items-center gap-2">
            <span>每頁</span>
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              aria-label="每頁筆數"
              data-testid="pagination-page-size"
              className="min-h-9 rounded-xl border border-ds-border bg-ds-surface px-2 text-sm text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </nav>
  );
}
