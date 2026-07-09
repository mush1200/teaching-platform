/** Desktop buyer sidebar widths (px) */

export const SIDEBAR_WIDTH_EXPANDED = 240;

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

