"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { useShellNav } from "../../components/layout/shell-nav-context";
import { ExplorePage } from "../../components/parent/ExplorePage";
import { Button } from "../../components/ui/Button";
import { getStoredRole } from "../../lib/api-client";

const SEARCH_PANEL_ID = "materials-search-panel";

/**
 * `/materials` 的頂欄（`UI-REV-E` 方案 B，Owner 決定，2026-09-30）。
 *
 * 這一條是此路由**唯一**的頂欄：外殼（`RoleShell`）在這裡不渲染 `MobileNavBar`
 * （`ROUTES_OWNING_MOBILE_BAR`）。選單鈕開啟的是**外殼的** canonical 抽屜 ——
 * 未登入者看到首頁／教材列表／登入／註冊／聯絡平台，與其他公開頁面同一份；
 * 本頁**不再**自帶第二份抽屜（先前那份缺「註冊」與「聯絡平台」）。
 *
 * 每個分支（含 hydration 前的載入中）都渲染這條頂欄，避免手機上出現沒有任何導覽的瞬間。
 */
function MaterialsHeader({ search }: { search?: { expanded: boolean; onToggle: () => void } }) {
  const shellNav = useShellNav();
  return (
    <MobileHeader
      title="EduMarket"
      leading={shellNav ? "auto" : "none"}
      shellMenu={
        shellNav
          ? {
              onOpen: shellNav.onOpen,
              expanded: shellNav.open,
              controls: shellNav.drawerId,
              triggerRef: shellNav.triggerRef,
              label: shellNav.triggerLabel,
              hideAtDesktop: true,
            }
          : undefined
      }
      search={search ? { ...search, controls: SEARCH_PANEL_ID } : undefined}
    />
  );
}

/**
 * 頂欄搜尋鈕展開的搜尋列。寫入 `ExplorePage` 本來就讀取的 `?search=`（不是新參數），
 * 保留其他篩選條件、回到第 1 頁。
 */
function MaterialsSearchPanel({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("search") ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const next = q.trim();
    if (next) params.set("search", next);
    else params.delete("search");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/materials?${qs}` : "/materials");
    onDone();
  }

  return (
    <div id={SEARCH_PANEL_ID} className="border-b border-[#E5E7EB]/80 bg-white px-4 py-3 sm:px-6">
      <form
        role="search"
        aria-label="搜尋教材"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
        }}
        className="mx-auto flex max-w-[1440px] items-center gap-2"
      >
        <label htmlFor="materials-search-input" className="sr-only">
          搜尋教材
        </label>
        <input
          id="materials-search-input"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜尋教材、主題、年齡…"
          autoComplete="off"
          autoFocus
          className="min-w-0 flex-1 rounded-full border border-ds-borderControl bg-[#FAFAFA] px-4 py-2 text-sm text-ds-heading placeholder:text-ds-textSubtle focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
        />
        <Button type="submit" intent="action" size="sm">
          搜尋
        </Button>
      </form>
    </div>
  );
}

export default function MaterialsPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState<"parent" | "teacher" | "creator" | "admin" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setRole(getStoredRole());
  }, []);

  const redirectParent = useCallback(() => {
    router.replace("/explore");
  }, [router]);

  useEffect(() => {
    if (!hydrated || role !== "parent") return;
    redirectParent();
  }, [hydrated, role, redirectParent]);

  if (!hydrated) {
    return (
      <>
        <MaterialsHeader />
        <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-ds-textMuted">載入中…</div>
      </>
    );
  }

  if (role === "teacher" || role === "creator") {
    return (
      <AppShell>
        <MaterialsHeader />
        <div className="mx-auto max-w-lg px-page-mobile sm:px-page-tablet lg:px-page-desktop py-12 text-center">
          <h1 className="text-h2 text-[#1F2937]">創作者工作台入口</h1>
          <p className="mt-2 text-sm text-ds-textMuted">公開教材列表提供購買者瀏覽，請前往創作者工作台管理你的內容。</p>
          <Link href="/creator/materials" className="mt-6 inline-block">
            <Button type="button" intent="flow">
              前往創作者工作台
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  if (role === "parent") {
    return (
      <>
        <MaterialsHeader />
        <div className="flex min-h-dvh items-center justify-center bg-[#F4F1FF] text-ds-textMuted">
          正在前往探索教材…
        </div>
      </>
    );
  }

  return (
    <AppShell withBottomNav>
      <MaterialsHeader search={{ expanded: searchOpen, onToggle: () => setSearchOpen((open) => !open) }} />
      {searchOpen ? (
        <Suspense fallback={null}>
          <MaterialsSearchPanel onDone={() => setSearchOpen(false)} />
        </Suspense>
      ) : null}
      <div className="mx-auto max-w-[1440px] pb-8 pt-4">
        {/*
          `UI-CONS-02` —— 這一頁原本**完全沒有** `<h1>`／`<h2>`（1440 與 375 皆實測為 0），
          公開教材列表因此在 accessibility tree 裡沒有頁面主題。

          用 `sr-only` 而不是可見標題：這一頁的視覺入口是分類列與篩選列，
          插入一個大標題會改變既有的 browse 版面 —— 而本輪是 zero-risk normalization。
          文案沿用本路由 `layout.tsx` 既有的 metadata title「教材列表」，不新造行銷文案。
        */}
        <h1 className="sr-only">教材列表</h1>
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-ds-textMuted">載入中…</div>}
        >
          <ExplorePage />
        </Suspense>
      </div>
    </AppShell>
  );
}
