import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Heart,
  Home,
  LogOut,
  Mail,
  MessageSquareWarning,
  Package,
  Search,
  ShoppingCart,
  Star,
} from "lucide-react";

export const SIDEBAR_ICON_STROKE = 1.75;

export type SidebarBadgeKey = "cart" | "orders";

export type SidebarNavItemDef = {
  id: string;
  href?: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: SidebarBadgeKey;
  action?: "logout";
};

export type SidebarNavSection = {
  label: string;
  items: SidebarNavItemDef[];
};

/** Collapsed rail: primary + library only; account items via「更多」→ 展開 */
export const SIDEBAR_COLLAPSED_SECTIONS: SidebarNavSection[] = [
  {
    label: "主要功能",
    items: [
      { id: "home", href: "/dashboard", label: "首頁", icon: Home, exact: true },
      { id: "explore", href: "/explore", label: "探索教材", icon: Search },
      { id: "cart", href: "/cart", label: "購物車", icon: ShoppingCart, badge: "cart", exact: true },
      { id: "orders", href: "/me/orders", label: "我的訂單", icon: Package, badge: "orders", exact: true },
      { id: "favorites", href: "/favorites", label: "收藏清單", icon: Heart, exact: true },
    ],
  },
  {
    label: "我的內容",
    items: [
      { id: "library", href: "/me/materials", label: "我的教材", icon: BookOpen, exact: true },
      { id: "reviews", href: "/my-reviews", label: "我的評論", icon: Star, exact: true },
    ],
  },
];

export const SIDEBAR_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "主要功能",
    items: [
      { id: "home", href: "/dashboard", label: "首頁", icon: Home, exact: true },
      { id: "explore", href: "/explore", label: "探索教材", icon: Search },
      { id: "cart", href: "/cart", label: "購物車", icon: ShoppingCart, badge: "cart", exact: true },
      { id: "orders", href: "/me/orders", label: "我的訂單", icon: Package, badge: "orders", exact: true },
      { id: "favorites", href: "/favorites", label: "收藏清單", icon: Heart, exact: true },
    ],
  },
  {
    label: "我的內容",
    items: [
      { id: "library", href: "/me/materials", label: "我的教材", icon: BookOpen, exact: true },
      { id: "reviews", href: "/my-reviews", label: "我的評論", icon: Star, exact: true },
    ],
  },
  {
    label: "其他",
    items: [
      /*
       * **全域申訴入口**（`BUY-02` / `DEC-LEGAL-09`，2026-08-27）。
       *
       * 在此之前，申訴功能**只能**從某一張訂單的詳情頁進入 —— 但平台在多處
       * （結帳失敗、帳號凍結回應）告訴使用者「請聯繫客服」，而那個管道並不存在。
       * 帳號被凍結的人尤其需要一個不必先找到訂單的入口。
       *
       * 這裡刻意**放在既有的「其他」次要區塊**，而不是新建 Footer 或客服中心：
       * 買家外殼已經有這個層級，塞進主要功能只會稀釋購買動線。
       * 訂單詳情頁的 contextual CTA **保留不動** —— 它會帶 `orderId`，
       * 是這個全域入口做不到的事（`DEC-LEGAL-09` 明訂兩者並存）。
       *
       * 文案用「申訴與消費爭議」而不是「客服」：平台**沒有**客服系統，
       * 有的是消費申訴案件流程。
       */
      {
        id: "complaints",
        href: "/me/complaints",
        label: "申訴與消費爭議",
        icon: MessageSquareWarning,
      },
      /*
       * **一般客服入口**（`PRE-14`，2026-09-01）。
       *
       * 上面那一項（`BUY-02`）刻意不叫「客服」，因為它是**消保法 §43 的消費爭議
       * 案件流程** —— 有十五日法定期限、綁買家的交易。但平台同時還有另一類問題
       * （登入不了、下載操作、網站怎麼用），在此之前**沒有任何入口**，而 runtime
       * 有七處使用者可見文案叫人去找不存在的「平台客服」（同輪一併收尾）。
       *
       * 兩者**必須並存且分開**：把一般問題塞進申訴會讓「這件事受哪一套規則管」
       * 消失在一個 `complaint_type` 值裡（`docs/mvp_rules.md` §12.12）。
       *
       * 標籤是「聯絡平台」不是「客服中心」——平台仍然**沒有** ticket system，
       * 只有一個信箱與人工處理（完整 ticket center 是 tracker `FUT-P8`，`FUTURE`）。
       */
      {
        id: "support",
        href: "/support",
        label: "聯絡平台",
        icon: Mail,
      },
      { id: "logout", label: "登出", icon: LogOut, action: "logout" },
    ],
  },
];

export function isSidebarItemActive(pathname: string, href: string, exact?: boolean) {
  if (href.startsWith("#")) return false;
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
