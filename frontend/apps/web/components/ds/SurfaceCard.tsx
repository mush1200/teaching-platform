import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** 預設為標準卡片；elevated 略強陰影（列表卡） */
  elevation?: "flat" | "raised" | "interactive";
};

const elevationCls: Record<NonNullable<Props["elevation"]>, string> = {
  flat: "border-ds-border shadow-ds-card-soft",
  raised: "border-ds-border shadow-ds-card",
  interactive:
    "border-ds-border shadow-ds-card transition hover:border-ds-borderStrong hover:shadow-ds-card-hover",
};

/**
 * 設計系統表面容器 — 使用 `--ds-*` token（Tailwind `ds` theme）。
 */
export function SurfaceCard({ children, className = "", elevation = "raised", ...rest }: Props) {
  return (
    <div
      className={`rounded-ds-card border bg-ds-surface ${elevationCls[elevation]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
