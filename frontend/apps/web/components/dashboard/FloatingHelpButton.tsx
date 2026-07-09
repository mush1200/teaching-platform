"use client";

import { CircleHelp } from "lucide-react";
import { SIDEBAR_ICON_STROKE } from "./sidebar-nav-config";

type Props = {
  onNavigate?: () => void;
};

export function FloatingHelpButton({ onNavigate }: Props) {
  return (
    <a
      href="#help"
      onClick={onNavigate}
      className="fixed bottom-6 right-6 z-30 flex size-12 items-center justify-center rounded-full border border-black/[0.06] bg-white/95 text-edu-primary shadow-[0_4px_20px_rgba(15,23,42,0.08)] backdrop-blur-md transition-[background-color,box-shadow,transform] duration-200 hover:bg-[#F8F5FF] hover:shadow-[0_6px_24px_rgba(108,99,255,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edu-primary md:bottom-8 md:right-8"
      aria-label="幫助中心"
      title="幫助中心"
    >
      <CircleHelp className="size-5" strokeWidth={SIDEBAR_ICON_STROKE} aria-hidden />
    </a>
  );
}
