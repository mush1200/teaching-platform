"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ActivityLogRow, ActivityLogsListResponse } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";
import { activityTargetHref } from "../../../../../lib/admin-labels";
import { AccountFreezePanel } from "../../../../../components/admin/AccountFreezePanel";
import { ActivityLogCard } from "../../../../../components/admin/ActivityLogCard";
import {
  AccentTextLink,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
} from "../../../../../components/ds";

const PAGE_SIZE = 20;

/**
 * 使用者的活動時間軸（IA §6 的 entity-centric 主入口之一）。
 *
 * 這是平台上**唯一**的「依人查詢」入口，因此不論 `/admin/users` 那張 placeholder
 * 頁最後怎麼處理，這條 route 都必須保持可直達。
 *
 * 修正內容與另外兩個 entity 頁相同：原本每一列是 raw `action` 加上
 * `目標：{target_type} / {target_id}`，現在共用 `ActivityLogCard` 的三層資訊架構。
 * 資料來自既有的 `GET /admin/users/:userId/activity-logs`（`actor_id = userId`）。
 */
export default function AdminUserActivityLogsPage() {
  const params = useParams();
  const userId = String(params.userId ?? "").trim();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ActivityLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const paramsQs = new URLSearchParams();
    paramsQs.set("page", String(page));
    paramsQs.set("limit", String(PAGE_SIZE));
    return `admin/users/${encodeURIComponent(userId)}/activity-logs?${paramsQs.toString()}`;
  }, [userId, page]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(query);
      if (!res.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as ActivityLogsListResponse;
      const nextItems = data.items ?? [];
      setItems(nextItems);
      const total = data.pagination?.total ?? nextItems.length;
      const pages = data.pagination?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE));
      setTotalItems(total);
      setTotalPages(Math.max(1, pages));
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [userId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!userId) {
    return (
      <section className="flex w-full flex-col gap-4">
        <PageHeader title="使用者活動紀錄" />
        <EmptyState title="缺少使用者 ID" description="這個網址沒有帶到使用者編號，請從活動紀錄進入。" />
      </section>
    );
  }

  /*
   * 這一頁的標題刻意不寫「操作者 <uuid>」：id 是內部識別碼，不是人的名字。
   * 誰做的由每一列的句子（`describeActivity()` 會用 `actor_email`）說清楚。
   */
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="使用者活動紀錄"
        description="這個人在平台上做過的所有操作，由新到舊。"
        breadcrumb={
          <AccentTextLink href="/admin/activity-logs" className="text-sm">
            ← 返回活動紀錄
          </AccentTextLink>
        }
      />

      {/*
        帳號狀態與凍結操作（`OPS-02`）。
        放在這裡而不是新開一個使用者管理頁：這是平台唯一的「依人查詢」入口，
        `IA-07` 也已判定還不做使用者管理模組。面板自行載入自己的資料，
        因此下方活動紀錄的載入／錯誤狀態完全不受影響。
      */}
      <AccountFreezePanel userId={userId} />

      {loading ? <LoadingState title="載入紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="沒有活動紀錄" description="這個帳號還沒有可查詢的操作紀錄。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((log) => (
            <ActivityLogCard key={log.id} log={log} links={<EntryLinks log={log} />} />
          ))}
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            disabled={loading}
            onPageChange={setPage}
            className="pt-2"
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * 每一列的導航。這一頁是「人」的時間軸，所以出口是**對象** ——
 * 走 `activityTargetHref()`，與 Dashboard、單筆詳情同一個 mapping，不另開一套。
 */
function EntryLinks({ log }: { log: ActivityLogRow }) {
  const targetHref = activityTargetHref(log);
  return (
    <>
      {targetHref ? (
        <Link href={targetHref} className="font-medium text-edu-primary underline">
          此對象紀錄
        </Link>
      ) : null}
      <Link
        href={`/admin/activity-logs/${encodeURIComponent(log.id)}`}
        className="font-medium text-edu-primary underline"
      >
        單筆詳情
      </Link>
    </>
  );
}
