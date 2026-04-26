"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ErrorState, LoadingState } from "@teaching-platform/ui";
import Link from "next/link";
import type { ActivityLog } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";

export default function AdminActivityLogDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "").trim();
  const [log, setLog] = useState<ActivityLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/activity-logs/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setLog(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as ActivityLog;
      setLog(data);
    } catch {
      setLog(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6">
        <p className="text-sm text-slate-600">缺少紀錄 ID。</p>
      </section>
    );
  }

  const metaJson = log?.meta ? JSON.stringify(log.meta, null, 2) : "";

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">活動紀錄詳情</h1>
      <Link href="/admin/activity-logs">
        <span className="text-sm font-medium text-indigo-600 underline">← 返回活動紀錄列表</span>
      </Link>

      {loading ? <LoadingState title="載入中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}

      {!loading && !error && log ? (
        <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{log.action ?? "—"}</p>
          <p className="text-xs text-slate-500">紀錄 ID：{log.id}</p>
          {log.created_at ? <p className="text-xs text-slate-500">時間：{log.created_at}</p> : null}
          {log.actor_id ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">操作者：</span>
              <Link href={`/admin/users/${encodeURIComponent(log.actor_id)}/activity-logs`}>
                <span className="font-medium text-indigo-600 underline">{log.actor_id}</span>
              </Link>
            </div>
          ) : null}
          {log.actor_role ? <p className="text-xs text-slate-500">角色：{log.actor_role}</p> : null}
          {log.target_type && log.target_id ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">目標：</span>
              <span className="text-slate-500">{log.target_type} / {log.target_id}</span>
              {log.target_type === "material" ? (
                <Link href={`/admin/materials/${encodeURIComponent(log.target_id)}/activity-logs`}>
                  <span className="font-medium text-indigo-600 underline">此教材紀錄列表</span>
                </Link>
              ) : null}
              {log.target_type === "order" ? (
                <Link href={`/admin/orders/${encodeURIComponent(log.target_id)}/activity-logs`}>
                  <span className="font-medium text-indigo-600 underline">此訂單紀錄列表</span>
                </Link>
              ) : null}
            </div>
          ) : null}
          {metaJson ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Meta（JSON）</p>
              <pre className="overflow-auto rounded-xl bg-slate-100 p-3 text-xs text-slate-700">{metaJson}</pre>
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
