"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
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
    <YStack flex={1} padding="$4" gap="$4" maxWidth={1100} width="100%" alignSelf="center">
      <H1 size="$9">管理員教材列表</H1>

      <XStack gap="$3" flexWrap="wrap">
        <Link href="/admin/orders">
          <Paragraph color="$blue10" textDecorationLine="underline">
            前往訂單管理
          </Paragraph>
        </Link>
        <Link href="/admin/reports">
          <Paragraph color="$blue10" textDecorationLine="underline">
            前往檢舉管理
          </Paragraph>
        </Link>
      </XStack>

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有教材資料" description="目前查無可管理教材。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <YStack gap="$3">
          {items.map((m) => (
            <Card key={m.id} padding="$4" borderWidth={1} borderColor="$borderColor" gap="$2">
              <Paragraph fontWeight="700">{m.title}</Paragraph>
              <Paragraph size="$2" color="$color10">
                ID：{m.id}
              </Paragraph>
              <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
                <Paragraph>價格：NT$ {Math.floor(Number(m.price) || 0)}</Paragraph>
                <StatusBadge tone={getStatusTone(m.status)} label={getStatusLabel(m.status)} />
              </XStack>
            </Card>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

