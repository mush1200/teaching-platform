"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { AdminSidebar } from "./AdminSidebar";
import { MobileNavBar, NavDrawer } from "../layout/NavDrawer";
import { CONTENT_OFFSET_CLASS } from "../layout/shell-constants";

/**
 * Admin shell。
 *
 * `lg` 以上：固定側欄（`layout-sidebar` token = 240px）+ `main` 的等值左偏移。
 * `lg` 以下：compact top bar + slide-in drawer + overlay。
 *
 * Drawer 的行為（ESC、scroll lock、focus 管理、overlay、寬度、hamburger）**全部**
 * 來自 `components/layout/NavDrawer`，與 Creator shell 共用同一份實作 —— 見 Epic §10。
 * 導覽項目也只有一份 source of truth：drawer 直接 render 同一個 `AdminSidebar`。
 *
 * 內容寬度上限放在 `main` 內層而不是整個 shell 外層：外層一旦 `mx-auto max-w-*`，
 * 而側欄又是 viewport-fixed 在 left:0，超過上限的螢幕上就會出現「側欄靠左、
 * 內容卻多偏移一個側欄寬」的空白帶。
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const openNav = useCallback(() => setNavOpen(true), []);

  /*
   * Admin 外殼的 session 探測（`DX-04` 的 opt-in 點）。
   *
   * `RoleShell` 對 `/admin/*` early return，所以 creator／buyer 那兩個探測都不會跑到 ——
   * 少了這一段，Admin 是三個角色裡唯一在 token 失效時不會被導回登入頁的。
   * `authExpiry: "recover"` 只在**帶著 token 卻收到 401** 時才動作。
   */
  useEffect(() => {
    void apiFetch("auth/me", undefined, { authExpiry: "recover" }).catch(() => {
      /* 網路錯誤不是 session 失效；沿用各頁既有的錯誤處理。 */
    });
  }, []);


  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#F4F1FF] font-sans text-[#1F2937] antialiased">
      <AdminSidebar />

      <MobileNavBar
        title="管理後台"
        onOpen={openNav}
        open={navOpen}
        controls="admin-mobile-nav"
        triggerRef={menuButtonRef}
        triggerLabel="開啟後台選單"
      />

      <NavDrawer
        open={navOpen}
        onClose={closeNav}
        id="admin-mobile-nav"
        ariaLabel="後台選單"
        triggerRef={menuButtonRef}
        header={
          <>
            <p className="truncate text-caption font-semibold uppercase tracking-wider text-edu-primary">
              EDUMARKET
            </p>
            <p className="truncate text-sm font-bold text-ds-heading">管理後台</p>
          </>
        }
      >
        <AdminSidebar variant="drawer" onNavigate={closeNav} />
      </NavDrawer>

      <div className={CONTENT_OFFSET_CLASS}>
        <main className="min-h-dvh overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
