"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, InputField, LoadingState, Pagination } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import type { ActivityLog, ActivityLogsResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

const PAGE_SIZE = 20;

export default function AdminActivityLogsPage() {
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ActivityLog[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (actorId.trim()) params.set("actor_id", actorId.trim());
    if (action.trim()) params.set("action", action.trim());
    if (targetType.trim()) params.set("target_type", targetType.trim());
    if (targetId.trim()) params.set("target_id", targetId.trim());
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    return `admin/activity-logs?${params.toString()}`;
  }, [actorId, action, targetType, targetId, page]);

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
      const data = (await res.json()) as ActivityLogsResponse;
      const nextItems = data.items ?? [];
      setItems(nextItems);
      const total = data.pagination?.total ?? nextItems.length;
      const pages = data.pagination?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE));
      setTotalItems(total);
      setTotalPages(Math.max(1, pages));
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

  function submitFilter() {
    setPage(1);
    void load();
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={1100} width="100%" alignSelf="center">
      <H1 size="$9">活動紀錄</H1>

      <Card padding="$4" borderWidth={1} borderColor="$borderColor" gap="$3">
        <InputField id="log-actor-id" label="Actor ID" value={actorId} onChangeText={setActorId} placeholder="usr_..." />
        <InputField id="log-action" label="Action" value={action} onChangeText={setAction} placeholder="order.approve" />
        <InputField id="log-target-type" label="Target Type" value={targetType} onChangeText={setTargetType} placeholder="order/material/report" />
        <InputField id="log-target-id" label="Target ID" value={targetId} onChangeText={setTargetId} placeholder="ord_..." />
        <XStack gap="$2" flexWrap="wrap">
          <Button variant="secondary" onPress={submitFilter}>
            套用篩選
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setActorId("");
              setAction("");
              setTargetType("");
              setTargetId("");
              setPage(1);
            }}
          >
            清除篩選
          </Button>
        </XStack>
      </Card>

      {loading ? <LoadingState title="載入活動紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="沒有活動紀錄" description="目前查無符合條件的資料。" /> : null}

      {!loading && !error && items.length > 0 ? (
        <YStack gap="$3">
          <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
          {items.map((log) => (
            <Card key={log.id} padding="$4" borderWidth={1} borderColor="$borderColor" gap="$2">
              <Paragraph fontWeight="700">{log.action ?? "unknown action"}</Paragraph>
              <Paragraph size="$2">紀錄 ID：{log.id}</Paragraph>
              {log.actor_id ? <Paragraph size="$2">操作者：{log.actor_id}</Paragraph> : null}
              {log.actor_role ? <Paragraph size="$2">角色：{log.actor_role}</Paragraph> : null}
              {log.target_type || log.target_id ? (
                <Paragraph size="$2">
                  目標：{log.target_type ?? "-"} / {log.target_id ?? "-"}
                </Paragraph>
              ) : null}
            </Card>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
