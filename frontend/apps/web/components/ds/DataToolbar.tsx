"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { IconSearch } from "../ui/icons";

/**
 * 清單頁共用的操作列（Epic §13：same problem → same solution）。
 *
 * Admin 的四個清單頁原本各自長出不同的篩選 UI：一個用 Tamagui `SelectField`、
 * 一個用兩顆 `Button` 當 toggle、一個用原生 `<select>`、一個用四個 `InputField`。
 * 同一種工作（「縮小這份清單」）在四個地方有四種操作方式。
 *
 * 這裡定義三個元件，涵蓋那四種情況：
 *   - `SearchField`  —— 主要搜尋（人類可讀的字串）
 *   - `FilterTabs`   —— 少量、互斥、帶數量的狀態篩選
 *   - `DataToolbar`  —— 兩者的容器 + 次要控制項插槽
 */

export type SearchFieldProps = {
  /** 已套用的值（通常來自 URL）。元件內部維持草稿狀態，送出時才回拋。 */
  value: string;
  onSubmit: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * 搜尋輸入。**送出制**（Enter 或按鈕），不是逐字 debounce。
 *
 * 這些搜尋會打到 server-side 查詢並改寫 URL；逐字觸發會在使用者打完一個詞之前
 * 送出五、六個請求，並在瀏覽器歷史裡塞滿中間狀態。
 */
export function SearchField({
  value,
  onSubmit,
  placeholder = "搜尋…",
  label = "搜尋",
  id = "data-toolbar-search",
  disabled = false,
  className = "",
}: SearchFieldProps) {
  const [draft, setDraft] = useState(value);

  // 外部（URL / 清除按鈕）改變已套用的值時，草稿要跟上，否則輸入框會顯示舊字串。
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(draft.trim());
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={`flex min-w-0 flex-1 gap-2 ${className}`.trim()}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ds-textMuted">
          <IconSearch className="size-4" />
        </span>
        <input
          id={id}
          type="search"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          data-testid="toolbar-search-input"
          className="min-h-10 w-full rounded-xl border border-ds-border bg-ds-surface py-2 pl-9 pr-3 text-sm text-ds-heading placeholder:text-ds-textSubtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
        />
      </div>
      <button
        type="submit"
        disabled={disabled}
        data-testid="toolbar-search-submit"
        className="min-h-10 shrink-0 rounded-xl bg-edu-primary px-4 text-sm font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:opacity-50"
      >
        搜尋
      </button>
      {value ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft("");
            onSubmit("");
          }}
          data-testid="toolbar-search-clear"
          className="min-h-10 shrink-0 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm font-medium text-ds-textMuted transition-colors hover:bg-edu-page"
        >
          清除
        </button>
      ) : null}
    </form>
  );
}

export type FilterTabOption = {
  value: string;
  label: string;
  /** 該狀態的**全表**筆數。`undefined` 時不顯示數字（而不是顯示 0）。 */
  count?: number;
};

/**
 * 互斥的狀態篩選。
 *
 * 數字必須是**全表**計數，不是目前這一頁的筆數 —— 這是 Backend 各清單
 * `statusCounts` 存在的理由。
 *
 * ## 兩種視覺層級（`variant`）
 *
 * 同一頁出現兩層篩選時（檢舉管理：案件範圍 → 處理狀態），兩層**不得長得一樣** ——
 * 那會讓使用者以為它們是同一個維度的六個互斥選項。
 *
 *   `segmented`（第一層）：連成一段的分段控制，形狀本身就說明「這是主切換」
 *   `pill`（預設、第二層或單層頁）：獨立的圓角 chip，視覺權重較低
 */
export function FilterTabs({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  testIdPrefix = "filter-tab",
  variant = "pill",
}: {
  options: FilterTabOption[];
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  /**
   * `data-testid` 前綴。同一頁出現兩層篩選時（例如檢舉管理的「案件範圍 → 處理狀態」），
   * 兩層可能共用同一個 value（`open` 既是第一層也是第二層的「全部」），
   * 前綴不同才不會產生兩個相同的 testid。
   */
  testIdPrefix?: string;
  variant?: "pill" | "segmented";
}) {
  const segmented = variant === "segmented";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={segmented ? "filter-segmented" : "filter-tabs"}
      className={
        segmented
          ? "inline-flex flex-wrap items-center gap-1 rounded-xl border border-ds-border bg-ds-surfaceMuted p-1"
          : "flex flex-wrap gap-2"
      }
    >
      {options.map((option) => {
        const active = option.value === value;
        const base = segmented
          ? `inline-flex min-h-9 items-center gap-2 rounded-lg px-3.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:opacity-50 ${
              active
                ? "bg-ds-surface font-semibold text-edu-primary shadow-ds-card-soft"
                : "font-medium text-ds-textMuted hover:text-ds-heading"
            }`
          : `inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:opacity-50 ${
              active
                ? "border-edu-primary bg-[#EDE9FE] font-semibold text-edu-primary"
                : "border-ds-border bg-ds-surface text-ds-textMuted hover:bg-edu-page hover:text-ds-heading"
            }`;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            data-testid={`${testIdPrefix}-${option.value}`}
            className={base}
          >
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span
                className={`inline-flex min-w-[1.5rem] justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  active ? (segmented ? "bg-edu-page text-edu-primary" : "bg-white/70 text-edu-primary") : "bg-[#F3F4F6] text-ds-textMuted"
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** 搜尋 + 篩選 + 次要控制項（排序、重新整理）的容器。 */
export function DataToolbar({
  search,
  filters,
  trailing,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card-soft">
      {search || trailing ? (
        <div className="flex flex-wrap items-center gap-3">
          {search}
          {trailing ? <div className="flex flex-wrap items-center gap-2">{trailing}</div> : null}
        </div>
      ) : null}
      {filters}
    </div>
  );
}
