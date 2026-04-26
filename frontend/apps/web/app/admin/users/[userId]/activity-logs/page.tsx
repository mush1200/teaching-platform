"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@teaching-platform/ui";
import Link from "next/link";
import type { ActivityLog, ActivityLogsResponse } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";

const PAGE_SIZE = 20;

export default function AdminUserActivityLogsPage() {
  const params = useParams();
  const userId = String(params.userId ?? "").trim();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ActivityLog[]>([]);
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
      const data = (await res.json()) as ActivityLogsResponse;
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
      <section className="mx-auto w-full max-w-6xl px-4 py-6">
        <p className="text-sm text-slate-600">缺少使用者 ID。</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">使用者活動紀錄</h1>
      <p className="text-sm text-slate-600">操作者（actor）為 {userId} 的紀錄。</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/activity-logs">
          <span className="font-medium text-indigo-600 underline">← 返回活動紀錄總覽</span>
        </Link>
      </div>

      {loading ? <LoadingState title="載入紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="沒有活動紀錄" description="此使用者尚無可查詢的活動紀錄。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
          {items.map((log) => (
            <article key={log.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={`/admin/activity-logs/${encodeURIComponent(log.id)}`}>
                <span className="text-sm font-semibold text-indigo-600 underline">{log.action ?? "unknown action"}</span>
              </Link>
              <p className="text-xs text-slate-500">紀錄 ID：{log.id}</p>
              {log.target_type || log.target_id ? (
                <p className="text-xs text-slate-500">目標：{log.target_type ?? "-"} / {log.target_id ?? "-"}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
