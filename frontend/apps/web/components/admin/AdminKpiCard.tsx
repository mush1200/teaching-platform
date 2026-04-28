"use client";

type Props = {
  label: string;
  value: string;
  subtext: string;
};

export function AdminKpiCard({ label, value, subtext }: Props) {
  return (
    <article className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-medium text-[#6B7280]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#1F2937]">{value}</p>
      <p className="mt-1 text-xs text-[#6B7280]">{subtext}</p>
    </article>
  );
}
