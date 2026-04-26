import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "social";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C63FF] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#FF6B73] text-white shadow-[0_8px_24px_rgba(255,107,115,0.28)] hover:bg-[#FF5964] active:bg-[#FF5964]",
  secondary: "bg-[#6C63FF] text-white shadow-[0_6px_20px_rgba(108,99,255,0.22)] hover:brightness-95",
  ghost: "bg-transparent text-[#6B7280] hover:bg-white/60",
  outline: "border border-[#E5E7EB] bg-white text-[#1F2937] shadow-sm hover:border-[#6C63FF]/40 hover:text-[#6C63FF]",
  social: "border border-[#E5E7EB] bg-white text-[#1F2937] shadow-sm hover:bg-[#F9FAFB]",
};

export function Button({
  variant = "primary",
  fullWidth,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
