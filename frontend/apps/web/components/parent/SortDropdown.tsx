import type { MaterialsSort } from "../../lib/materials-query";

const OPTIONS: { value: MaterialsSort; label: string }[] = [
  { value: "popular", label: "熱門" },
  { value: "latest", label: "最新" },
  { value: "rating", label: "評分" },
];

type Props = {
  value: MaterialsSort;
  onChange: (v: MaterialsSort) => void;
  id?: string;
  compact?: boolean;
};

export function SortDropdown({ value, onChange, id = "explore-sort", compact = false }: Props) {
  return (
    <div className={compact ? "min-w-[120px]" : "min-w-[140px]"}>
      {!compact ? (
        <label htmlFor={id} className="mb-1 block text-xs font-semibold text-[#6B7280]">
          排序
        </label>
      ) : null}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as MaterialsSort)}
        aria-label={compact ? "排序" : undefined}
        className={[
          "w-full rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium text-[#1F2937] shadow-sm focus:border-[#6C63FF] focus:outline-none focus:ring-1 focus:ring-[#6C63FF]",
          compact ? "h-[42px] px-3 py-0" : "px-3 py-2",
        ].join(" ")}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
