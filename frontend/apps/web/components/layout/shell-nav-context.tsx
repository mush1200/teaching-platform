"use client";

import type { RefObject } from "react";
import { createContext, useContext } from "react";

/**
 * 讓「自己擁有行動版頂欄」的路由開啟**外殼的** canonical 抽屜（`UI-REV-E` 方案 B，2026-09-30）。
 *
 * 外殼（`RoleShell`）仍是導覽內容的唯一擁有者：抽屜裡是哪些項目、焦點管理、ESC、scroll lock
 * 都由它決定。路由只借用「觸發鈕」的位置 —— 這樣不會出現第二份、內容不同的抽屜
 * （方案 B 之前 `/materials` 自帶的抽屜缺「註冊」與「聯絡平台」就是這樣來的）。
 */
export type ShellNav = {
  open: boolean;
  onOpen: () => void;
  drawerId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  triggerLabel: string;
};

export const ShellNavContext = createContext<ShellNav | null>(null);

export function useShellNav(): ShellNav | null {
  return useContext(ShellNavContext);
}

/**
 * 在 `lg` 以下由路由自己渲染頂欄、外殼不渲染 `MobileNavBar` 的路由（**整段相等**比對）。
 *
 * 只收 `/materials`：它的頂欄帶購物導向的動作（搜尋、購物車），是 Owner 選定保留的那一條。
 * 新增路由前必須確認該頁**每個分支**都渲染一條接上 `useShellNav()` 的頂欄 ——
 * 否則那條路由在手機上會完全沒有導覽入口。
 */
export const ROUTES_OWNING_MOBILE_BAR = ["/materials"] as const;

export function routeOwnsMobileBar(pathname: string): boolean {
  return (ROUTES_OWNING_MOBILE_BAR as readonly string[]).includes(pathname);
}
