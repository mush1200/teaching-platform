"use client";

import type { MockCartItem } from "../../lib/view-models";
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
      {/*
        `UI-REV-A` 同批（2026-09-29 Linux 基準審閱時發現，既有缺陷）：`sm` 以下這一列同時放價格、數量（44＋44）與刪除（44），
        標題欄被擠到只剩一個字（「幺」）。`sm` 以下改為三列：標題與適用年齡各佔整列，價格／數量／刪除在第三列；`sm` 以上不變。
        注意：`sm:col-span-1` 是 `grid-column` 簡寫，會把起點重設為 auto —— 因此 `sm:` 必須再寫一次 `col-start-*`。
      */}
      <div className="grid grid-cols-[16px_52px_minmax(0,1fr)_auto_auto_32px] grid-rows-[auto_auto_auto] items-center gap-x-2 gap-y-1 sm:grid-rows-[auto_auto]">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          className="row-span-3 size-4 shrink-0 sm:row-span-2 rounded border-[#D1D5DB] text-ds-textAccent focus:ring-edu-primary/30"
          aria-label={`選取 ${item.title}`}
        />
        <div
          className={`row-span-3 flex h-12 w-12 sm:row-span-2 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.coverGradient}`}
          aria-hidden
        >
          <span className="text-[10px] font-semibold text-white/85">教材</span>
        </div>

        <p className="col-span-4 col-start-3 truncate text-base font-semibold leading-tight text-[#1F2937] sm:col-span-1 sm:col-start-3">{item.title}</p>
        <p className="col-span-4 col-start-3 row-start-2 truncate text-[12.5px] leading-[1.15] text-ds-textSubtle sm:col-span-1 sm:col-start-3">{item.ageLabel}</p>

        <span className="col-start-3 row-start-3 whitespace-nowrap text-base font-bold text-commerce-price sm:col-start-4 sm:row-start-2">NT${subtotal.toLocaleString()}</span>
        <div className="col-span-2 col-start-4 row-start-3 flex items-center justify-end gap-1.5 sm:col-span-1 sm:col-start-5 sm:row-start-2 sm:justify-start">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-base font-medium text-ds-textMuted transition-all duration-150 hover:border-[#D8D2FF] hover:bg-[#F4F1FF] hover:text-[#5B52E6]"
            onClick={() => onQtyChange(item.id, Math.max(1, item.quantity - 1))}
            aria-label="減少數量"
          >
            −
          </button>
          <span className="min-w-[1.25rem] text-center text-sm font-semibold text-[#1F2937]">{item.quantity}</span>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-base font-medium text-ds-textMuted transition-all duration-150 hover:border-[#D8D2FF] hover:bg-[#F4F1FF] hover:text-[#5B52E6]"
            onClick={() => onQtyChange(item.id, item.quantity + 1)}
            aria-label="增加數量"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="col-start-6 row-start-3 flex size-11 sm:row-start-2 items-center justify-center rounded-full border border-transparent bg-transparent text-ds-textMuted transition-all duration-150 hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
          aria-label={`刪除 ${item.title}`}
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
