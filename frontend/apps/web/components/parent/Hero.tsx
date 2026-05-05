import Link from "next/link";

/** 輕量 Hero：marketplace 輔助入口，max-height 190px */
export function Hero() {
  return (
    <section
      className="max-h-[174px] overflow-hidden rounded-[20px] border border-[#F2F0FF]/70 bg-gradient-to-r from-[#FBFAFF] via-white to-[#FEFDFF] px-7 py-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      aria-labelledby="home-hero-title"
    >
      <div className="flex h-full min-h-0 items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
            <h1
              id="home-hero-title"
              className="text-[24px] font-extrabold leading-[1.15] tracking-tight text-[#1F2937]/85 sm:text-[25px] md:text-[26px]"
            >
              探索適合你的教材
            </h1>
            <p className="text-[14px] font-normal leading-tight text-[#9CA3AF] sm:text-[15px]">為你的教學與學習提供靈感</p>
          </div>
          <div className="pt-0">
            <Link
              href="/explore"
              className="inline-flex h-8 items-center justify-center rounded-xl bg-[#FF6B73] px-3.5 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(240,85,96,0.18)] transition hover:bg-[#f05560] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B73]"
            >
              立即探索
            </Link>
          </div>
        </div>
        {/* 1600+ 才顯示，避免 1440 首屏與卡片爭奪空間 */}
        <div
          className="hidden min-[1600px]:flex size-20 shrink-0 items-center justify-center opacity-[0.76]"
          role="img"
          aria-hidden
        >
          <span className="select-none text-[80px] leading-none">📚</span>
        </div>
      </div>
    </section>
  );
}
