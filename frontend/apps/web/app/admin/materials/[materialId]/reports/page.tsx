"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button, EmptyState, ErrorState, LoadingState, SelectField } from "@teaching-platform/ui";
import Link from "next/link";
import type { Report } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待處理", value: "pending" },
  { label: "已處理", value: "reviewed" },
];

const sourceOptions = [
  { label: "GET /admin/materials/{id}/reports", value: "admin" },
  { label: "GET /materials/{id}/reports", value: "materials" },
];

function reportStatusLabel(status?: string): string {
  if (status === "pending") return "待處理";
  if (status === "reviewed") return "已處理";
  return status ?? "未知";
}

export default function AdminMaterialReportsPage() {
  const params = useParams();
  const materialId = String(params.materialId ?? "").trim();

  const [apiSource, setApiSource] = useState<"admin" | "materials">("admin");
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const query = useMemo(() => {
    const base =
      apiSource === "admin"
        ? `admin/materials/${encodeURIComponent(materialId)}/reports`
        : `materials/${encodeURIComponent(materialId)}/reports`;
    if (status === "all") return base;
    return `${base}?status=${encodeURIComponent(status)}`;
  }, [apiSource, materialId, status]);

  const load = useCallback(async () => {
    if (!materialId) return;
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
  }, [materialId, query]);

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

  if (!materialId) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        <p className="text-sm text-slate-600">缺少教材 ID。</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">教材檢舉紀錄</h1>
      <p className="text-sm text-slate-600">教材 ID：{materialId}。兩種後端路徑回傳相同列表，可於下方切換驗證。</p>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/materials">
          <span className="font-medium text-indigo-600 underline">← 返回教材列表</span>
        </Link>
        <Link href={`/admin/materials/${encodeURIComponent(materialId)}/activity-logs`}>
          <span className="font-medium text-indigo-600 underline">此教材的活動紀錄</span>
        </Link>
        <Link href="/admin/reports">
          <span className="font-medium text-indigo-600 underline">全部檢舉</span>
        </Link>
      </div>

      <SelectField
        id="mat-report-api-source"
        label="資料來源（後端路徑）"
        value={apiSource}
        options={sourceOptions}
        onValueChange={(v) => setApiSource(v === "materials" ? "materials" : "admin")}
      />
      <SelectField id="mat-report-status" label="狀態篩選" value={status} options={statusOptions} onValueChange={setStatus} />

      {loading ? <LoadingState title="載入檢舉中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="沒有檢舉資料" description="此教材目前沒有符合篩選條件的檢舉。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((r) => (
            <article key={r.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">檢舉 {r.id}</p>
              <p className="text-sm text-slate-700">狀態：{reportStatusLabel(r.status)}</p>
              {r.reason ? <p className="text-xs text-slate-500">原因：{r.reason}</p> : null}
              {r.reporter_id ? <p className="text-xs text-slate-500">檢舉人：{r.reporter_id}</p> : null}
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={r.status === "reviewed" || reviewingId !== null}
                  loading={reviewingId === r.id}
                  onPress={() => void markReviewed(r.id)}
                >
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
