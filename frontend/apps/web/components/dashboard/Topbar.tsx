"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = {
  onMenuClick: () => void;
  cartBadge?: number;
};

function MenuIcon() {
  return (
    <svg className="size-6 text-[#1F2937]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg className="size-6 text-[#1F2937]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l1 12h12l2-9H7" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Topbar({ onMenuClick, cartBadge = 2 }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  const pushQuery = useCallback(
    (nextQ: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQ.trim()) params.set("q", nextQ.trim());
      else params.delete("q");
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#E5E7EB]/80 bg-white/95 px-4 backdrop-blur md:gap-4 md:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-xl p-2 text-[#1F2937] hover:bg-[#F4F1FF] md:hidden"
        aria-label="開啟選單"
      >
        <MenuIcon />
      </button>

      <div className="flex min-w-0 flex-1 justify-center md:justify-start">
        <label className="relative mx-auto w-full max-w-2xl md:mx-0">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pushQuery(q);
            }}
            placeholder="搜尋教材、主題、年齡..."
            className="w-full rounded-full border border-[#E5E7EB] bg-[#FAFAFA] py-2 pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] transition focus:border-[#6C63FF]/40 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
          />
        </label>
      </div>

      {/*
        通知按鈕與未讀紅點已移除（`BUY-06` / `DEC-12`，2026-08-28）。

        那顆按鈕**沒有 `onClick`**，而紅點在視覺語彙上等於「你有未讀通知」—— 但平台
        沒有通知系統（`Backend/services/emailService.js` 明載不打算建 notification center），
        所以那個紅點永遠不可能為真、也永遠不會消失。它比單純點了沒反應更糟：
        它**主動宣稱一個假事實**。`BUY-04` 已把導覽的「通知設定」移除，這是同一件事的另一半。

        **不得**為了補這個位置新增 dropdown、notification center、preference system，
        也不得留下 disabled 按鈕或空的 icon 槽 —— 那些都只是把假承諾換個樣子留著。
        移除後這一區只剩購物車，`gap` 仍由 flex 容器維持，不需要補位元素。
      */}
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <Link href="/cart" className="relative rounded-xl p-2 hover:bg-[#F4F1FF]" aria-label="購物車">
          <CartIcon />
          {cartBadge > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-[#FF6B73] px-1 text-[10px] font-bold text-white">
              {cartBadge > 99 ? "99+" : cartBadge}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}
