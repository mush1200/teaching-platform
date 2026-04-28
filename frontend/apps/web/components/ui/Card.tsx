import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  level?: "elevated" | "default" | "flat";
};

const pad: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 md:p-8",
};

const levelStyle: Record<NonNullable<CardProps["level"]>, string> = {
  elevated: "rounded-[var(--radius-card-elevated)] border border-[#E5E7EB]/80 bg-white shadow-[var(--shadow-card-elevated)]",
  default: "rounded-[var(--radius-card-default)] border border-[#E5E7EB]/80 bg-white shadow-[var(--shadow-card-default)]",
  flat: "rounded-[var(--radius-card-flat)] border border-[#E5E7EB] bg-[#FAF8FF] shadow-none",
};

export function Card({ children, className = "", padding = "md", level = "default", ...rest }: CardProps) {
  return (
    <div
      className={`${levelStyle[level]} ${pad[padding]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
