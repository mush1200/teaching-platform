import Link from "next/link";

const ctaCls =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-intent-flow)] px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-button-flow)] transition-colors hover:bg-[var(--color-brand-cta-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C63FF]";

export function Hero() {
  return (
    <section className="rounded-2xl border border-[#E5E7EB]/60 bg-gradient-to-r from-[#EDE9FE]/90 via-white to-[#F4F1FF] p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="max-w-xl space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-[#1F2937] sm:text-2xl">探索適合你的教材</h1>
          <p className="text-sm leading-relaxed text-[#6B7280]">為你的教學與學習提供靈感</p>
          <div className="pt-1">
            <Link href="/explore" className={ctaCls}>
              立即探索
            </Link>
          </div>
        </div>
        <div
          className="flex min-h-[96px] shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-br from-[#EDE9FE]/80 to-[#F4F1FF] px-8 py-4 shadow-inner sm:min-h-[100px] md:px-10"
          role="img"
          aria-hidden
        >
          <span className="text-4xl sm:text-5xl">📚</span>
        </div>
      </div>
    </section>
  );
}
