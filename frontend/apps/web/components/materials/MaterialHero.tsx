import { Button } from "../ui/Button";

type Props = {
  onExplore?: () => void;
};

export function MaterialHero({ onExplore }: Props) {
  return (
    <section className="rounded-3xl border border-[#E5E7EB]/60 bg-gradient-to-r from-[#EDE9FE] to-[#F4F1FF] p-5 shadow-[0_12px_40px_rgba(108,99,255,0.08)] sm:p-6 md:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-lg space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-[#1F2937] sm:text-3xl">探索優質教材</h2>
          <p className="text-sm leading-relaxed text-[#6B7280] sm:text-base">豐富您的教學，提升無限可能</p>
          <div className="pt-2">
            <Button type="button" intent="flow" onClick={onExplore}>
              立即探索
            </Button>
          </div>
        </div>
        <div
          className="flex h-36 w-full shrink-0 items-center justify-center rounded-3xl border border-white/70 bg-white/50 text-5xl text-[#6B7280] shadow-inner md:h-40 md:w-52"
          role="img"
          aria-label="插畫預留區"
        >
          🌟
        </div>
      </div>
    </section>
  );
}
