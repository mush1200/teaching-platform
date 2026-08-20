"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { IconMenu } from "../ui/icons";

/**
 * Admin shell。
 *
 * `lg` 以上：維持原本的固定側欄（240px）+ `main` 的 `lg:ml-60`，未做任何 redesign。
 * `lg` 以下：側欄不進文件流，改為 compact top bar + slide-in drawer + overlay，
 *            沿用 `ParentAppShell` 既有的 drawer 慣例（fixed overlay + fixed 面板 + onNavigate 關閉）。
 * 導覽項目只有一份 source of truth：drawer 直接 render 同一個 `AdminSidebar`。
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeNav = useCallback(() => setNavOpen(false), []);

  // drawer 開啟時：ESC 關閉、鎖住背景捲動、把焦點移到關閉鈕；關閉後把焦點還給選單鈕。
  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }

    // 在 effect 內取值，避免 cleanup 讀到已變動的 ref（react-hooks/exhaustive-deps）
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButton?.focus();
    };
  }, [navOpen]);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#F4F1FF] font-sans text-[#1F2937] antialiased">
      <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col lg:flex-row">
        <AdminSidebar />

        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ds-border bg-ds-surface/95 px-4 py-2 backdrop-blur lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="開啟後台選單"
            aria-expanded={navOpen}
            aria-controls="admin-mobile-nav"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ds-heading transition-colors hover:bg-edu-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
          >
            <IconMenu />
          </button>
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wider text-edu-primary">EDUMARKET</p>
            <p className="truncate text-sm font-bold text-ds-heading">管理後台</p>
          </div>
        </header>

        {navOpen ? (
          <>
            <button
              type="button"
              onClick={closeNav}
              aria-label="關閉選單"
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden"
            />
            <div
              id="admin-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="後台選單"
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-ds-surface shadow-ds-card-hover lg:hidden"
            >
              <AdminSidebar
                variant="drawer"
                onNavigate={closeNav}
                headerAction={
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={closeNav}
                    aria-label="關閉選單"
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ds-heading transition-colors hover:bg-edu-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
                  >
                    <X aria-hidden className="size-5" />
                  </button>
                }
              />
            </div>
          </>
        ) : null}

        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
