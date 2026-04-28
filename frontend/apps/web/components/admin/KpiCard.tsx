type Props = {
  title: string;
  value: string;
  trend?: string;
  /** Default: 「較上月」 */
  trendLabel?: string;
  /** `neutral`：灰字說明（適用待辦數量等非成長型指標） */
  variant?: "growth" | "neutral";
};

export function KpiCard({ title, value, trend, trendLabel = "較上月", variant = "growth" }: Props) {
  const trendCls = variant === "neutral" ? "font-medium text-[#6B7280]" : "font-semibold text-[#22C55E]";
  return (
    <div className="rounded-3xl border border-[#E5E7EB]/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
      <p className="text-sm font-medium text-[#6B7280]">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#1F2937] md:text-3xl">{value}</p>
      {trend != null && trend !== "" ? (
        <p className={`mt-2 text-xs ${trendCls}`}>
          {trend} {trendLabel}
        </p>
      ) : null}
    </div>
  );
}
