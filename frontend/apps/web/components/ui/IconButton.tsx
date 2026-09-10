import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Canonical icon-only button（`UI-CONS-09`，Wave UI-2）。
 *
 * ## 為什麼是獨立元件而不是 `Button` 的一個 prop
 *
 * icon-only 的**可及性契約與一般 button 不同**：它沒有可見文字，因此
 * `aria-label` 不是選配而是**必要條件**。把它做成獨立元件，型別就能強制這件事 ——
 * `label` 是 required prop，忘了給不會編譯過，而不是靜靜產生一顆沒有名字的按鈕。
 *
 * ## 44×44
 *
 * `docs/ui-design-system.md` §10.4 要求 mobile 可點區域 ≥ 44×44，
 * 而 `components/layout/shell-constants.ts` 的 `NAV_ICON_BUTTON_CLASS` 已經是 `size-11`。
 * 這裡把同一個尺寸變成 primitive 的預設，讓新的 icon button 不必再各自記得。
 *
 * **注意：本元件只提供 canonical recipe，Wave UI-2 不做全站 touch-target 遷移** ——
 * 既有 40px／36px 的控制項屬 `UI-CONS-18`／Wave UI-7，不在本輪範圍。
 */

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  /** 必填：icon-only 控制項的可及名稱。tooltip **不能**取代它。 */
  label: string;
  children: ReactNode;
  /** `md` = 44×44（預設，符合 §10.4）；`sm` = 40×40，僅供既有密集工具列沿用。 */
  size?: "sm" | "md";
  tone?: "neutral" | "danger";
};

const sizes = {
  sm: "size-10",
  md: "size-11",
} as const;

const tones = {
  neutral: "text-ds-heading hover:bg-edu-page",
  danger: "text-edu-error hover:bg-[var(--color-feedback-error-bg)]",
} as const;

export function IconButton({
  label,
  children,
  size = "md",
  tone = "neutral",
  className = "",
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus",
        "disabled:pointer-events-none disabled:opacity-50",
        sizes[size],
        tones[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {/* icon 一律不進 accessibility tree —— 名稱由 `aria-label` 提供 */}
      <span aria-hidden className="inline-flex items-center justify-center">
        {children}
      </span>
    </button>
  );
}
