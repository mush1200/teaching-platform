"use client";

import Link from "next/link";
import { AccentTextLink, EmptyState, ErrorState, LoadingState, SurfaceCard } from "../ds";
import { activityTargetHref, describeActivity } from "../../lib/admin-labels";
import type { ActivityLogRow } from "../../lib/api-types";

type Props = {
  items: ActivityLogRow[];
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
 * Dashboard「需要注意的活動」（IA-05）。
 *
 * 取代舊的「最近活動」。舊版直接渲染 `action` / `actor_role` / `target_type` 三個
 * 原始值（`payment_proof.approved`、`admin`、`order`），違反 IA §11 原則 3
 * ——「技術欄位不得成為主要資訊層」—— 而且不可點，看到了也不知道要去哪。
 *
 * 三件事一起改：
 *   1. **挑選** —— 只顯示 `ATTENTION_ACTIVITY_ACTIONS` 的事件（篩選在 Backend 做，
 *      前端不對一個大 window 自己 filter，否則高頻事件會把異常擠出視窗而靜默漏顯示）
 *   2. **文案** —— 用 `describeActivity()`，與活動紀錄全站列表**同一個** formatter，
 *      不在這裡另寫一組 if/else
 *   3. **導航** —— `activityTargetHref()` 連到既有的 entity 紀錄／案件入口
 *
 * 只描述資料本身，不做任何推論：後端寫的是「退回了付款憑證」就只顯示這句，
 * 不擅自補上「買家需要重新付款」這種資料沒有支持的結論。
 */
export function AttentionActivityList({ items, loading, error }: Props) {
  return (
    <SurfaceCard elevation="raised" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-ds-borderMuted px-4 py-3">
        <h2 className="text-title text-ds-heading">需要注意的活動</h2>
        <AccentTextLink href="/admin/activity-logs" className="text-sm">
          查看全部
        </AccentTextLink>
      </header>

      {loading || error || items.length === 0 ? (
        <div className="p-4">
          {loading ? <LoadingState title="載入活動中…" /> : null}
          {!loading && error ? <ErrorState title="活動載入失敗" description={error} /> : null}
          {!loading && !error && items.length === 0 ? (
            <EmptyState
              title="目前沒有需要注意的活動"
              description="沒有付款退回、下載遭拒或教材下架等異常事件。"
            />
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-ds-borderMuted">
          {items.map((item) => {
            const described = describeActivity(item);
            const href = activityTargetHref(item);
            const body = (
              <>
                <p className="truncate text-sm font-medium text-ds-heading">{described.sentence}</p>
                <p className="truncate text-meta text-ds-textMuted">
                  {described.target ? `${described.target} ・ ` : ""}
                  {formatDate(item.created_at)}
                </p>
              </>
            );

            return (
              <li key={item.id} data-testid="attention-activity-row">
                {/*
                  沒有 target_id 就沒有可去的地方 —— 那一列維持純文字。
                  給一條會落在 404 或空白頁的連結，比不可點更糟。
                */}
                {href ? (
                  <Link
                    href={href}
                    className="block px-4 py-2.5 hover:bg-ds-surfaceMuted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-focus"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}
