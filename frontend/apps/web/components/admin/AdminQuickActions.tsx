"use client";

import Link from "next/link";

const actions = [
  { label: "審核教材", href: "/admin/materials?status=pending_review" },
  { label: "審核付款", href: "/admin/payment-proofs?status=pending" },
  { label: "處理檢舉", href: "/admin/reports?status=pending" },
  { label: "查看活動紀錄", href: "/admin/activity-logs" },
];

/**
 * 次要捷徑列 — 視覺重量刻意低於待處理工作與摘要卡。
 * 高度維持 py-2（約 38px）以保住 mobile 觸控目標，不再壓縮。
 */
export function AdminQuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="rounded-xl border border-ds-border bg-ds-surface px-4 py-2 text-sm font-semibold text-edu-primary transition hover:bg-edu-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
