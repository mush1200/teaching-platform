"use client";

import { AccentTextLink, EmptyState, ErrorState, LoadingState, SurfaceCard } from "../ds";
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

/**
 * Dashboard 摘要 widget。
 *
 * 列樣式與 `RecentOrdersTable` 對齊：全寬分隔線列表（非「卡中卡」），
 * 同樣的 `px-4 py-2.5` 節奏與 hover 行為。
 * action 名稱屬「一般資訊」，維持一般字型；識別碼才用 monospace（見 RecentOrdersTable）。
 */
export function RecentActivityList({ items, loading, error }: Props) {
  return (
    <SurfaceCard elevation="raised" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-ds-borderMuted px-4 py-3">
        <h2 className="text-title text-ds-heading">最近活動</h2>
        <AccentTextLink href="/admin/activity-logs" className="text-sm">
          查看全部
        </AccentTextLink>
      </header>

      {loading || error || items.length === 0 ? (
        <div className="p-4">
          {loading ? <LoadingState title="載入活動中…" /> : null}
          {!loading && error ? <ErrorState title="活動載入失敗" description={error} /> : null}
          {!loading && !error && items.length === 0 ? (
            <EmptyState title="尚無活動紀錄" description="目前沒有可顯示的資料。" />
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-ds-borderMuted">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-2.5 hover:bg-ds-surfaceMuted">
              <p className="truncate text-sm font-medium text-ds-heading">{item.action ?? "unknown action"}</p>
              <p className="truncate text-meta text-ds-textMuted">
                {item.actor_role ?? "-"} ・ {item.target_type ?? "-"} ・ {formatDate(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}
