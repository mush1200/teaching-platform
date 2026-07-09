"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SelectField, StatusBadge, SurfaceCard } from "@teaching-platform/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Material, MaterialsListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "審核中", value: "pending_review" },
  { label: "已上架", value: "published" },
  { label: "已下架", value: "unpublished" },
];

const PAGE_SIZE = 8;

function getStatusLabel(status?: string): string {
  if (status === "draft") return "草稿";
  if (status === "pending_review") return "審核中";
  if (status === "published") return "已上架";
  if (status === "unpublished") return "已下架";
  return "未設定";
}

function getStatusTone(status?: string): "info" | "success" | "warning" | "error" {
  if (status === "draft") return "warning";
  if (status === "published") return "success";
  if (status === "pending_review") return "info";
  if (status === "unpublished") return "warning";
  return "error";
}

function CreatorMaterialsPageContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [role, setRole] = useState<"parent" | "teacher" | "creator" | "admin" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const view = searchParams.get("view") ?? "workbench";

  useEffect(() => {
    const fromQuery = searchParams.get("status");
    const allowed = new Set(["all", "draft", "pending_review", "published", "unpublished"]);
    setStatusFilter(fromQuery && allowed.has(fromQuery) ? fromQuery : "all");
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let currentRole: "parent" | "teacher" | "creator" | "admin" | null = role;
      let currentMeId: string | null = meId;
      const meRes = await apiFetch("auth/me");
      if (meRes.ok) {
        const mePayload = (await meRes.json()) as { user?: { id?: string; role?: "parent" | "teacher" | "creator" | "admin" } };
        currentMeId = mePayload.user?.id ?? null;
        currentRole = mePayload.user?.role ?? null;
        setMeId(currentMeId);
        setRole(currentRole);
      }
      const res = await apiFetch("materials");
      if (!res.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as MaterialsListResponse;
      const all = data.items ?? [];
      const next =
        (currentRole === "teacher" || currentRole === "creator") && currentMeId
          ? all.filter((m) => m.teacher_id === currentMeId)
          : all;
      setItems(next);
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [meId, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const statusCounts = useMemo(() => {
    const draft = items.filter((item) => item.status === "draft").length;
    const pending = items.filter((item) => item.status === "pending_review").length;
    const published = items.filter((item) => item.status === "published").length;
    const unpublished = items.filter((item) => item.status === "unpublished").length;
    return { draft, pending, published, unpublished };
  }, [items]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{view === "workbench" ? "你的創作者工作台" : "我的教材管理"}</h1>
        <p className="text-sm text-slate-600">
          {view === "workbench"
            ? "快速掌握教材狀態，並前往新增教材、審核追蹤與教學回饋處理。"
            : "管理你的教材內容，並追蹤目前上架與審核狀態。（僅顯示你建立的教材）"}
        </p>
      </div>

      <SurfaceCard title="篩選與操作" description="可先依狀態篩選，再進行編輯。" level="flat">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <SelectField id="teacher-material-status" label="狀態" value={statusFilter} options={statusOptions} onValueChange={setStatusFilter} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/creator/sales?tab=records">
              <Button intent="action">銷售紀錄</Button>
            </Link>
            <Link href="/creator/materials/new">
              <Button intent="flow">新增教材</Button>
            </Link>
          </div>
        </div>
      </SurfaceCard>

      {view === "workbench" ? (
        <SurfaceCard title="教材狀態總覽" description="方便快速查看審核流程進度。" level="default">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">草稿</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.draft}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">待審核</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.pending}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">已發布</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.published}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">已下架</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.unpublished}</p>
            </div>
          </div>
        </SurfaceCard>
      ) : null}

      {view === "reviews" && !loading && !error ? (
        <SurfaceCard title="教材教學回饋捷徑" description="從這裡快速進入各教材教學回饋頁。" level="default">
          {items.length === 0 ? (
            <EmptyState title="目前尚無教材可查看教學回饋" description="新增教材後即可查看使用者教學回饋。" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.map((m) => (
                <Link key={`review-${m.id}`} href={`/creator/materials/${encodeURIComponent(m.id)}/reviews`}>
                  <Button size="sm" intent="action">
                    {m.title}
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </SurfaceCard>
      ) : null}

      {loading ? <LoadingState title="教材載入中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && filteredItems.length === 0 ? (
        <EmptyState title="目前沒有教材" description="可先新增一筆教材，或調整狀態篩選條件。" />
      ) : null}

      {!loading && !error && filteredItems.length > 0 ? (
        <SurfaceCard title="教材列表" description={`共 ${totalItems} 筆`} level="default">
          <div className="space-y-3">
            <Pagination page={currentPage} totalPages={totalPages} totalItems={totalItems} onPageChange={setCurrentPage} />
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              {pagedItems.map((m, idx) => (
                <div key={m.id} className={idx > 0 ? "border-t border-slate-200" : ""}>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-[220px] flex-1 space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500">編號：{m.id}</p>
                      <p className="text-xs text-slate-500">價格：NT$ {Math.floor(Number(m.price) || 0)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={getStatusTone(m.status)} label={getStatusLabel(m.status)} />
                      <Link href={`/creator/materials/${encodeURIComponent(m.id)}/reviews`}>
                        <Button size="sm" intent="action">
                          教材教學回饋
                        </Button>
                      </Link>
                      <Link href={`/creator/materials/${encodeURIComponent(m.id)}/edit`}>
                        <Button size="sm" intent="action">
                          編輯
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      ) : null}
    </section>
  );
}

function CreatorMaterialsPageFallback() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">我的教材管理</h1>
      <p className="text-sm text-slate-600">載入中...</p>
    </section>
  );
}

export default function CreatorMaterialsPage() {
  return (
    <Suspense fallback={<CreatorMaterialsPageFallback />}>
      <CreatorMaterialsPageContent />
    </Suspense>
  );
}

