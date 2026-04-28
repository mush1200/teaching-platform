"use client";

import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import type { ActivityLog } from "../../lib/api-types";

type Props = {
  items: ActivityLog[];
  loading: boolean;
  error: string | null;
};

function formatDate(date?: string) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString("zh-TW", { hour12: false });
}

export function RecentActivityList({ items, loading, error }: Props) {
  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#1F2937]">最近活動</h2>
        <Link href="/admin/activity-logs" className="text-sm font-semibold text-[#6C63FF] hover:underline">
          查看全部
        </Link>
      </div>
      {loading ? <LoadingState title="載入活動中…" /> : null}
      {!loading && error ? <ErrorState title="活動載入失敗" description={error} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="尚無活動紀錄" description="目前沒有可顯示的資料。" /> : null}
      {!loading && !error && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFF] px-3 py-2 text-sm">
              <p className="font-medium text-[#1F2937]">{item.action ?? "unknown action"}</p>
              <p className="text-xs text-[#6B7280]">
                {item.actor_role ?? "-"} ・ {item.target_type ?? "-"} ・ {formatDate(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
