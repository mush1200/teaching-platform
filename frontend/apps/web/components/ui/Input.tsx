import type { InputHTMLAttributes, ReactNode } from "react";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  id: string;
  error?: string;
  rightSlot?: ReactNode;
  inputClassName?: string;
};

export function Input({ label, id, error, rightSlot, inputClassName = "", ...rest }: InputProps) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[#1F2937]">
        {label}
      </label>
      <div className="relative flex items-stretch">
        <input
          id={id}
          className={`w-full rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] transition-shadow focus:border-[#6C63FF]/50 focus:bg-white focus:shadow-[0_0_0_3px_rgba(108,99,255,0.12)] focus:outline-none ${rightSlot ? "pr-12" : ""} ${inputClassName}`.trim()}
          {...rest}
        />
        {rightSlot ? (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">{rightSlot}</div>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[#EF4444]">{error}</p> : null}
    </div>
  );
}
