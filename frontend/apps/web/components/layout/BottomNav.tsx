"use client";

import Link from "next/link";
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
        {items.map((item) => {
          const active = pathname === item.href.split("?")[0];
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium ${
                  active ? "text-[#6C63FF]" : "text-[#6B7280]"
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
