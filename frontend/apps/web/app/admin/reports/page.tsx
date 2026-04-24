"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, SelectField } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import type { Report } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待處理", value: "pending" },
  { label: "已處理", value: "reviewed" },
];

function reportStatusLabel(status?: string): string {
  if (status === "pending") return "待處理";
  if (status === "reviewed") return "已處理";
  return status ?? "未知";
}

export default function AdminReportsPage() {
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const query = useMemo(() => {
    if (status === "all") return "admin/reports";
    return `admin/reports?status=${encodeURIComponent(status)}`;
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
      const data = (await res.json()) as Report[];
      setItems(Array.isArray(data) ? data : []);
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

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={1000} width="100%" alignSelf="center">
      <H1 size="$9">檢舉管理</H1>
      <SelectField id="admin-report-status" label="狀態篩選" value={status} options={statusOptions} onValueChange={setStatus} />

      {loading ? <LoadingState title="載入檢舉中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有檢舉資料" description="目前查無符合條件的檢舉。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <YStack gap="$3">
          {items.map((r) => (
            <Card key={r.id} padding="$4" borderWidth={1} borderColor="$borderColor" gap="$2">
              <Paragraph fontWeight="700">檢舉 {r.id}</Paragraph>
              <Paragraph>狀態：{reportStatusLabel(r.status)}</Paragraph>
              {r.material_id ? <Paragraph size="$2">教材 ID：{r.material_id}</Paragraph> : null}
              {r.reason ? <Paragraph size="$2">原因：{r.reason}</Paragraph> : null}
              <XStack>
                <Button size="sm" variant="secondary" disabled={r.status === "reviewed" || reviewingId !== null} loading={reviewingId === r.id} onPress={() => void markReviewed(r.id)}>
                  標記已處理
                </Button>
              </XStack>
            </Card>
          ))}
        </YStack>
      ) : null}

      {message ? <Paragraph color="$orange10">{message}</Paragraph> : null}
    </YStack>
  );
}
