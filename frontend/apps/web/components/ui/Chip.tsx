import type { HTMLAttributes, ReactNode } from "react";

type ChipTone = "materialFormat" | "teachingMethods" | "learningGoals" | "teachingFormat" | "supportLevel" | "neutral";

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: ChipTone;
};

const toneStyles: Record<ChipTone, string> = {
  materialFormat: "bg-violet-100 text-violet-800 hover:bg-violet-200",
  teachingMethods: "bg-sky-100 text-sky-800 hover:bg-sky-200",
  learningGoals: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  teachingFormat: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  supportLevel: "bg-rose-100 text-rose-800 hover:bg-rose-200",
  neutral: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

export function Chip({ children, tone = "neutral", className = "", ...rest }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-medium transition-shadow hover:shadow-sm ${toneStyles[tone]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  );
}
