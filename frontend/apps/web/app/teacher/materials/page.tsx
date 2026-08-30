"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SelectField, StatusBadge, SurfaceCard } from "@teaching-platform/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Material, MaterialsListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import {
  CREATOR_MATERIAL_STATUSES,
  CREATOR_MATERIAL_STATUS_LABEL,
  canResubmit,
  creatorStatusLabel,
  creatorStatusTone,
} from "../../../lib/material-status";
import { MATERIAL_REVIEW_REASON_LABEL } from "../../../lib/admin-labels";

/**
 * 狀態選項與文案全部來自 `lib/material-status.ts`（創作者視角）。
 *
 * **「草稿」已移除**：`materials.status` 沒有 `draft` 這個值
 * （DB CHECK 只有 pending_review / published / changes_requested / unpublished），
 * 舊版的草稿篩選與統計卡是一個永遠 0 筆的幽靈選項。要做草稿需要 schema 決策。
 */
const statusOptions = [
  { label: "全部", value: "all" },
  ...CREATOR_MATERIAL_STATUSES.map((status) => ({
    label: CREATOR_MATERIAL_STATUS_LABEL[status],
    value: status,
  })),
];

const ALLOWED_STATUS_FILTERS = new Set<string>(["all", ...CREATOR_MATERIAL_STATUSES]);

const PAGE_SIZE = 8;

function getStatusLabel(status?: string): string {
  return creatorStatusLabel(status);
}

function getStatusTone(status?: string): "info" | "success" | "warning" | "error" {
  return creatorStatusTone(status);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
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
    setStatusFilter(fromQuery && ALLOWED_STATUS_FILTERS.has(fromQuery) ? fromQuery : "all");
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
    const changesRequested = items.filter((item) => item.status === "changes_requested").length;
    const pending = items.filter((item) => item.status === "pending_review").length;
    const published = items.filter((item) => item.status === "published").length;
    const unpublished = items.filter((item) => item.status === "unpublished").length;
    return { changesRequested, pending, published, unpublished };
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
            {/* 需修改排在最前面：那是**創作者**要動作的狀態 */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">需修改</p>
              <p className="mt-1 text-2xl font-bold text-amber-900">{statusCounts.changesRequested}</p>
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
              {pagedItems.map((m, idx) => {
                const needsAction = canResubmit(m.status);
                return (
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
                          <Button size="sm" intent={needsAction ? "flow" : "action"}>
                            {needsAction ? "修改教材" : "編輯"}
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/*
                      需修改：把審核意見直接顯示在列上 —— 創作者不必再點進去才知道要改什麼。
                      顯示的是 materials 上的**最近一次**審核快照（完整歷史在 activity_logs，
                      那是 admin-only 的稽核資料）。刻意不顯示 reviewed_by 這類內部識別碼。
                    */}
                    {m.status === "changes_requested" ? (
                      <div
                        data-testid="creator-changes-requested"
                        className="mx-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                      >
                        <p className="text-xs font-semibold text-amber-800">
                          需修改
                          {m.review_reason_code
                            ? ` ・ ${MATERIAL_REVIEW_REASON_LABEL[m.review_reason_code] ?? m.review_reason_code}`
                            : ""}
                        </p>
                        {m.review_note ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{m.review_note}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-amber-700">審核時間：{formatDateTime(m.reviewed_at)}</p>
                        <p className="mt-1 text-xs text-amber-700">
                          修改完成後，請在編輯頁按「儲存並重新送審」，教材才會回到審核佇列。
                        </p>
                      </div>
                    ) : null}

                    {/*
                      已下架：目前唯一的下架來源是檢舉處置。平台沒有把處置理由存進 materials，
                      因此這裡只說明狀態與下一步，**不編造**下架原因；細節在平台案件頁。
                    */}
                    {m.status === "unpublished" ? (
                      <div
                        data-testid="creator-unpublished"
                        className="mx-3 mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3"
                      >
                        <p className="text-xs font-semibold text-rose-800">已下架</p>
                        <p className="mt-1 text-sm text-rose-900">
                          這份教材已由平台下架，目前買家看不到它。修改後可以重新送審，通過審核才會再次上架。
                        </p>
                        <Link href="/creator/cases" className="mt-1 inline-block text-xs font-medium text-rose-700 underline">
                          查看平台案件
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
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

