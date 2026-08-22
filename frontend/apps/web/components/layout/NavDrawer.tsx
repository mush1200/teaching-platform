"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconMenu } from "../ui/icons";
import {
  DRAWER_WIDTH_CLASS,
  NAV_ICON_BUTTON_CLASS,
  SIDEBAR_STATIC_CLASS,
} from "./shell-constants";

/**
 * 手機版側邊導覽的 **shared behaviour**（Epic §10 / §11）。
 *
 * ## 為什麼抽成 shared component
 *
 * Admin 與 Creator 原本各有一份 drawer，且行為不一樣：
 *
 * | | Admin (`AdminShell`) | Creator (`RoleShell`) |
 * | --- | --- | --- |
 * | 觸發 | hamburger icon | 文字「選單」／「關閉」 |
 * | ESC 關閉 | 有 | 無 |
 * | 背景 scroll lock | 有 | 無 |
 * | focus 管理 | 有 | 無 |
 * | 面板寬度 | 288px | 256px |
 * | 面板可捲動 | 可以 | **不行**（見下） |
 *
 * 這不是「把文字換成 icon」就能收斂的差異，所以行為整份搬到這裡。
 *
 * ## §11 的捲動根因
 *
 * Creator 的手機側欄是 `<aside class="fixed inset-y-0 w-64">`——**不是 flex 容器**。
 * 裡面的 `<nav class="flex flex-1 overflow-y-auto">` 因此拿不到高度約束：`flex-1`
 * 在非 flex 父層上完全沒有作用，`overflow-y-auto` 的容器高度等於內容高度，
 * 於是永遠不會出現捲軸，超出 100dvh 的選項直接落在視窗外且點不到。
 *
 * 這裡的面板是 `flex flex-col` + `inset-y-0`，並要求 children 用
 * `SIDEBAR_NAV_SCROLL_CLASS`（`min-h-0 flex-1 overflow-y-auto`）包住導覽區。
 * `min-h-0` 不可省略 —— flex item 的 `min-height: auto` 會讓它拒絕縮小。
 */

export type NavDrawerTriggerProps = {
  onOpen: () => void;
  expanded: boolean;
  /** 對應 drawer 面板的 `id`，供 `aria-controls`。 */
  controls: string;
  label?: string;
  className?: string;
};

/**
 * Hamburger 觸發鈕。Admin 與 Creator 使用**同一顆**按鈕：同樣的 icon、同樣的 44px
 * 觸控目標、同樣的 aria 屬性。
 */
export function NavDrawerTrigger({
  onOpen,
  expanded,
  controls,
  label = "開啟選單",
  className = "",
}: NavDrawerTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      data-testid="nav-drawer-trigger"
      className={`${NAV_ICON_BUTTON_CLASS} ${className}`.trim()}
    >
      <IconMenu />
    </button>
  );
}

export type NavDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** 面板的 `id`，必須與 trigger 的 `controls` 相同。 */
  id: string;
  ariaLabel: string;
  /** 抽屜頂部的品牌／區域 context（左側）；關閉鈕由本元件提供。 */
  header: ReactNode;
  /**
   * 導覽內容。**必須**自行套用 `SIDEBAR_NAV_SCROLL_CLASS` 於可捲動區，
   * 並讓固定區塊帶 `shrink-0`。
   */
  children: ReactNode;
  /** 觸發鈕的 ref；關閉後把焦點還回去。 */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
};

export function NavDrawer({
  open,
  onClose,
  id,
  ariaLabel,
  header,
  children,
  triggerRef,
}: NavDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    /*
     * 在 effect 內取值，避免 cleanup 讀到已變動的 ref（react-hooks/exhaustive-deps）。
     * scroll lock 記錄原值再還原 —— 直接寫死 `""` 會抹掉其他元件設定的 overflow。
     */
    const trigger = triggerRef?.current ?? null;
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClose}
        aria-label="關閉選單"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden"
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid="nav-drawer-panel"
        /*
         * `inset-y-0` + `flex flex-col` 是這個元件的重點：面板高度被鎖在視窗高度，
         * 內部的可捲動區才有東西可以「相對」地縮小。
         */
        className={`fixed inset-y-0 left-0 z-50 flex ${DRAWER_WIDTH_CLASS} flex-col bg-ds-surface shadow-ds-card-hover lg:hidden`}
      >
        <div
          className={`${SIDEBAR_STATIC_CLASS} flex items-center gap-3 border-b border-ds-borderMuted px-4 py-3`}
        >
          <div className="min-w-0 flex-1">{header}</div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            aria-label="關閉選單"
            data-testid="nav-drawer-close"
            className={NAV_ICON_BUTTON_CLASS}
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * 手機版頂欄。Admin 與 Creator 共用，確保 hamburger 的位置、尺寸與品牌區塊一致。
 */
export function MobileNavBar({
  title,
  eyebrow = "EDUMARKET",
  onOpen,
  open,
  controls,
  triggerRef,
  triggerLabel,
}: {
  title: string;
  eyebrow?: string;
  onOpen: () => void;
  open: boolean;
  controls: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  triggerLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ds-border bg-ds-surface/95 px-4 py-2 backdrop-blur lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={onOpen}
        aria-label={triggerLabel ?? "開啟選單"}
        aria-expanded={open}
        aria-controls={controls}
        data-testid="nav-drawer-trigger"
        className={NAV_ICON_BUTTON_CLASS}
      >
        <IconMenu />
      </button>
      <div className="min-w-0">
        <p className="text-caption font-semibold uppercase tracking-wider text-edu-primary">{eyebrow}</p>
        <p className="truncate text-sm font-bold text-ds-heading">{title}</p>
      </div>
    </header>
  );
}
