import { SIDEBAR_WIDTH_EXPANDED_PX } from "../layout/shell-constants";

/**
 * Desktop buyer sidebar widths (px).
 *
 * `UI-CONS-06`（Wave UI-6）：**展開寬度不再在這裡宣告第二次** ——
 * 它的唯一來源是 `components/layout/shell-constants.ts` 的
 * `SIDEBAR_WIDTH_EXPANDED_PX`，與 Admin／Creator 用的 `layout-sidebar` token 同值。
 * 這裡只保留 re-export，讓買家外殼的既有 import 不必全部改寫。
 */
export const SIDEBAR_WIDTH_EXPANDED = SIDEBAR_WIDTH_EXPANDED_PX;

/**
 * 收合寬度（icon rail）。
 *
 * **這是買家外殼特有的能力**，Admin／Creator 沒有收合模式，因此這個值刻意留在
 * 買家自己的常數檔，不上升為共用 shell 尺寸（`ROLE-INTENTIONAL`，見
 * `docs/ui-design-system.md` §7.6）。
 */
export const SIDEBAR_WIDTH_COLLAPSED = 72;



export const SIDEBAR_COLLAPSED_STORAGE_KEY = "tp-sidebar-collapsed";



/** Product detail: /materials/:id — not list, not reviews sub-routes */

export function isMaterialDetailPath(pathname: string): boolean {

  return /^\/materials\/[^/]+$/.test(pathname);

}



export function readSidebarCollapsedPreference(): boolean {

  if (typeof window === "undefined") return false;

  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";

}



export function writeSidebarCollapsedPreference(collapsed: boolean): void {

  if (typeof window === "undefined") return;

  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");

}

