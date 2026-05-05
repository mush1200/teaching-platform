"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { IconCart, IconMenu, IconSearch } from "../ui/icons";

type Props = {
  title?: string;
  /** When set, shows back link instead of hamburger */
  backHref?: string;
  /** Hide leading nav affordance for conversion-focused pages */
  leading?: "auto" | "none";
  right?: "search-cart" | "edit" | "none";
  /** Extra actions on the right (e.g. 寫評論) */
  trailing?: ReactNode;
  onMenuClick?: () => void;
};

export function MobileHeader({
  title = "EduMarket",
  backHref,
  leading = "auto",
  right = "search-cart",
  trailing,
  onMenuClick,
}: Props) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-[#E5E7EB]/80 bg-white/90 backdrop-blur"
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leading === "none" ? <div className="size-10 shrink-0" aria-hidden /> : null}
          {leading !== "none" && backHref ? (
            <Link
              href={backHref}
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-[#1F2937] hover:bg-[#F4F1FF]"
              aria-label="返回"
            >
              ←
            </Link>
          ) : null}
          {leading !== "none" && !backHref ? (
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-[#1F2937] hover:bg-[#F4F1FF]"
              aria-label="選單"
              onClick={onMenuClick}
            >
              <IconMenu />
            </button>
          ) : null}
          {backHref || leading === "none" ? (
            <span className="flex-1 truncate text-base font-bold text-[#1F2937]">{title}</span>
          ) : (
            <Link href="/materials" className="truncate text-center text-base font-bold text-[#1F2937]">
              {title}
            </Link>
          )}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
        {right === "search-cart" ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-2xl text-[#6B7280] hover:bg-[#F4F1FF] hover:text-[#6C63FF]"
              aria-label="搜尋"
            >
              <IconSearch />
            </button>
            <Link
              href="/cart"
              className="flex size-10 items-center justify-center rounded-2xl text-[#6B7280] hover:bg-[#F4F1FF] hover:text-[#6C63FF]"
              aria-label="購物車"
            >
              <IconCart />
            </Link>
          </div>
        ) : right === "edit" ? (
          <button type="button" className="text-sm font-semibold text-[#6C63FF]">
            編輯
          </button>
        ) : null}
      </div>
    </header>
  );
}
