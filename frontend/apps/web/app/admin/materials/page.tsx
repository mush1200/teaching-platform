"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@teaching-platform/ui";
import Link from "next/link";
import type { Material, MaterialsListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

function getStatusLabel(status?: string): string {
  if (status === "pending_review") return "審核中";
  if (status === "published") return "已上架";
  if (status === "unpublished") return "已下架";
  return "未設定";
}

function getStatusTone(status?: string): "success" | "warning" | "info" | "error" {
  if (status === "published") return "success";
  if (status === "pending_review") return "info";
  if (status === "unpublished") return "warning";
  return "error";
}

export default function AdminMaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("admin/materials");
      if (!res.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as MaterialsListResponse;
      setItems(data.items ?? []);
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">管理員教材列表</h1>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/orders">
          <span className="font-medium text-indigo-600 underline">前往訂單管理</span>
        </Link>
        <Link href="/admin/reports">
          <span className="font-medium text-indigo-600 underline">前往檢舉管理</span>
        </Link>
        <Link href="/admin/activity-logs">
          <span className="font-medium text-indigo-600 underline">活動紀錄總覽</span>
        </Link>
      </div>

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有教材資料" description="目前查無可管理教材。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((m) => (
            <article key={m.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{m.title}</p>
              <p className="text-xs text-slate-500">ID：{m.id}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-700">價格：NT$ {Math.floor(Number(m.price) || 0)}</p>
                <StatusBadge tone={getStatusTone(m.status)} label={getStatusLabel(m.status)} />
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <Link href={`/admin/materials/${encodeURIComponent(m.id)}/reports`}>
                  <span className="font-medium text-indigo-600 underline">此教材檢舉</span>
                </Link>
                <Link href={`/admin/materials/${encodeURIComponent(m.id)}/activity-logs`}>
                  <span className="font-medium text-indigo-600 underline">此教材活動紀錄</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

