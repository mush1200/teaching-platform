"use client";

type Props = {
  label: string;
  value: string;
  subtext: string;
};

/**
 * 核心統計卡 — 定位是「可快速掃描的 summary strip」，不是第二組大型 KPI。
 * 數值降到 `text-xl`：除了降低卡片高度，也讓 `NT$ 10,550` 這類較長的值在
 * 1280px 的六欄版面下不再換行（換行會讓整排從 110px 撐到 142px）。
 */
export function AdminKpiCard({ label, value, subtext }: Props) {
  return (
    <article className="rounded-ds-card border border-ds-border bg-ds-surface p-3 shadow-ds-card-soft">
      <p className="text-meta text-ds-textMuted">{label}</p>
      <p className="mt-1 text-xl font-bold leading-tight text-ds-heading">{value}</p>
      <p className="mt-0.5 text-caption text-ds-textSubtle">{subtext}</p>
    </article>
  );
}
