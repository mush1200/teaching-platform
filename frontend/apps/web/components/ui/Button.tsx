import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "social" | "flow" | "action" | "neutral" | "danger";
type Intent = "flow" | "action" | "neutral" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  intent?: Intent;
  fullWidth?: boolean;
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C63FF] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  flow:
    "bg-[var(--color-intent-flow)] text-white shadow-[var(--shadow-button-flow)] hover:bg-[var(--color-brand-cta-hover)] active:bg-[var(--color-brand-cta-hover)]",
  action: "bg-[var(--color-intent-action)] text-white shadow-[var(--shadow-button-action)] hover:brightness-95",
  neutral: "border border-[var(--color-surface-border)] bg-[var(--color-intent-neutral)] text-[var(--color-text-primary)] shadow-sm",
  danger: "bg-[var(--color-intent-danger)] text-white shadow-sm hover:brightness-95",
  primary:
    "bg-[var(--color-intent-flow)] text-white shadow-[var(--shadow-button-flow)] hover:bg-[var(--color-brand-cta-hover)] active:bg-[var(--color-brand-cta-hover)]",
  secondary: "bg-[var(--color-intent-action)] text-white shadow-[var(--shadow-button-action)] hover:brightness-95",
  ghost: "bg-transparent text-[var(--color-text-secondary)] hover:bg-white/60",
  outline: "border border-[var(--color-surface-border)] bg-white text-[var(--color-text-primary)] shadow-sm hover:border-[#6C63FF]/40 hover:text-[#6C63FF]",
  social: "border border-[#E5E7EB] bg-white text-[#1F2937] shadow-sm hover:bg-[#F9FAFB]",
};

export function Button({
  variant = "primary",
  intent,
  fullWidth,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const resolvedVariant: Variant =
    intent === "flow"
      ? "flow"
      : intent === "action"
        ? "action"
        : intent === "neutral"
          ? "neutral"
          : intent === "danger"
            ? "danger"
            : variant;
  return (
    <button
      type={type}
      className={`${base} ${variants[resolvedVariant]} ${fullWidth ? "w-full" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
