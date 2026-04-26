type Props = {
  title: string;
  value: string;
  trend: string;
};

export function KpiCard({ title, value, trend }: Props) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB]/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
      <p className="text-sm font-medium text-[#6B7280]">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#1F2937] md:text-3xl">{value}</p>
      <p className="mt-2 text-xs font-semibold text-[#22C55E]">{trend} 較上月</p>
    </div>
  );
}
