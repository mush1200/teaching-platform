import { useId } from "react";

export type PriceMode = "any" | "free" | "paid" | "custom";

type Props = {
  mode: PriceMode;
  onModeChange: (m: PriceMode) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (v: string) => void;
  onPriceMaxChange: (v: string) => void;
};

export function PriceFilter({ mode, onModeChange, priceMin, priceMax, onPriceMinChange, onPriceMaxChange }: Props) {
  const baseId = useId();
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#6B7280]">價格</p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["any", "不限"],
            ["free", "免費"],
            ["paid", "付費"],
            ["custom", "範圍"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={[
              "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
              mode === k
                ? "border-[#6C63FF] bg-[#EDE9FE] text-[#6C63FF]"
                : "border-[#E5E7EB] bg-white text-[#4B5563] hover:bg-[#FAF8FF]",
            ].join(" ")}
            onClick={() => onModeChange(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="sr-only" htmlFor={`${baseId}-min`}>
              最低價格
            </label>
            <input
              id={`${baseId}-min`}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="最低"
              value={priceMin}
              onChange={(e) => onPriceMinChange(e.target.value)}
              className="w-24 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-sm"
            />
          </div>
          <span className="text-[#9CA3AF]">—</span>
          <div>
            <label className="sr-only" htmlFor={`${baseId}-max`}>
              最高價格
            </label>
            <input
              id={`${baseId}-max`}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="最高"
              value={priceMax}
              onChange={(e) => onPriceMaxChange(e.target.value)}
              className="w-24 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
