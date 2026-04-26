import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  children: ReactNode;
  illustrationSide: "login" | "register";
};

export function AuthSplitLayout({ children, illustrationSide }: Props) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#EDE9FE] font-sans text-[#1F2937] antialiased">
      <div className="mx-auto grid min-h-dvh max-w-6xl md:grid-cols-2">
        <div className="flex flex-col justify-center px-5 py-10 sm:px-10">{children}</div>
        <div className="relative hidden overflow-hidden rounded-bl-[3rem] md:block">
          <div className="absolute inset-0 bg-gradient-to-br from-[#E8E4FF] to-[#DDD6FE]" />
          <div className="relative flex h-full flex-col items-center justify-center gap-4 p-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-[#6C63FF]">EduMarket</p>
            <div
              className={`flex h-64 w-64 max-w-full items-center justify-center rounded-3xl border border-white/60 bg-white/40 text-[#6B7280] shadow-[0_20px_60px_rgba(108,99,255,0.12)] ${
                illustrationSide === "login" ? "text-6xl" : "text-6xl"
              }`}
              role="img"
              aria-label="插畫預留區"
            >
              {illustrationSide === "login" ? "📚" : "🎓"}
            </div>
            <p className="max-w-xs text-sm text-[#6B7280]">
              {illustrationSide === "login"
                ? "插畫 placeholder：未來可替換為品牌插畫或攝影。"
                : "插畫 placeholder：老師與學生互動情境。"}
            </p>
            <Link href="/materials" className="text-sm font-medium text-[#6C63FF] underline-offset-4 hover:underline">
              先逛逛教材
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
