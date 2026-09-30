"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

type Props = {
  onMenuClick: () => void;
  cartBadge?: number;
  /** `UI-CONS-23`：抽屜關閉後焦點要還回這顆觸發鈕。 */
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  /** 對應 `NavDrawer` 面板的 `id`，供 `aria-controls`。 */
  drawerId?: string;
  drawerOpen?: boolean;
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

export function Topbar({ onMenuClick, cartBadge = 2, menuButtonRef, drawerId, drawerOpen = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /*
   * `UI-REV-F`（2026-09-30）：先前這裡把關鍵字寫進目前路徑的 `?q=` —— 但買家頁面**沒有任何地方讀 `q`**
   * （`/explore` 的 `ExplorePage` 讀的是 `?search=`，與公開 `/materials` 同一個契約），
   * 所以按 Enter 之後網址變了、清單卻完全不變。
   *
   * 現在收斂到教材清單唯一的搜尋契約 `?search=`：
   *   - 在 `/explore`：保留其他篩選、回到第 1 頁，就地更新清單；
   *   - 在其他買家頁（例如 `/dashboard`，它沒有搜尋結果區）：**導向** `/explore?search=…`，
   *     不假裝在一個不會過濾的頁面上過濾；
   *   - 空字串：在 `/explore` 清除關鍵字，其他頁不導向。
   * 一律 `push`（不是 `replace`），瀏覽器「上一頁」會回到搜尋前的狀態。
   * Admin／Creator 列表的 `?q=`（`lib/useListQueryState.ts`）是另一組 API 的契約，不在這個外殼裡，不受影響。
   */
  const onExplore = pathname === "/explore";
  const [q, setQ] = useState(onExplore ? searchParams.get("search") ?? "" : "");

  useEffect(() => {
    setQ(onExplore ? searchParams.get("search") ?? "" : "");
  }, [onExplore, searchParams]);

  const pushQuery = useCallback(
    (nextQ: string) => {
      const keyword = nextQ.trim();
      if (onExplore) {
        const params = new URLSearchParams(searchParams.toString());
        if (keyword) params.set("search", keyword);
        else params.delete("search");
        params.delete("page");
        const qs = params.toString();
        router.push(qs ? `/explore?${qs}` : "/explore", { scroll: false });
        return;
      }
      if (!keyword) return;
      router.push(`/explore?${new URLSearchParams({ search: keyword }).toString()}`);
    },
    [onExplore, router, searchParams],
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#E5E7EB]/80 bg-white/95 px-4 backdrop-blur md:gap-4 md:px-6">
      {/*
        `UI-CONS-05`：觸發鈕的可見範圍必須與側欄互補 —— 側欄是 `lg:block`，
        所以觸發鈕是 `lg:hidden`。原本是 `md:hidden`，於是 768–1023 既有常駐側欄、
        又沒有觸發鈕，與 Admin／Creator 不一致。
        `UI-CONS-18`：導覽觸發鈕的觸控目標由 40×40（`p-2` ＋ 24px icon）補到 **44×44**。
        `UI-CONS-23`：補上 `aria-expanded` / `aria-controls`，與 Admin／Creator 的觸發鈕一致。
      */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onMenuClick}
        aria-expanded={drawerOpen}
        aria-controls={drawerId}
        data-testid="nav-drawer-trigger"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#1F2937] hover:bg-[#F4F1FF] lg:hidden"
        aria-label="開啟選單"
      >
        <MenuIcon />
      </button>

      <div className="flex min-w-0 flex-1 justify-center md:justify-start">
        {/*
          `UI-REV-F`：以 `<form role="search">` 的 submit 取代 `onKeyDown` Enter ——
          中文輸入法選字時的 Enter 不會送出表單，先前的 keydown 會在選字途中就以半截字串搜尋。
        */}
        <form
          role="search"
          aria-label="搜尋教材"
          onSubmit={(e) => {
            e.preventDefault();
            pushQuery(q);
          }}
          className="relative mx-auto w-full max-w-2xl md:mx-0"
        >
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ds-textSubtle" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            aria-label="搜尋教材"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋教材、主題、年齡..."
            className="w-full rounded-full border border-ds-borderControl bg-[#FAFAFA] py-2 pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-ds-textSubtle transition focus:border-edu-primary/40 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
          />
        </form>
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
        {/* `UI-CONS-18`：頂欄的導覽目標同樣補到 44×44。 */}
        <Link
          href="/cart"
          className="relative flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-[#F4F1FF]"
          aria-label="購物車"
        >
          <CartIcon />
          {cartBadge > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-commerce-badgePurchase px-1 text-[10px] font-bold text-commerce-badgePurchaseText">
              {cartBadge > 99 ? "99+" : cartBadge}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}
