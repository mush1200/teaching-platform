import type { MockAdminStats } from "../../lib/mock-data";

type Props = {
  segments: MockAdminStats["orderStatusDonut"];
};

export function OrderStatusDonutPlaceholder({ segments }: Props) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB]/80 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-[#1F2937]">訂單狀態</h2>
      <p className="mt-1 text-xs text-[#6B7280]">圖表 placeholder（mock 比例）</p>
      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div
          className="flex h-44 w-44 items-center justify-center rounded-full border-4 border-dashed border-[#E5E7EB] bg-[#FAFAFF] text-center text-xs leading-snug text-[#9CA3AF]"
          role="img"
          aria-label="圓餅圖預留區"
        >
          Donut
          <br />
          chart
        </div>
        <ul className="flex w-full max-w-xs flex-col gap-3 text-sm">
          {segments.map((s) => (
            <li key={s.label}>
              <div className="mb-1 flex justify-between text-xs font-medium text-[#6B7280]">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="text-[#1F2937]">{s.value}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
                <div className="h-full rounded-full" style={{ width: `${s.value}%`, backgroundColor: s.color }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
