"use client";

export type CategoryTabItem = {
  id: string;
  label: string;
  emoji?: string;
};

type Props = {
  tabs: CategoryTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function CategoryTabs({ tabs, activeId, onSelect }: Props) {
  return (
    <div className="w-full">
      <h2 className="mb-3 text-lg font-bold text-[#1F2937]">熱門分類</h2>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[#6C63FF] bg-[#EDE9FE] text-[#6C63FF] shadow-sm"
                  : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#6C63FF]/40 hover:bg-[#FAFAFF]"
              }`}
            >
              {tab.emoji ? <span aria-hidden>{tab.emoji}</span> : null}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
