"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, InputField, LoadingState, Pagination } from "@teaching-platform/ui";
import Link from "next/link";
import type { ActivityLog, ActivityLogsResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const PAGE_SIZE = 20;

export default function AdminActivityLogsPage() {
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ActivityLog[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (actorId.trim()) params.set("actor_id", actorId.trim());
    if (action.trim()) params.set("action", action.trim());
    if (targetType.trim()) params.set("target_type", targetType.trim());
    if (targetId.trim()) params.set("target_id", targetId.trim());
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    return `admin/activity-logs?${params.toString()}`;
  }, [actorId, action, targetType, targetId, page]);

  const load = useCallback(async () => {
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
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitFilter() {
    setPage(1);
    void load();
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">活動紀錄</h1>
      <p className="text-sm text-slate-600">點選標題可查看單筆詳情；操作者與目標可進一步篩選相關紀錄。</p>

      <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <InputField id="log-actor-id" label="Actor ID" value={actorId} onChangeText={setActorId} placeholder="usr_..." />
        <InputField id="log-action" label="Action" value={action} onChangeText={setAction} placeholder="order.approve" />
        <InputField id="log-target-type" label="Target Type" value={targetType} onChangeText={setTargetType} placeholder="order/material/report" />
        <InputField id="log-target-id" label="Target ID" value={targetId} onChangeText={setTargetId} placeholder="ord_..." />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onPress={submitFilter}>
            套用篩選
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setActorId("");
              setAction("");
              setTargetType("");
              setTargetId("");
              setPage(1);
            }}
          >
            清除篩選
          </Button>
        </div>
      </article>

      {loading ? <LoadingState title="載入活動紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有活動紀錄" description="目前查無符合條件的資料。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
          {items.map((log) => (
            <article key={log.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={`/admin/activity-logs/${encodeURIComponent(log.id)}`}>
                <span className="text-sm font-semibold text-indigo-600 underline">{log.action ?? "unknown action"}</span>
              </Link>
              <p className="text-xs text-slate-500">紀錄 ID：{log.id}</p>
              {log.actor_id ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">操作者：</span>
                  <Link href={`/admin/users/${encodeURIComponent(log.actor_id)}/activity-logs`}>
                    <span className="font-medium text-indigo-600 underline">{log.actor_id}</span>
                  </Link>
                </div>
              ) : null}
              {log.actor_role ? <p className="text-xs text-slate-500">角色：{log.actor_role}</p> : null}
              {log.target_type || log.target_id ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">
                    目標：{log.target_type ?? "-"} / {log.target_id ?? "-"}
                  </span>
                  {log.target_type === "material" && log.target_id ? (
                    <Link href={`/admin/materials/${encodeURIComponent(log.target_id)}/activity-logs`}>
                      <span className="font-medium text-indigo-600 underline">此教材紀錄</span>
                    </Link>
                  ) : null}
                  {log.target_type === "order" && log.target_id ? (
                    <Link href={`/admin/orders/${encodeURIComponent(log.target_id)}/activity-logs`}>
                      <span className="font-medium text-indigo-600 underline">此訂單紀錄</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
