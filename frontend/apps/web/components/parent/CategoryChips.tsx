export const EXPLORE_CATEGORY_OPTIONS = [
  { id: "all", label: "全部" },
  { id: "language", label: "語言" },
  { id: "math", label: "數學" },
  { id: "science", label: "科學" },
  { id: "art", label: "藝術" },
] as const;

type Props = {
  activeId: string;
  onSelect: (id: string) => void;
};

export function CategoryChips({ activeId, onSelect }: Props) {
  return (
    <div className="flex flex-nowrap gap-2 whitespace-nowrap" role="tablist" aria-label="教材分類">
      {EXPLORE_CATEGORY_OPTIONS.map((c) => {
        const active = activeId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={[
              "rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
              active
                ? "border-[#6C63FF] bg-[#EDE9FE] text-[#6C63FF] shadow-sm"
                : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#6C63FF]/40 hover:bg-[#FAF8FF]",
            ].join(" ")}
            onClick={() => onSelect(c.id)}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
