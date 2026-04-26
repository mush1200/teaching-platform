import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
};

const pad: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 md:p-8",
};

export function Card({ children, className = "", padding = "md", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-[#E5E7EB]/80 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)] ${pad[padding]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
