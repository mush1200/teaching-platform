"use client";

import type { MockCartItem } from "../../lib/mock-data";
import { IconTrash } from "../ui/icons";

type Props = {
  item: MockCartItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onQtyChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
};

export function CartItem({ item, selected, onToggle, onQtyChange, onRemove }: Props) {
  const subtotal = item.price * item.quantity;

  return (
    <div className="min-h-[106px] rounded-xl border border-[#E5E7EB]/80 bg-white p-4 shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-[1px] hover:border-[#DDD6FE] hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
      <div className="grid grid-cols-[16px_52px_minmax(0,1fr)_auto_auto_32px] grid-rows-[auto_auto] items-center gap-x-2 gap-y-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          className="row-span-2 size-4 shrink-0 rounded border-[#D1D5DB] text-[#6C63FF] focus:ring-[#6C63FF]/30"
          aria-label={`選取 ${item.title}`}
        />
        <div
          className={`row-span-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.coverGradient}`}
          aria-hidden
        >
          <span className="text-[10px] font-semibold text-white/85">教材</span>
        </div>

        <p className="col-start-3 truncate text-base font-semibold leading-tight text-[#1F2937]">{item.title}</p>
        <p className="col-start-3 row-start-2 truncate text-[12.5px] leading-[1.15] text-[#9CA3AF]">{item.ageLabel}</p>

        <span className="col-start-4 row-start-2 whitespace-nowrap text-base font-bold text-[#1F2937]">NT${subtotal.toLocaleString()}</span>
        <div className="col-start-5 row-start-2 flex items-center gap-1.5">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-base font-medium text-[#6B7280] transition-all duration-150 hover:border-[#D8D2FF] hover:bg-[#F4F1FF] hover:text-[#5B52E6]"
            onClick={() => onQtyChange(item.id, Math.max(1, item.quantity - 1))}
            aria-label="減少數量"
          >
            −
          </button>
          <span className="min-w-[1.25rem] text-center text-sm font-semibold text-[#1F2937]">{item.quantity}</span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-base font-medium text-[#6B7280] transition-all duration-150 hover:border-[#D8D2FF] hover:bg-[#F4F1FF] hover:text-[#5B52E6]"
            onClick={() => onQtyChange(item.id, item.quantity + 1)}
            aria-label="增加數量"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="col-start-6 row-start-2 mr-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-transparent text-[#B9C0CB] transition-all duration-150 hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
          aria-label={`刪除 ${item.title}`}
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
