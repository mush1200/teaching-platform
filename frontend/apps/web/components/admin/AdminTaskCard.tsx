"use client";

import Link from "next/link";
import { BrandCtaLink } from "../ds";

type Props = {
  icon: string;
  title: string;
  count: number;
  description: string;
  href: string;
  ctaLabel?: string;
};

/**
 * 待處理工作卡 — Dashboard 首屏最高優先資訊。
 *
 * Desktop（`sm` 以上）：維持已驗收樣式 —— 說明文字 + `前往處理` 按鈕。
 * Mobile（`sm` 以下）：2×2 版面每張僅約 164px 寬，改為
 *   - 隱藏說明文字（描述會斷成兩行且斷點難看）
 *   - 隱藏按鈕，改成整張卡可點（覆蓋式連結），觸控面積放大到整張卡
 * 兩個斷點各只渲染一個連結（另一個 `display:none`，不會被輔助技術重複朗讀）。
 */
export function AdminTaskCard({ icon, title, count, description, href, ctaLabel = "前往處理" }: Props) {
  return (
    <article className="relative rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card">
      {/*
        單一結構、以 order + 換行切換兩種 header：
          Mobile（flex-wrap）：icon 與 count 同列，title 因 `w-full` 落到第二列 —— 維持已驗收的 2×2 版面。
          Desktop（`sm:flex-nowrap`）：icon + title 同列組成語意群組，count 靠右獨立。
        icon 與 count 都 `shrink-0`，title `min-w-0 flex-1`，長標題換行時不會把 count 擠掉或讓 icon 錯位。
      */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 sm:flex-nowrap sm:items-center">
        <span className="order-1 shrink-0 text-xl leading-none" aria-hidden>
          {icon}
        </span>
        <h3 className="order-3 w-full text-sm font-semibold text-ds-heading sm:order-2 sm:w-auto sm:min-w-0 sm:flex-1">
          {title}
        </h3>
        <p className="order-2 shrink-0 text-2xl font-bold leading-none text-ds-heading sm:order-3">{count}</p>
      </div>
      <p className="mt-2 hidden text-meta leading-snug text-ds-textMuted sm:block">{description}</p>

      <BrandCtaLink href={href} className="mt-3 hidden sm:inline-flex">
        {ctaLabel}
      </BrandCtaLink>

      {/* Mobile：整張卡即操作入口 */}
      <Link
        href={href}
        aria-label={`${title}：${ctaLabel}`}
        className="absolute inset-0 rounded-ds-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus sm:hidden"
      />
    </article>
  );
}
