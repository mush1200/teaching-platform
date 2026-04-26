import type { InputHTMLAttributes, ReactNode } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: ReactNode;
};

export function Checkbox({ id, label, ...rest }: CheckboxProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-[#4B5563]">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-[#E5E7EB] text-[#6C63FF] focus:ring-[#6C63FF]/30"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}
