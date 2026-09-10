"use client";

import Link from "next/link";
import { NAV_COMPACT_ACTIVE } from "./nav-active";
import { usePathname } from "next/navigation";

const items = [
  { href: "/materials", label: "首頁", icon: "🏠" },
  { href: "/materials?cat=1", label: "分類", icon: "📚" },
  { href: "/my-reviews", label: "我的學習", icon: "✏️" },
  { href: "/cart", label: "購物車", icon: "🛒" },
  { href: "/login", label: "個人", icon: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E5E7EB]/90 bg-white/95 px-2 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
      aria-label="底部導覽"
    >
      <ul className="mx-auto flex max-w-[390px] items-center justify-between gap-1">
        {items.map((item, index) => {
          /*
            `UI-CONS-14` —— 補上 `aria-current="page"`（買家的兩個導覽原本都沒有）。

            補之前必須先讓 active 是**唯一**的：「首頁」(`/materials`) 與「分類」
            (`/materials?cat=1`) 的比對值都是 `/materials`，所以在 `/materials` 上
            **兩個項目同時 active** —— 直接加 `aria-current` 會變成同時宣告兩個目前頁面。
            這裡取第一個相符的項目，不讀 query string：`useSearchParams()` 會讓這個
            client component 需要額外的 Suspense 邊界，屬於超出本輪的改動。

            副作用（已知且刻意）：在 `/materials` 上「分類」不再跟著highlight。
          */
          const activeIndex = items.findIndex((candidate) => pathname === candidate.href.split("?")[0]);
          const active = index === activeIndex;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                /*
                  `UI-CONS-14`：原本 active **只有換文字色**，顏色是唯一線索。
                  改用共用配方後同時有底色、前景色與字重，且色值來自 `edu-primary`
                  token 而不是就地寫死的 `#6C63FF`（兩者同值，非改色）。
                */
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] ${
                  active ? NAV_COMPACT_ACTIVE : "font-medium text-ds-textMuted"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
