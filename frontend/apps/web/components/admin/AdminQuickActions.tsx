"use client";

import Link from "next/link";

const actions = [
  { label: "審核教材", href: "/admin/materials?status=pending_review" },
  { label: "審核付款", href: "/admin/payment-proofs?status=pending" },
  { label: "處理檢舉", href: "/admin/reports?status=pending" },
  { label: "查看活動紀錄", href: "/admin/activity-logs" },
];

export function AdminQuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#6C63FF] shadow-sm transition hover:bg-[#F4F1FF]"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
