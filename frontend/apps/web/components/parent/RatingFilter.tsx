type Props = {
  minRating4: boolean;
  onChange: (v: boolean) => void;
};

export function RatingFilter({ minRating4, onChange }: Props) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#1F2937] shadow-sm">
      <input
        type="checkbox"
        checked={minRating4}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-[#D1D5DB] text-[#6C63FF] focus:ring-[#6C63FF]"
      />
      <span>4 星以上</span>
    </label>
  );
}
