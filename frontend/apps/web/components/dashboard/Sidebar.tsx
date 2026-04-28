"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  cartBadge?: number;
  ordersBadge?: number;
  onNavigate?: () => void;
};

function NavBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-auto flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#FF6B73] px-1.5 text-[11px] font-bold leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function Sidebar({ cartBadge = 2, ordersBadge = 1, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

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

  function linkCls(href: string, exact?: boolean) {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return [
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
      active
        ? "border-l-[3px] border-[#6C63FF] bg-[#EDE9FE]/90 font-semibold text-[#6C63FF]"
        : "border-l-[3px] border-transparent text-[#4B5563] hover:bg-white/70 hover:text-[#1F2937]",
    ].join(" ");
  }

  const subtle =
    "flex items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-sm font-medium text-[#4B5563] transition-colors hover:bg-white/70 hover:text-[#1F2937]";

  return (
    <div className="flex h-full flex-col border-r border-[#E5E7EB]/80 bg-white/90">
      <div className="border-b border-[#E5E7EB]/60 px-5 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#EDE9FE] text-lg" aria-hidden>
            🎓
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#6C63FF]">EDUMARKET</p>
            <p className="text-sm font-bold text-[#1F2937]">Hi, 歡迎回來 👋</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 text-[#1F2937]" aria-label="主要選單">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">主要功能</p>
        <ul className="space-y-1">
          <li>
            <Link href="/dashboard" className={linkCls("/dashboard", true)} onClick={onNavigate}>
              <span aria-hidden>🏠</span>
              首頁
            </Link>
          </li>
          <li>
            <Link href="/materials" className={linkCls("/materials")} onClick={onNavigate}>
              <span aria-hidden>🔍</span>
              探索教材
            </Link>
          </li>
          <li>
            <Link href="/cart" className={linkCls("/cart", true)} onClick={onNavigate}>
              <span aria-hidden>🛒</span>
              購物車
              <NavBadge n={cartBadge} />
            </Link>
          </li>
          <li>
            <Link href="/orders" className={linkCls("/orders", true)} onClick={onNavigate}>
              <span aria-hidden>📦</span>
              我的訂單
              <NavBadge n={ordersBadge} />
            </Link>
          </li>
        </ul>

        <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">我的內容</p>
        <ul className="space-y-1">
          <li>
            <Link href="/downloads" className={linkCls("/downloads", true)} onClick={onNavigate}>
              <span aria-hidden>⬇️</span>
              下載中心
            </Link>
          </li>
          <li>
            <Link href="/my-reviews" className={linkCls("/my-reviews", true)} onClick={onNavigate}>
              <span aria-hidden>⭐</span>
              我的評價
            </Link>
          </li>
        </ul>

        <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">帳戶設定</p>
        <ul className="space-y-1">
          <li>
            <a href="#account" className={subtle} onClick={onNavigate}>
              <span aria-hidden>👤</span>
              個人資料
            </a>
          </li>
          <li>
            <a href="#notifications" className={subtle} onClick={onNavigate}>
              <span aria-hidden>🔔</span>
              通知設定
            </a>
          </li>
          <li>
            <button type="button" className={`${subtle} w-full text-left`} onClick={() => handleLogout()}>
              <span aria-hidden>🚪</span>
              登出
            </button>
          </li>
        </ul>
      </nav>

      <div className="p-4">
        <div className="rounded-2xl border border-[#E5E7EB]/80 bg-[#F5F3FF] p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#1F2937]">需要幫助？</p>
          <p className="mt-1 text-xs text-[#6B7280]">使用教學與常見問題</p>
          <a
            href="#help"
            className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#6C63FF] shadow-sm ring-1 ring-[#E5E7EB] transition hover:bg-[#EDE9FE]"
            onClick={onNavigate}
          >
            前往幫助中心
            <span aria-hidden>›</span>
          </a>
        </div>
      </div>
    </div>
  );
}
