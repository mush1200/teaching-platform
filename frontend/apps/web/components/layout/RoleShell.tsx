"use client";

import type { ReactNode } from "react";
import { clearClientSession } from "../../lib/session";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getStoredRole } from "../../lib/api-client";
import { ParentAppShell } from "../dashboard/ParentAppShell";
import { MobileNavBar, NavDrawer } from "./NavDrawer";
import { CreatorSidebar, SimpleNavSidebar } from "./CreatorSidebar";
import type { CreatorSection } from "./CreatorSidebar";
import { CONTENT_OFFSET_CLASS } from "./shell-constants";
import { ADMIN_NAV_ITEMS, navPathOf } from "../../lib/admin-nav";

type RoleKind = "public" | "parent" | "teacher" | "creator" | "admin";
type NavItem = { href: string; label: string; exact?: boolean };

const NAVS: Record<RoleKind, NavItem[]> = {
  public: [
    { href: "/", label: "首頁", exact: true },
    { href: "/materials", label: "教材列表" },
    { href: "/login", label: "登入" },
    { href: "/register", label: "註冊" },
    /*
     * `PRE-14` —— 未登入者的一般客服入口。
     *
     * 這是**最重要的一處**：既有的「申訴與消費爭議」（`BUY-02`）全部端點皆
     * `requireAuth`，而平台沒有密碼重設（`P1-08` 誠實移除），所以在此之前
     * 「登入不了的人」完全沒有任何管道。
     *
     * 文案是「聯絡平台」而不是「客服中心」／「幫助中心」：平台沒有 ticket
     * system，`BUY-03` 移除的那顆「幫助中心」正是因為承諾了不存在的東西。
     */
    { href: "/support", label: "聯絡平台" },
  ],
  parent: [
    { href: "/explore", label: "探索教材" },
    { href: "/favorites", label: "收藏清單" },
    { href: "/cart", label: "購物車" },
    { href: "/checkout", label: "結帳" },
    { href: "/me/orders", label: "我的訂單" },
    { href: "/me/materials", label: "我的教材" },
    { href: "/my-reviews", label: "我的教學回饋" },
    /*
     * 買家的 canonical 導覽是 `sidebar-nav-config.ts` 的 `SIDEBAR_NAV_SECTIONS`
     * （`ParentAppShell` 用）。這一份是買家走到 `parentShellRoutes` 以外的路由時
     * 會看到的 `SimpleNavSidebar` —— `/support` 與 `/me/complaints` 都屬於這一類，
     * 所以兩個 surface 都要有，否則買家一進客服頁反而失去回頭的入口。
     */
    { href: "/support", label: "聯絡平台" },
  ],
  teacher: [
    { href: "/creator/materials", label: "教材管理" },
    { href: "/creator/materials/new", label: "新增教材" },
    { href: "/creator/sales", label: "我的銷售" },
  ],
  creator: [
    { href: "/creator/materials", label: "教材管理" },
    { href: "/creator/materials/new", label: "新增教材" },
    { href: "/creator/sales", label: "我的銷售" },
  ],
  /**
   * Admin 在**非** `/admin` 路由（例如 `/materials`、`/`）上看到的側欄。
   *
   * 這是一份**回到 Admin 主控台的 cross-role 捷徑**，不是第二套 IA —— 因此它
   * 直接衍生自 `lib/admin-nav.ts`，與 `AdminSidebar` 用的是同一份資料（`IA-08`）。
   * 以前這裡是獨立抄寫的第二份清單，於是 `IA-01`（教學回饋）與 `IA-07`（用戶管理／
   * 系統設定）移除的三個入口在這個 surface 上原封不動地活著 —— 收斂只在 `/admin/*` 生效。
   *
   * `SimpleNavSidebar` 沒有分組也沒有 icon，所以取扁平化的 `ADMIN_NAV_ITEMS` 並剔除 `icon`。
   */
  admin: ADMIN_NAV_ITEMS.map(({ href, label, exact }) => ({ href, label, exact })),
};

/**
 * 「教材狀態」只列 Backend 真的存在的三個值。
 *
 * 這裡原本還有一個 `?status=draft` —— `materials.status` 的 allowlist
 * （`Backend/routes/materials.js`）是 `pending_review | published | unpublished`，
 * 沒有 `draft`，所以那是一個永遠 0 筆的 dead filter。移除它不是視覺調整，
 * 是把 UI 對回真實的 domain state（Epic §5 同一個原則）。
 */
