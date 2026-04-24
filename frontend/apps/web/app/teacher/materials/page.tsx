"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SelectField, StatusBadge, SurfaceCard } from "@teaching-platform/ui";
import { H1, Paragraph, Separator, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import type { Material, MaterialsListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "審核中", value: "pending_review" },
  { label: "已上架", value: "published" },
  { label: "已下架", value: "unpublished" },
];

const PAGE_SIZE = 8;

function getStatusLabel(status?: string): string {
  if (status === "pending_review") return "審核中";
  if (status === "published") return "已上架";
  if (status === "unpublished") return "已下架";
  return "未設定";
}

function getStatusTone(status?: string): "info" | "success" | "warning" | "error" {
  if (status === "published") return "success";
  if (status === "pending_review") return "info";
  if (status === "unpublished") return "warning";
  return "error";
}

export default function TeacherMaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("materials");
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

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={1100} width="100%" alignSelf="center">
      <YStack gap="$2">
        <H1 size="$9">教師教材管理</H1>
        <Paragraph color="$color11">管理你的教材內容，並追蹤目前上架與審核狀態。</Paragraph>
      </YStack>

      <SurfaceCard title="篩選與操作" description="可先依狀態篩選，再進行編輯。">
        <XStack gap="$3" flexWrap="wrap" alignItems="flex-end" justifyContent="space-between">
          <YStack minWidth={220} flex={1}>
            <SelectField id="teacher-material-status" label="狀態" value={statusFilter} options={statusOptions} onValueChange={setStatusFilter} />
          </YStack>
          <Link href="/teacher/materials/new">
            <Button>新增教材</Button>
          </Link>
        </XStack>
      </SurfaceCard>

      {loading ? <LoadingState title="教材載入中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && filteredItems.length === 0 ? (
        <EmptyState title="目前沒有教材" description="可先新增一筆教材，或調整狀態篩選條件。" />
      ) : null}

      {!loading && !error && filteredItems.length > 0 ? (
        <SurfaceCard title="教材列表" description={`共 ${totalItems} 筆`}>
          <YStack gap="$3" width="100%">
            <Pagination page={currentPage} totalPages={totalPages} totalItems={totalItems} onPageChange={setCurrentPage} />
            <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$3" overflow="hidden">
              {pagedItems.map((m, idx) => (
                <YStack key={m.id}>
                  {idx > 0 ? <Separator /> : null}
                  <XStack padding="$3" gap="$3" justifyContent="space-between" alignItems="center" flexWrap="wrap">
                    <YStack gap="$1" minWidth={220} flex={1}>
                      <Paragraph fontWeight="700">{m.title}</Paragraph>
                      <Paragraph size="$2" color="$color10">
                        編號：{m.id}
                      </Paragraph>
                      <Paragraph size="$2" color="$color10">
                        價格：NT$ {Math.floor(Number(m.price) || 0)}
                      </Paragraph>
                    </YStack>
                    <XStack gap="$2" alignItems="center" flexWrap="wrap">
                      <StatusBadge tone={getStatusTone(m.status)} label={getStatusLabel(m.status)} />
                      <Link href={`/teacher/materials/${encodeURIComponent(m.id)}/edit`}>
                        <Button size="sm" variant="secondary">
                          編輯
                        </Button>
                      </Link>
                    </XStack>
                  </XStack>
                </YStack>
              ))}
            </YStack>
          </YStack>
        </SurfaceCard>
      ) : null}
    </YStack>
  );
}

