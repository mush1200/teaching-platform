import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  children: ReactNode;
  illustrationSide: "login" | "register";
};

export function AuthSplitLayout({ children, illustrationSide }: Props) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-[#FAF8FF] to-[#FFF8EF] font-sans text-[#1F2937] antialiased">
      <div className="mx-auto grid min-h-dvh max-w-7xl md:grid-cols-2">
        <div className="flex items-center px-5 py-10 sm:px-10">
          <div className="mx-auto flex w-full max-w-md flex-col gap-6">{children}</div>
        </div>
        <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-[#ECE8FF] via-[#EDE9FE] to-[#F4F1FF] p-10 md:flex">
          <div className="w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-10 text-center shadow-[0_20px_60px_rgba(108,99,255,0.12)]">
            <p className="text-sm font-semibold uppercase tracking-widest text-[#6C63FF]">EduMarket</p>
            <div className="mt-6 text-7xl" role="img" aria-label="教育平台插畫">
              {illustrationSide === "login" ? "📚" : "🎓"}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-[#6B7280]">
              {illustrationSide === "login" ? "陪伴每位使用者，快速找到最適合孩子的學習教材。" : "建立教材、追蹤營運、持續優化教學成果。"}
            </p>
            <Link href="/materials" className="mt-5 inline-block text-sm font-semibold text-[#6C63FF] hover:underline">
              先逛逛教材
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
