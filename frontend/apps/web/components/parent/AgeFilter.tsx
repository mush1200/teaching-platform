const OPTIONS = [
  { value: "", label: "年齡不限" },
  { value: "3-6", label: "3–6 歲" },
  { value: "6-8", label: "6–8 歲" },
  { value: "7-9", label: "7–9 歲" },
  { value: "8-12", label: "8–12 歲" },
  { value: "10-14", label: "10–14 歲" },
] as const;

type Props = {
  value: string;
  onChange: (age: string) => void;
  id?: string;
};

export function AgeFilter({ value, onChange, id = "filter-age" }: Props) {
  return (
    <div className="min-w-[140px]">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-[#6B7280]">
        年齡
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#1F2937] shadow-sm focus-visible:border-ds-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
      >
        {OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
