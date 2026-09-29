type Props = {
  label: string;
  emoji: string;
  active?: boolean;
  onClick?: () => void;
};

export function CategoryIcon({ label, emoji, active, onClick }: Props) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex min-w-[4.5rem] flex-col items-center gap-1.5 rounded-2xl border px-3 py-2 text-center transition-colors ${
        active
          ? "border-edu-primary bg-white shadow-[0_6px_20px_rgba(92,78,234,0.15)]"
          : "border-transparent bg-white/60 hover:border-[#E5E7EB] hover:bg-white"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="text-[11px] font-medium leading-tight text-[#4B5563]">{label}</span>
    </Comp>
  );
}
