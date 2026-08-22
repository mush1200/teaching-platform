"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SIDEBAR_DESKTOP_WIDTH_CLASS,
  SIDEBAR_NAV_SCROLL_CLASS,
  SIDEBAR_SHELL_CLASS,
  SIDEBAR_STATIC_CLASS,
} from "../layout/shell-constants";

type NavItem = { href: string; label: string; icon: string; exact?: boolean };
type NavSection = { label: string; items: NavItem[] };

/**
 * Admin 導覽的 Information Architecture（Epic §7）。
 *
 * ## 分組依據：**Admin 今天要完成什麼工作**，不是程式的 module 邊界
 *
 *   1. 「營運總覽」單獨在最上方 —— 它是入口，不屬於任何一類日常工作。
 *   2. 「日常審核」是**高頻、有佇列、有 SLA** 的三件事：教材審核、付款審核、訂單管理。
 *      共同特徵是「有一疊東西等我處理完」。
 *   3. 「信任與安全」是**由外部事件觸發**的處理：檢舉案件、教學回饋內容。
 *      共同特徵是「有人回報了問題」，不是每天都有。
 *   4. 「平台管理」是**低頻、非佇列**的管理與稽核：用戶、活動紀錄、系統設定。
 *
 * ## 名稱：描述任務，不描述資料表
 *
 * 「付款憑證」→ **「付款審核」**：Admin 到這頁不是為了「看憑證」，是為了「做審核決定」。
 * 這與同組的「教材審核」也對齊 —— 兩者是同一種工作，名稱不該一個講資料一個講動作。
 * 其餘名稱維持不變（「訂單管理」「檢舉管理」等在目前 product language 中已一致）。
 *
 * 詳細的 audit 與取捨在最終報告 §C。
 */
const sections: NavSection[] = [
  {
    label: "總覽",
    items: [{ href: "/admin", label: "營運總覽", icon: "📊", exact: true }],
  },
  {
    label: "日常審核",
    items: [
      { href: "/admin/materials?status=pending_review", label: "教材審核", icon: "📚" },
      { href: "/admin/payment-proofs?status=pending", label: "付款審核", icon: "🧾" },
      { href: "/admin/orders", label: "訂單管理", icon: "📦" },
    ],
  },
  {
    label: "信任與安全",
    items: [
      { href: "/admin/reports?status=open", label: "檢舉管理", icon: "🚩" },
      { href: "/admin/reviews-hub", label: "教學回饋管理", icon: "⭐" },
    ],
  },
  {
    label: "平台管理",
    items: [
      { href: "/admin/users", label: "用戶管理", icon: "👥" },
      { href: "/admin/activity-logs", label: "活動紀錄", icon: "🕒" },
      { href: "/admin/settings", label: "系統設定", icon: "⚙️" },
    ],
  },
];

function navPath(href: string) {
  return href.split("?")[0] ?? href;
}

type Props = {
  /**
   * `desktop`（預設）：`lg` 以下隱藏，`lg` 以上為固定側欄。
   * `drawer`：在 `NavDrawer` 的面板內渲染，填滿容器並自行捲動。
   *
   * 兩種型態共用同一份 `sections`，不另外維護一組 mobile navigation。
   */
  variant?: "desktop" | "drawer";
  /** 點擊導覽項或登出後呼叫；drawer 用它自動關閉。 */
  onNavigate?: () => void;
};

const rootByVariant: Record<NonNullable<Props["variant"]>, string> = {
  // `hidden … lg:flex`：`lg` 以下完全不佔文件流。寬度用 shared token，不再各自寫死。
  desktop: `hidden border-r border-ds-borderMuted bg-ds-surface lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex ${SIDEBAR_DESKTOP_WIDTH_CLASS} ${SIDEBAR_SHELL_CLASS}`,
  drawer: `${SIDEBAR_SHELL_CLASS} w-full bg-ds-surface`,
};

export function AdminSidebar({ variant = "desktop", onNavigate }: Props = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(item: NavItem) {
    const path = navPath(item.href);
    if (item.exact) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("tp_token");
      localStorage.removeItem("tp_role");
      localStorage.removeItem("tp_user_email");
      localStorage.removeItem("tp_display_name");
      document.cookie = "tp_token=; path=/; max-age=0; samesite=lax";
      document.cookie = "tp_role=; path=/; max-age=0; samesite=lax";
    }
    onNavigate?.();
    router.push("/login");
  }

  return (
    <aside className={rootByVariant[variant]} data-testid={`admin-sidebar-${variant}`}>
      {variant === "desktop" ? (
        /*
         * Desktop identity card —— 角色 identity，不是 sidebar hero。
         * icon 與文字同一列，讓下方四段導航在一般高度的視窗內不需捲動就完整看得到。
         * Drawer 版本不放這張卡：抽屜裡它與 top bar 重複，且吃掉大量垂直空間。
         */
        <div className={`${SIDEBAR_STATIC_CLASS} border-b border-ds-borderMuted px-4 pb-4 pt-5`}>
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-edu-primary">EDUMARKET</p>
          <div data-testid="sidebar-identity" className="mt-4 flex items-center gap-3 rounded-2xl bg-edu-page p-3.5">
            <span className="shrink-0 text-[28px] leading-none" aria-hidden>
              🛡️
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-ds-heading">Hi, Admin 👋</p>
              <p className="mt-1 text-xs leading-snug text-ds-textMuted">平台營運總控台</p>
            </div>
          </div>
        </div>
      ) : null}

      <nav className={`${SIDEBAR_NAV_SCROLL_CLASS} px-3 pb-3`} aria-label="後台選單">
        {sections.map((section, index) => (
          <div key={section.label}>
            {/* 第一段貼近上方邊界；段與段之間才拉開，避免每一段都留大空白。 */}
            <p
              className={`mb-2 px-3 text-xs font-semibold tracking-wide text-[#7C74C8] ${index === 0 ? "mt-2" : "mt-5"}`}
            >
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "border-edu-primary bg-[#EDE9FE] font-semibold text-edu-primary"
                          : "border-transparent font-medium text-[#4B5563] hover:bg-[#F7F4FF] hover:text-ds-heading"
                      }`}
                    >
                      <span aria-hidden>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`${SIDEBAR_STATIC_CLASS} border-t border-ds-borderMuted p-3`}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-edu-error"
        >
          <span aria-hidden>🚪</span>
          登出
        </button>
      </div>
    </aside>
  );
}