const CREATOR_SECTIONS: CreatorSection[] = [
  {
    label: "主要功能",
    items: [
      { id: "teacher-materials", href: "/creator/materials?view=list", label: "教材管理", icon: "📖" },
      { id: "teacher-create", href: "/creator/materials/new", label: "新增教材", icon: "➕" },
      { id: "teacher-sales", href: "/creator/sales?tab=overview", label: "我的銷售", icon: "📊" },
    ],
  },
  {
    label: "教材狀態",
    items: [
      { id: "teacher-status-pending", href: "/creator/materials?status=pending_review", label: "待審核", icon: "⏱️" },
      { id: "teacher-status-published", href: "/creator/materials?status=published", label: "已發布", icon: "✅" },
      { id: "teacher-status-unpublished", href: "/creator/materials?status=unpublished", label: "已下架", icon: "📦" },
    ],
  },
  {
    label: "成效與互動",
    items: [
      { id: "teacher-reviews", href: "/creator/materials?view=reviews", label: "教材教學回饋", icon: "💬" },
      { id: "teacher-cases", href: "/creator/cases", label: "平台案件", icon: "🚩" },
    ],
  },
  {
    label: "帳戶",
    /*
     * 登出**不**放在這裡：shell 底部的固定登出列已經有一顆，Admin 側欄也只有那一顆。
     * 兩顆同名按鈕除了讓 accessibility tree 出現重複的「登出」之外沒有任何好處。
     */
    items: [
      { id: "teacher-profile", href: "/creator/materials?view=profile", label: "個人資料", icon: "👤" },
      /*
       * `PRE-14` —— 創作者側的一般客服入口。
       *
       * 創作者端也有指向不存在管道的死文案（`Backend/routes/materials.js` 的
       * `file_replacement_not_allowed` 與 `lib/material-status.ts` 的
       * `materialFileLockReason()`，兩處「請聯絡平台」已於同輪改寫）。
       * 「平台案件」在「成效與互動」區塊，那是**創作者自己的教材案件**，
       * 與一般客服不同 —— 因此這裡放在「帳戶」而不是併進去。
       */
      { id: "teacher-support", href: "/support", label: "聯絡平台", icon: "✉️" },
    ],
  },
];

function getRoleByPath(pathname: string, storedRole: RoleKind | null): RoleKind {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/teacher") || pathname.startsWith("/creator")) return "creator";
  if (storedRole === "parent") return "parent";
  if (storedRole === "teacher" || storedRole === "creator") return "creator";
  if (storedRole === "admin") return "admin";
  if (
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/me/orders") ||
    pathname.startsWith("/downloads") ||
    pathname.startsWith("/me/materials") ||
    pathname.startsWith("/my-reviews") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/favorites")
  ) {
    return "parent";
  }
  return "public";
}

/**
 * Admin 的捷徑帶著 query 預設（`/admin/materials?status=pending_review`），所以比對只看
 * pathname。其他角色的 href 沒有 query，`navPathOf()` 對它們是 identity。
 */
