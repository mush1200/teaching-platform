"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useFormFieldControl } from "./FormField";

/**
 * Text input primitive。
 *
 * ## Wave UI-2 的改動是**擴充**，不是重寫（`UI-CONS-09`）
 *
 * 既有 API（`label` ＋ `id` ＋ `error` ＋ `rightSlot`）維持可用 —— 唯一的既有呼叫端
 * `components/parent/SearchBar.tsx` 不需要任何修改。新增的是：
 *
 *   1. **`label` / `id` 變成選配**：當這個 input 被放進 `FormField` 時，
 *      label、help、error 與 ARIA 關聯由 `FormField` 統一負責，
 *      這裡只渲染控制項本身，避免出現兩個 label。
 *   2. **接上 `FormField` context**：`id` / `aria-invalid` / `aria-describedby`
 *      在 context 存在時自動取得（呼叫端明示值一律優先）。
 *   3. **硬編碼 hex 改為 token**：原本的 `#1F2937` / `#E5E7EB` / `#F9FAFB` / `#9CA3AF`
 *      換成 `ds-*`。**這不是 `UI-CONS-15` 的 token migration** —— 只限這一個檔案內、
 *      因為本輪本來就在改它的 API，順手讓新 primitive 不再帶著硬編碼色值出生。
 */

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  /** 獨立使用時的 label。放在 `FormField` 內時省略。 */
  label?: string;
  error?: string;
  rightSlot?: ReactNode;
  inputClassName?: string;
  invalid?: boolean;
};

export function Input({ label, id, error, rightSlot, inputClassName = "", invalid, ...rest }: InputProps) {
  const field = useFormFieldControl();
  const controlId = id ?? field?.id;
  const isInvalid = invalid ?? (error ? true : field?.invalid) ?? false;

  const control = (
    <div className="relative flex items-stretch">
      <input
        id={controlId}
        aria-invalid={rest["aria-invalid"] ?? (isInvalid ? true : undefined)}
        aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
        className={[
          "w-full rounded-2xl border bg-ds-surfaceSubtle px-4 py-3 text-sm text-ds-heading transition-colors",
          "placeholder:text-ds-textMuted",
          "focus:bg-ds-surface",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isInvalid ? "border-feedback-errorBorder" : "border-ds-borderControl",
          rightSlot ? "pr-12" : "",
          inputClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      {rightSlot ? (
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">{rightSlot}</div>
      ) : null}
    </div>
  );

  /*
    在 `FormField` 內時只回傳控制項：label / error / ARIA 由 `FormField` 提供，
    在這裡再渲染一次會產生兩個 label 與重複的錯誤訊息節點。
  */
  if (field && !label) return control;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={controlId} className="text-sm font-medium text-ds-heading">
          {label}
        </label>
      ) : null}
      {control}
      {error ? <p className="text-caption text-feedback-errorText">{error}</p> : null}
    </div>
  );
}
