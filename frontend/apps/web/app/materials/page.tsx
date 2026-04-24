"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import type { Material, MaterialsListResponse } from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";

export default function MaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("materials");
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as MaterialsListResponse;
      setItems(data.items ?? []);
    } catch {
      setError("無法連線至伺服器，請稍後再試。");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={1100} width="100%" alignSelf="center">
      <YStack gap="$2">
        <H1 size="$9">教材列表</H1>
        <Paragraph color="$color11">公開上架教材；點選可查看詳情並加入購物車。</Paragraph>
      </YStack>

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? (
        <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="尚無教材" description="目前沒有符合條件的公開教材。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <XStack flexWrap="wrap" gap="$4" justifyContent="flex-start">
          {items.map((m) => (
            <Link key={m.id} href={`/materials/${encodeURIComponent(m.id)}`}>
              <Card width={320} minHeight={160} padding="$4" borderWidth={1} borderColor="$borderColor" hoverStyle={{ borderColor: "$gray8" }}>
                <YStack gap="$2">
                  <Paragraph fontWeight="700" numberOfLines={2}>
                    {m.title}
                  </Paragraph>
                  {m.description ? (
                    <Paragraph size="$3" color="$color11" numberOfLines={2}>
                      {m.description}
                    </Paragraph>
                  ) : null}
                  <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
                    <Paragraph fontWeight="600">NT$ {Math.floor(Number(m.price) || 0)}</Paragraph>
                    {m.category ? (
                      <Paragraph size="$2" color="$color10">
                        {m.category}
                      </Paragraph>
                    ) : null}
                  </XStack>
                  <Button size="sm" variant="secondary">
                    查看詳情
                  </Button>
                </YStack>
              </Card>
            </Link>
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}