function isActive(pathname: string, item: NavItem) {
  const path = navPathOf(item.href);
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function getCreatorActiveId(
  pathname: string,
  params: { status: string | null; view: string | null; tab: string | null }
) {
  if (pathname.startsWith("/teacher/cases") || pathname.startsWith("/creator/cases")) return "teacher-cases";
  if (pathname.startsWith("/teacher/materials/new") || pathname.startsWith("/creator/materials/new"))
    return "teacher-create";
  if (pathname.startsWith("/teacher/sales") || pathname.startsWith("/creator/sales")) {
    return "teacher-sales";
  }
  if (pathname.startsWith("/teacher/materials") || pathname.startsWith("/creator/materials")) {
    if (params.status === "pending_review") return "teacher-status-pending";
    if (params.status === "published") return "teacher-status-published";
    if (params.status === "unpublished") return "teacher-status-unpublished";
    if (params.view === "list") return "teacher-materials";
    if (params.view === "reviews") return "teacher-reviews";
    if (params.view === "profile") return "teacher-profile";
    return "teacher-materials";
  }
  return "";
}

function roleTitle(role: RoleKind) {
  if (role === "admin") return "管理員";
  if (role === "teacher" || role === "creator") return "創作者工作台";
  if (role === "parent") return "使用者中心";
  return "探索教材";
}

/**
 * 非 Admin 路由的外殼。
 *
 * Mobile drawer 的行為（hamburger、ESC、scroll lock、focus、overlay、寬度）
 * 一律來自 `components/layout/NavDrawer`，與 `AdminShell` 是**同一份實作** ——
 * 之前 Creator 用的是文字「選單」按鈕、沒有 ESC、沒有 scroll lock，
 * 而且側欄面板不是 flex 容器，導致內容超過視窗時完全捲不動（Epic §10、§11）。
 */
export function RoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [storedRole, setStoredRole] = useState<RoleKind | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [creatorStatusCounts, setCreatorStatusCounts] = useState({
    pending_review: 0,
    published: 0,
    unpublished: 0,
  });
  const [creatorCaseCount, setCreatorCaseCount] = useState(0);
  const role = getRoleByPath(pathname, storedRole);
  const nav = NAVS[role];

  const closeNav = useCallback(() => setMobileOpen(false), []);
  const openNav = useCallback(() => setMobileOpen(true), []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const stored = getStoredRole();
    if (stored === "parent" || stored === "teacher" || stored === "creator" || stored === "admin") {
      setStoredRole(stored === "teacher" ? "creator" : stored);
    } else {
      setStoredRole(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (role !== "creator") return;
    let active = true;
    void (async () => {
      try {
        /*
         * Creator 外殼的 session 探測（`DX-04` 的 opt-in 點）。
         * 一個外殼探一次，該區域所有頁面就有一致的過期行為 ——
         * 不需要在 43 個呼叫端各加一次，也不必承擔全域攔截的風險。
         */
        const meRes = await apiFetch("auth/me", undefined, { authExpiry: "recover" });
        if (!meRes.ok) return;
        const mePayload = (await meRes.json()) as { user?: { id?: string } };
        const meId = mePayload.user?.id;
        const materialsRes = await apiFetch("materials");
        if (!materialsRes.ok) return;
        const materialsPayload = (await materialsRes.json()) as {
          items?: Array<{ teacher_id?: string; status?: string }>;
        };
        const own = (materialsPayload.items ?? []).filter((item) => (meId ? item.teacher_id === meId : true));
        const next = {
          pending_review: own.filter((item) => item.status === "pending_review").length,
          published: own.filter((item) => item.status === "published").length,
          unpublished: own.filter((item) => item.status === "unpublished").length,
        };
        if (active) setCreatorStatusCounts(next);
      } catch {
        /* keep last counts */
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, role]);

  /**
   * 待回覆的平台案件數。讀 API 回傳的 `actionRequiredCount`（全表計數），
   * 不是 `items.length` —— 後者只是第一頁。
   */
  useEffect(() => {
    if (role !== "creator") return;
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch("creator/cases?scope=action_required&page=1&limit=1");
        if (!res.ok) return;
        const payload = (await res.json()) as { actionRequiredCount?: number };
        if (active) setCreatorCaseCount(Number(payload.actionRequiredCount ?? 0));
      } catch {
        /* keep last count */
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, role]);

  /** Parent route group `(parent)/*` already uses ParentAppShell; avoid double chrome. */
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/explore")) {
    return <>{children}</>;
  }
  /**
   * Auth pages should not render any global sidebar chrome.
   *
   * 但它們仍然需要一個 main landmark（`COR-06`）——先前這裡回傳 fragment，
   * 而 `/login`／`/register` 兩個頁面自己也沒有 `<main>`，
   * 於是那兩條路由**完全沒有** main landmark。
   * 這裡只補語意，不補外殼：`<main>` 是 block 容器，版面與先前的 fragment 一致。
   */
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return <main>{children}</main>;
  }
  /** Admin routes use AdminShell in /app/admin/layout.tsx. */
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  const parentShellRoutes = [
    "/materials",
    "/explore",
    "/cart",
    "/checkout",
    "/orders",
    "/me/orders",
    "/downloads",
    "/me/materials",
    "/my-reviews",
    "/favorites",
  ];
  const shouldUseParentShell =
    role === "parent" && parentShellRoutes.some((base) => pathname === base || pathname.startsWith(`${base}/`));
  if (shouldUseParentShell) {
    return <ParentAppShell>{children}</ParentAppShell>;
  }

  function handleLogout() {
    // 與 401 session 恢復共用同一份清單（`DX-04`）—— 兩者對「什麼算已登入」必須一致。
    clearClientSession();
    setStoredRole(null);
    setMobileOpen(false);
    router.push("/login");
  }

  const isCreator = role === "creator" || role === "teacher";
  const title = roleTitle(role);
  const drawerId = isCreator ? "creator-mobile-nav" : "role-mobile-nav";

  const creatorActiveId = getCreatorActiveId(pathname, {
    status: searchParams.get("status"),
    view: searchParams.get("view"),
    tab: searchParams.get("tab"),
  });

  const creatorBadges = {
    "teacher-status-pending": { value: creatorStatusCounts.pending_review, tone: "bg-[#FEF3EC] text-edu-warning" },
    "teacher-status-published": { value: creatorStatusCounts.published, tone: "bg-[#ECFDF3] text-edu-success" },
    "teacher-status-unpublished": { value: creatorStatusCounts.unpublished, tone: "bg-[#F3F4F6] text-ds-textMuted" },
    // 只有真的有待回覆案件才顯示徽章；`0` 徽章只是視覺噪音。
    ...(creatorCaseCount > 0
      ? { "teacher-cases": { value: creatorCaseCount, tone: "bg-[#FEE2E2] text-[#B91C1C]" } }
      : {}),
  };

  const sidebar = (variant: "desktop" | "drawer") =>
    isCreator ? (
      <CreatorSidebar
        variant={variant}
        sections={CREATOR_SECTIONS}
        activeId={creatorActiveId}
        badges={creatorBadges}
        onNavigate={variant === "drawer" ? closeNav : undefined}
        onLogout={handleLogout}
      />
    ) : (
      <SimpleNavSidebar
        variant={variant}
        title={title}
        items={nav}
        isActive={(item) => isActive(pathname, item as NavItem)}
        onNavigate={variant === "drawer" ? closeNav : undefined}
        onLogout={handleLogout}
      />
    );

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#F4F1FF]">
      {sidebar("desktop")}

      <MobileNavBar
        title={title}
        onOpen={openNav}
        open={mobileOpen}
        controls={drawerId}
        triggerRef={triggerRef}
        triggerLabel="開啟側邊選單"
      />

      <NavDrawer
        open={mobileOpen}
        onClose={closeNav}
        id={drawerId}
        ariaLabel={`${title}選單`}
        triggerRef={triggerRef}
        header={
          <>
            <p className="truncate text-caption font-semibold uppercase tracking-wider text-edu-primary">
              EDUMARKET
            </p>
            <p className="truncate text-sm font-bold text-ds-heading">{title}</p>
          </>
        }
      >
        {sidebar("drawer")}
      </NavDrawer>

      {/*
        **外殼是 main landmark 的唯一擁有者**（`COR-06`）。

        HTML 規範只允許一份文件有一個非 hidden 的 `main`；先前外殼與頁面各渲染一個，
        於是每個非 Admin 路由都有兩個巢狀 main —— 螢幕閱讀器的 landmark 導覽會看到
        重複目標，任何 landmark-based 的選取也必須靠 `.first()` 迴避。

        收斂方向選「外殼擁有」而不是「頁面擁有」，是因為 repo 現況本來就偏向前者：
        **36 條路由沒有 page-level `<main>`**（Admin／Creator／Teacher／`(parent)` group
        以及 `/downloads`、`/favorites`、`/my-reviews` 等），只有 12 個頁面自己渲染一個。
        因此 page component **一律不得**再渲染 `<main>`；需要容器就用 `<div>`／`<section>`。

        同一個 ownership model 由三個外殼實作：本檔、`components/dashboard/ParentAppShell.tsx`、
        `components/admin/AdminShell.tsx`。三者互斥（`/admin` 與 `(parent)` group 在上方 early return）。
      */}
      <div className={CONTENT_OFFSET_CLASS}>
        <main className="min-h-dvh">{children}</main>
      </div>
    </div>
  );
}
