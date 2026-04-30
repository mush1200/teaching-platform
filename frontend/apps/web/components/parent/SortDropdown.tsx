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
};

export function SortDropdown({ value, onChange, id = "explore-sort" }: Props) {
  return (
    <div className="min-w-[140px]">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-[#6B7280]">
        排序
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as MaterialsSort)}
        className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#1F2937] shadow-sm focus:border-[#6C63FF] focus:outline-none focus:ring-1 focus:ring-[#6C63FF]"
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
