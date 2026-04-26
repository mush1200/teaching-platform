"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, SelectField } from "@teaching-platform/ui";
import Link from "next/link";
import type { Report } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待處理", value: "pending" },
  { label: "已處理", value: "reviewed" },
];

function reportStatusLabel(status?: string): string {
  if (status === "pending") return "待處理";
  if (status === "reviewed") return "已處理";
  return status ?? "未知";
}

export default function AdminReportsPage() {
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const query = useMemo(() => {
    if (status === "all") return "admin/reports";
    return `admin/reports?status=${encodeURIComponent(status)}`;
  }, [status]);

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
      const data = (await res.json()) as Report[];
      setItems(Array.isArray(data) ? data : []);
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

  async function markReviewed(id: string) {
    setMessage(null);
    setReviewingId(id);
    try {
      const res = await apiFetch(`admin/reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "reviewed" }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage("檢舉已標記為已處理。");
      await load();
    } catch {
      setMessage("更新失敗，請稍後再試。");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">檢舉管理</h1>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/materials">
          <span className="font-medium text-indigo-600 underline">教材列表（依教材檢視檢舉）</span>
        </Link>
        <Link href="/admin/activity-logs">
          <span className="font-medium text-indigo-600 underline">活動紀錄</span>
        </Link>
      </div>
      <SelectField id="admin-report-status" label="狀態篩選" value={status} options={statusOptions} onValueChange={setStatus} />

      {loading ? <LoadingState title="載入檢舉中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有檢舉資料" description="目前查無符合條件的檢舉。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((r) => (
            <article key={r.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">檢舉 {r.id}</p>
              <p className="text-sm text-slate-700">狀態：{reportStatusLabel(r.status)}</p>
              {r.material_id ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <p className="text-slate-600">教材 ID：{r.material_id}</p>
                  <Link href={`/admin/materials/${encodeURIComponent(r.material_id)}/reports`}>
                    <span className="font-medium text-indigo-600 underline">此教材檢舉列表</span>
                  </Link>
                  <Link href={`/admin/materials/${encodeURIComponent(r.material_id)}/activity-logs`}>
                    <span className="font-medium text-indigo-600 underline">此教材活動紀錄</span>
                  </Link>
                </div>
              ) : null}
              {r.reason ? <p className="text-xs text-slate-600">原因：{r.reason}</p> : null}
              <div>
                <Button size="sm" variant="secondary" disabled={r.status === "reviewed" || reviewingId !== null} loading={reviewingId === r.id} onPress={() => void markReviewed(r.id)}>
                  標記已處理
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {message ? <p className="text-sm text-amber-600">{message}</p> : null}
    </section>
  );
}
