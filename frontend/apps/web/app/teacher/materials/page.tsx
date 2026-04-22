"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppDialog,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SelectField,
  StatusBadge,
  SurfaceCard,
  Uploader,
} from "@teaching-platform/ui";
import { H1, Paragraph, Separator, XStack, YStack } from "tamagui";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "上架中", value: "published" },
  { label: "審核中", value: "reviewing" },
];

type MaterialStatus = "draft" | "published" | "reviewing";

const PAGE_SIZE = 9;

/** 示範用假資料（之後接上 API 時整段替換） */
const MOCK_MATERIALS: { id: string; title: string; status: MaterialStatus }[] = Array.from(
  { length: 42 },
  (_, i) => ({
    id: String(i + 1),
    title: `示範教材 ${i + 1}`,
    status: (["draft", "published", "reviewing"] as const)[i % 3],
  }),
);

const STATUS_LABEL: Record<MaterialStatus, string> = {
  draft: "草稿",
  published: "上架中",
  reviewing: "審核中",
};

function statusToBadgeTone(status: MaterialStatus): "success" | "warning" | "info" {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "info";
}

export default function TeacherMaterialsPage() {
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  /** 僅「共用狀態元件」示範區塊使用，與上方教材列表載入無關；預設 empty 避免誤以為整頁尚在 loading */
  const [stateMode, setStateMode] = useState<"loading" | "empty" | "error">("empty");

  const filteredMaterials = useMemo(() => {
    if (status === "all") {
      return MOCK_MATERIALS;
    }
    return MOCK_MATERIALS.filter((m) => m.status === status);
  }, [status]);

  const totalItems = filteredMaterials.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const pageMaterials = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMaterials.slice(start, start + PAGE_SIZE);
  }, [filteredMaterials, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [status]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const filteredSummary = useMemo(() => {
    if (status === "all") {
      return "目前顯示全部教材。";
    }
    return `目前篩選狀態：${status}`;
  }, [status]);

  return (
    <YStack minHeight="100vh" padding="$5" gap="$4">
      <H1>Teacher Materials</H1>
      <Paragraph>教師教材管理頁（已受 middleware 保護）。</Paragraph>

      <SurfaceCard title="教材篩選與操作" description={filteredSummary}>
        <YStack gap="$3">
          <SelectField
            id="status-filter"
            label="狀態篩選"
            value={status}
            options={statusOptions}
            onValueChange={setStatus}
            helperText="可用鍵盤選取狀態。"
          />
          <XStack gap="$2" flexWrap="wrap">
            <StatusBadge tone="info" label="info" />
            <StatusBadge tone="success" label="success" />
            <StatusBadge tone="warning" label="warning" />
            <StatusBadge tone="error" label="error" />
          </XStack>
          <Uploader
            onFileSelect={setSelectedFile}
            selectedFileName={selectedFile?.name}
            maxSizeMb={10}
            accept={["pdf", "png", "jpg", "jpeg"]}
          />
          <XStack gap="$2">
            <Button variant="secondary" onPress={() => setDialogOpen(true)}>
              開啟確認視窗
            </Button>
          </XStack>
        </YStack>
      </SurfaceCard>

      <SurfaceCard
        title="教材列表分頁"
        description="示範：假資料 + 分頁與狀態篩選（日後接 API 再替換）"
      >
        <YStack gap="$3" width="100%">
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            onPageChange={setCurrentPage}
            disabled={totalItems === 0}
          />
          {totalItems === 0 ? (
            <EmptyState
              title="此條件下沒有教材"
              description="請改選「全部」或更換狀態篩選。"
            />
          ) : (
            <YStack
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$3"
              overflow="hidden"
            >
              {pageMaterials.map((m, index) => (
                <YStack key={m.id}>
                  {index > 0 ? <Separator /> : null}
                  <XStack
                    padding="$3"
                    justifyContent="space-between"
                    alignItems="center"
                    flexWrap="wrap"
                    gap="$2"
                  >
                    <YStack flex={1} minWidth={200}>
                      <Paragraph fontWeight="600">{m.title}</Paragraph>
                      <Paragraph size="$2" color="$color10">
                        編號 #{m.id}
                      </Paragraph>
                    </YStack>
                    <StatusBadge tone={statusToBadgeTone(m.status)} label={STATUS_LABEL[m.status]} />
                  </XStack>
                </YStack>
              ))}
            </YStack>
          )}
        </YStack>
      </SurfaceCard>

      <SurfaceCard
        title="共用狀態元件驗證"
        description="此區只預覽 LoadingState / EmptyState / ErrorState 長相，與上方教材列表無關；請按 Loading / Empty / Error 切換。"
      >
        <YStack gap="$3">
          <XStack gap="$2">
            <Button variant="secondary" size="sm" onPress={() => setStateMode("loading")}>
              Loading
            </Button>
            <Button variant="secondary" size="sm" onPress={() => setStateMode("empty")}>
              Empty
            </Button>
            <Button variant="secondary" size="sm" onPress={() => setStateMode("error")}>
              Error
            </Button>
          </XStack>
          {stateMode === "loading" ? <LoadingState title="教材資料載入中..." /> : null}
          {stateMode === "empty" ? <EmptyState title="目前沒有教材" description="請先新增教材後再查看列表。" /> : null}
          {stateMode === "error" ? (
            <ErrorState title="教材讀取失敗" description="請稍後再試或重新整理。" errorCode={500} onRetry={() => setStateMode("loading")} />
          ) : null}
        </YStack>
      </SurfaceCard>

      <AppDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="確認送出"
        description="你即將送出教材變更，是否繼續？"
        onConfirm={() => setDialogOpen(false)}
        confirmLabel="確認送出"
        cancelLabel="取消"
      />
    </YStack>
  );
}

