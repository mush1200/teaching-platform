"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState, SelectField } from "@teaching-platform/ui";
import { Card, H1, Paragraph, YStack } from "tamagui";
import type { Order, OrdersListResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待付款", value: "pending_payment" },
  { label: "已付款", value: "paid" },
  { label: "已核准", value: "approved" },
  { label: "已取消", value: "cancelled" },
];

function statusLabel(status: string): string {
  if (status === "pending_payment") return "待付款";
  if (status === "paid") return "已付款";
  if (status === "approved") return "已核准";
  if (status === "cancelled") return "已取消";
  return status;
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    if (status === "all") return "admin/orders";
    return `admin/orders?status=${encodeURIComponent(status)}`;
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
      const data = (await res.json()) as OrdersListResponse;
      setItems(data.items ?? []);
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

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={1000} width="100%" alignSelf="center">
      <H1 size="$9">管理員訂單列表</H1>
      <SelectField id="admin-order-status" label="狀態篩選" value={status} options={statusOptions} onValueChange={setStatus} />

      {loading ? <LoadingState title="載入訂單中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有訂單資料" description="目前查無符合條件的訂單。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <YStack gap="$3">
          {items.map((o) => (
            <Card key={o.id} padding="$4" borderWidth={1} borderColor="$borderColor" gap="$2">
              <Paragraph fontWeight="700">訂單 {o.id}</Paragraph>
              <Paragraph>狀態：{statusLabel(o.status)}</Paragraph>
              <Paragraph>金額：NT$ {Math.floor(Number(o.total_amount ?? o.total_price ?? 0))}</Paragraph>
            </Card>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
