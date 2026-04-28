"use client";

import { Button } from "../ui/Button";

type Props = {
  onExplore?: () => void;
};

export function HeroExplore({ onExplore }: Props) {
  return (
    <section className="rounded-3xl border border-[#E5E7EB]/60 bg-gradient-to-r from-[#EDE9FE] via-white to-[#F4F1FF] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="max-w-xl space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-[#1F2937] sm:text-3xl md:text-[2rem] md:leading-tight">
            探索適合你的教材
          </h1>
          <p className="text-sm leading-relaxed text-[#6B7280] sm:text-base">豐富您的教學，提升無限可能</p>
          <div className="pt-1">
            <Button type="button" intent="flow" onClick={onExplore}>
              立即探索
            </Button>
          </div>
        </div>
        <div
          className="flex min-h-[160px] flex-1 items-center justify-center rounded-3xl border border-white/80 bg-gradient-to-br from-[#EDE9FE] to-[#F4F1FF] shadow-inner md:max-w-sm"
          role="img"
          aria-label="教材與學習插畫"
        >
          <div className="flex items-end gap-2 text-6xl md:text-7xl">
            <span aria-hidden>📖</span>
            <span className="pb-2 text-4xl md:text-5xl" aria-hidden>
              ⭐
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
