"use client";

import type { TextareaHTMLAttributes } from "react";
import { useFormFieldControl } from "./FormField";

/**
 * Canonical textarea primitive（`UI-CONS-09`，Wave UI-2）。
 *
 * 收斂前全 app **18 個裸 `<textarea>`，0 個共用元件** —— Admin 的退回原因、
 * 拒絕憑證原因、申訴內容、教材說明各自寫一份樣式。
 *
 * 與 `Input` / `Select` 共用同一組 token 與 focus recipe。
 */

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ invalid, className = "", rows = 4, ...rest }: TextareaProps) {
  const field = useFormFieldControl();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    <textarea
      rows={rows}
      {...rest}
      id={rest.id ?? field?.id}
      aria-invalid={rest["aria-invalid"] ?? (isInvalid ? true : undefined)}
      aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
      className={[
        "w-full rounded-xl border bg-ds-surface px-4 py-2.5 text-sm text-ds-heading transition-colors",
        "placeholder:text-ds-textMuted",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isInvalid ? "border-feedback-errorBorder" : "border-ds-borderControl",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
