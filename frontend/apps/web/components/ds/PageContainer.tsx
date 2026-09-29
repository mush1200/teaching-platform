import type { HTMLAttributes, ReactNode } from "react";

/**
 * 頁面唯一的水平 gutter（`UI-REV-A`，2026-09-29）。
 *
 * ## 為什麼需要這個元件
 *
 * `docs/ui-design-system.md` §7.3 的規則是「每頁恰好一層 gutter」：`AdminShell` 自己供應，
 * 其餘外殼（`RoleShell`、`ParentAppShell`）**都不供應**，由頁面最外層容器供應。
 * 在這之前那一層是每個頁面手寫同一串 class（29 個檔案），忘了寫的頁面就會 0 gutter ——
 * `/materials`、`/explore`、`/dashboard` 實測 0px（卡片貼齊側欄），`/403` 與 404
 * 寫死 16px 不隨斷點放大。這個元件是那一層的**單一實作**。
 *
 * ## 契約
 *
 *   - 只負責**水平 gutter** 與 **content max-width**；垂直節奏與背景屬於外殼。
 *   - `AdminShell` 之下**不得**使用（那裡外殼已供應 gutter，會變成兩層）。
 *   - `data-page-container` 供 `tests/e2e/layout-contract.spec.ts` 定位「gutter 的擁有者」，
 *     用於標題長在卡片裡、無法從 `<h1>` 往上量的頁面（例如 `/dashboard`）。
 *   - 既有手寫同一串 class 的頁面數值相同，不必立刻遷移；新頁面一律用本元件。
 */
export const PAGE_GUTTER_CLASS = "px-page-mobile sm:px-page-tablet lg:px-page-desktop";

/** `docs/ui-design-system.md` §7.4 的 content width categories。 */
const WIDTH_CLASS = {
  narrow: "max-w-3xl",
  standard: "max-w-6xl",
  wide: "max-w-wide",
  full: "max-w-[1440px]",
  /** 不設上限 —— 由呼叫端的 `className` 自行決定（例如法律文件的 820px 閱讀寬度）。 */
  none: "",
} as const;

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  width?: keyof typeof WIDTH_CLASS;
};

export function PageContainer({ children, width = "wide", className = "", ...rest }: Props) {
  return (
    <div
      data-page-container=""
      className={`mx-auto w-full ${WIDTH_CLASS[width]} ${PAGE_GUTTER_CLASS} ${className}`.replace(/\s+/g, " ").trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
