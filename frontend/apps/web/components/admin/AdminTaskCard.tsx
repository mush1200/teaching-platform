"use client";

import Link from "next/link";

type Props = {
  icon: string;
  title: string;
  count: number;
  description: string;
  href: string;
  ctaLabel?: string;
};

export function AdminTaskCard({ icon, title, count, description, href, ctaLabel = "前往處理" }: Props) {
  return (
    <article className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
        <p className="text-3xl font-bold text-[#1F2937]">{count}</p>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-[#1F2937]">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center rounded-2xl bg-[#6C63FF] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#5b52eb]"
      >
        {ctaLabel}
      </Link>
    </article>
  );
}
