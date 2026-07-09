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
  elevated: "rounded-ds-card border border-ds-border bg-ds-surface shadow-[0_12px_36px_rgba(15,23,42,0.10)]",
  default: "rounded-ds-card border border-ds-border bg-ds-surface shadow-ds-card",
  flat: "rounded-ds-card border border-ds-border bg-ds-surfaceSubtle shadow-ds-card-soft",
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
