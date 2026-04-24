"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
import { Card, H1, Paragraph, YStack } from "tamagui";
import { Link } from "solito/link";
import type { Order, OrdersListResponse } from "../../lib/api-types";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";

function statusLabel(status: string): string {
  if (status === "pending_payment") return "待付款";
  if (status === "paid") return "已付款";
  if (status === "cancelled") return "已取消";
  return status;
}

export default function OrdersPage() {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("orders/my");
      if (res.status === 401) {
        setError("請重新登入。");
        setItems([]);
        return;
      }
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as OrdersListResponse;
      setItems(data.items ?? []);
    } catch {
      setError("無法連線至伺服器。");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  if (!hydrated) {
    return (
      <YStack padding="$4" maxWidth={800} alignSelf="center" width="100%">
        <H1>我的訂單</H1>
        <LoadingState title="載入中…" />
      </YStack>
    );
  }

  if (!token) {
    return (
      <YStack padding="$4" maxWidth={800} alignSelf="center" width="100%">
        <H1>我的訂單</H1>
        <EmptyState
          title="請先登入"
          description="登入後可查看訂單。"
          actionLabel="前往登入"
          onAction={() => {
            window.location.href = `/login?redirect=${encodeURIComponent("/orders")}`;
          }}
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={800} width="100%" alignSelf="center">
      <H1>我的訂單</H1>

      {loading ? <LoadingState title="載入訂單…" /> : null}
      {!loading && error ? (
        <ErrorState title="無法載入訂單" description={error} onRetry={() => void load()} />
      ) : null}

      {!loading && !error && items.length === 0 ? <EmptyState title="尚無訂單" description="結帳後會出現在此。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <YStack gap="$3">
          {items.map((o) => (
            <Card key={o.id} padding="$4" borderWidth={1} borderColor="$borderColor" gap="$2">
              <Paragraph fontWeight="700">訂單 {o.id}</Paragraph>
              <Paragraph>狀態：{statusLabel(o.status)}</Paragraph>
              <Paragraph>
                金額：NT$ {Math.floor(Number(o.total_amount ?? o.total_price ?? 0))}
              </Paragraph>
              <Link href={`/orders/${encodeURIComponent(o.id)}/upload-proof`}>
                <Paragraph color="$blue10" textDecorationLine="underline">
                  上傳付款憑證
                </Paragraph>
              </Link>
            </Card>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
