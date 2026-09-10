"use client";

import type { SelectHTMLAttributes } from "react";
import { useFormFieldControl } from "./FormField";

/**
 * Canonical select primitive（`UI-CONS-09`，Wave UI-2）。
 *
 * **不是** legacy Tamagui `SelectField` 的搬運 —— 那一份把 label 綁死在元件內、
 * 走 Tamagui runtime，且屬 legacy-frozen 技術棧。這裡是 Tailwind + `ds` token 的原生
 * `<select>`：label 由 `FormField` 負責，控制項只管控制項。
 *
 * 收斂前全 app **17 個裸 `<select>`**，沒有任何共用實作，因此邊框、focus、
 * disabled 與尺寸各頁不同。
 *
 * 樣式與 `Input` 共用同一組 token，讓同一列表單裡的輸入框與下拉看起來是一套系統。
 */

/*
  `size` 必須 `Omit` 掉：原生 `<select>` 的 `size` 是**數字**（可見選項列數），
  與我們的視覺尺寸同名但語意完全不同。不 Omit 會讓兩者交集成 `never`。
*/
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** 視覺尺寸；與 `Button` 的 size 對齊（`sm` = 40px，`md` = 44px）。 */
  size?: "sm" | "md";
  invalid?: boolean;
};

const sizes = {
  sm: "min-h-11 px-3 py-1.5 text-sm",
  md: "min-h-11 px-4 py-2.5 text-sm",
} as const;

export function Select({ size = "md", invalid, className = "", ...rest }: SelectProps) {
  const field = useFormFieldControl();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    <select
      {...rest}
      id={rest.id ?? field?.id}
      aria-invalid={rest["aria-invalid"] ?? (isInvalid ? true : undefined)}
      aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
      className={[
        "w-full appearance-none rounded-xl border bg-ds-surface text-ds-heading transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        isInvalid ? "border-feedback-errorBorder" : "border-ds-borderControl",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
