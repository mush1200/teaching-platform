"use client";

import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { IconCart, IconMenu, IconSearch } from "../ui/icons";

type Props = {
  title?: string;
  /** When set, shows back link instead of hamburger */
  backHref?: string;
  /** Hide leading nav affordance for conversion-focused pages */
  leading?: "auto" | "none";
  right?: "search-cart" | "edit" | "none";
  /** Extra actions on the right (e.g. 分享教學回饋) */
  trailing?: ReactNode;
  onMenuClick?: () => void;
  /**
   * 選單鈕改為開啟**外殼的 canonical 抽屜**（`RoleShell` 的 `NavDrawer`），而不是頁面自己的抽屜
   * （`UI-REV-E` 方案 B，2026-09-30）。給了這個值，這顆按鈕就是外殼抽屜的觸發鈕：
   * 同樣的 testid、aria 與焦點歸還目標。`hideAtDesktop`：`lg` 以上外殼有常駐側欄、抽屜不存在，
   * 觸發鈕在那裡會是點了沒反應的按鈕，所以隱藏。
   */
  shellMenu?: {
    onOpen: () => void;
    expanded: boolean;
    controls: string;
    triggerRef: RefObject<HTMLButtonElement | null>;
    label: string;
    hideAtDesktop?: boolean;
  };
  /**
   * 搜尋鈕的行為。**沒有給就不渲染搜尋鈕** —— 先前它在所有使用處都沒有 handler，
   * 是點了沒反應的 dead control（`UI-REV-E`）。
   */
  search?: { onToggle: () => void; expanded: boolean; controls: string };
};

/*
 * `UI-CONS-18`（Wave UI-6，navigation subset）：本檔的導覽觸發鈕（返回／選單／搜尋）
 * 與對稱佔位由 40×40 補到 **44×44**，與 `shell-constants.NAV_ICON_BUTTON_CLASS`
 * 及 Admin／Creator 的 hamburger 一致。
 * **只動導覽 chrome** —— FilterTabs／分頁／表格動作／創作者表單控制項仍留在
 * `UI-CONS-18` 後續，本輪不碰。
 */
export function MobileHeader({
  title = "EduMarket",
  backHref,
  leading = "auto",
  right = "search-cart",
  trailing,
  onMenuClick,
  shellMenu,
  search,
}: Props) {
  return (
    /*
     * `z-30` 與外殼的 `MobileNavBar`／買家 `Topbar` 同層：外殼抽屜的遮罩是 `z-40`，
     * 頂欄必須被它蓋住（先前 `z-40` 且 DOM 在遮罩之後，抽屜打開時頂欄仍浮在遮罩上）。
     */
    <header
      className="sticky top-0 z-30 border-b border-[#E5E7EB]/80 bg-white/90 backdrop-blur"
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leading === "none" ? <div className="size-11 shrink-0" aria-hidden /> : null}
          {leading !== "none" && backHref ? (
            <Link
              href={backHref}
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#1F2937] hover:bg-[#F4F1FF]"
              aria-label="返回"
            >
              ←
            </Link>
          ) : null}
          {leading !== "none" && !backHref && shellMenu ? (
            <button
              ref={shellMenu.triggerRef}
              type="button"
              className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#1F2937] hover:bg-[#F4F1FF] ${
                shellMenu.hideAtDesktop ? "lg:hidden" : ""
              }`.trim()}
              aria-label={shellMenu.label}
              aria-expanded={shellMenu.expanded}
              aria-controls={shellMenu.controls}
              data-testid="nav-drawer-trigger"
              onClick={shellMenu.onOpen}
            >
              <IconMenu />
            </button>
          ) : null}
          {leading !== "none" && !backHref && !shellMenu ? (
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#1F2937] hover:bg-[#F4F1FF]"
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
            {search ? (
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-2xl text-ds-textMuted hover:bg-[#F4F1FF] hover:text-ds-textAccent"
                aria-label="搜尋教材"
                aria-expanded={search.expanded}
                aria-controls={search.controls}
                onClick={search.onToggle}
              >
                <IconSearch />
              </button>
            ) : null}
            <Link
              href="/cart"
              className="flex size-11 items-center justify-center rounded-2xl text-ds-textMuted hover:bg-[#F4F1FF] hover:text-ds-textAccent"
              aria-label="購物車"
            >
              <IconCart />
            </Link>
          </div>
        ) : right === "edit" ? (
          <button type="button" className="text-sm font-semibold text-ds-textAccent">
            編輯
          </button>
        ) : null}
      </div>
    </header>
  );
}
