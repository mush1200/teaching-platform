"use client";

import type { MockCartItem } from "../../lib/mock-data";

type Props = {
  item: MockCartItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onQtyChange: (id: string, qty: number) => void;
};

export function CartItem({ item, selected, onToggle, onQtyChange }: Props) {
  return (
    <div className="flex gap-3 rounded-3xl border border-[#E5E7EB]/80 bg-white p-4 shadow-sm">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item.id)}
        className="mt-2 size-4 shrink-0 rounded border-[#E5E7EB] text-[#6C63FF]"
        aria-label={`選取 ${item.title}`}
      />
      <div className={`h-20 w-20 shrink-0 rounded-2xl bg-gradient-to-br ${item.coverGradient}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[#1F2937]">{item.title}</p>
        <p className="mt-0.5 text-xs text-[#6B7280]">{item.ageLabel}</p>
        <p className="mt-2 text-sm font-bold text-[#1F2937]">NT${item.price}</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-xl border border-[#E5E7EB] text-lg font-medium text-[#6B7280] hover:bg-[#F4F1FF]"
            onClick={() => onQtyChange(item.id, Math.max(1, item.quantity - 1))}
            aria-label="減少數量"
          >
            −
          </button>
          <span className="min-w-[2ch] text-center text-sm font-semibold">{item.quantity}</span>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-xl border border-[#E5E7EB] text-lg font-medium text-[#6B7280] hover:bg-[#F4F1FF]"
            onClick={() => onQtyChange(item.id, item.quantity + 1)}
            aria-label="增加數量"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
