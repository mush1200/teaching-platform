import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Heart,
  Home,
  LogOut,
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
      { id: "notifications", href: "#notifications", label: "通知設定", icon: Bell },
      { id: "logout", label: "登出", icon: LogOut, action: "logout" },
    ],
  },
];

export function isSidebarItemActive(pathname: string, href: string, exact?: boolean) {
  if (href.startsWith("#")) return false;
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
