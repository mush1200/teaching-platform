"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, InputField } from "@teaching-platform/ui";
import { Card, H1, Paragraph, YStack } from "tamagui";
import { Link } from "solito/link";
import type { DownloadLinkResponse } from "../../lib/api-types";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";

const STORAGE_PENDING = "tp_pending_downloads";

type PendingRow = { material_id: string; material_title?: string };

export default function DownloadsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [manualId, setManualId] = useState("");
  const [results, setResults] = useState<Record<string, { url?: string; error?: string }>>({});

  const refreshPending = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_PENDING);
      if (!raw) {
        setPending([]);
        return;
      }
      const parsed = JSON.parse(raw) as PendingRow[];
      setPending(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
    refreshPending();
  }, [refreshPending]);

  const keys = useMemo(() => pending.map((p) => p.material_id), [pending]);

  async function fetchLink(materialId: string) {
    if (!token) return;
    setResults((r) => ({ ...r, [materialId]: { error: undefined, url: undefined } }));
    try {
      const res = await apiFetch(`download/${encodeURIComponent(materialId)}`);
      if (!res.ok) {
        const err = await parseApiErrorMessage(res);
        setResults((r) => ({ ...r, [materialId]: { error: err } }));
        return;
      }
      const data = (await res.json()) as DownloadLinkResponse;
      setResults((r) => ({ ...r, [materialId]: { url: data.signedUrl } }));
    } catch {
      setResults((r) => ({ ...r, [materialId]: { error: "連線失敗" } }));
    }
  }

  async function fetchManual() {
    const id = manualId.trim();
    if (!id) return;
    await fetchLink(id);
  }

  if (!hydrated) {
    return (
      <YStack padding="$4" maxWidth={720} alignSelf="center" width="100%">
        <H1>下載</H1>
        <Paragraph color="$color11">載入中…</Paragraph>
      </YStack>
    );
  }

  if (!token) {
    return (
      <YStack padding="$4" maxWidth={720} alignSelf="center" width="100%">
        <H1>下載</H1>
        <EmptyState
          title="請先登入"
          description="下載授權需登入後由伺服器驗證購買紀錄。"
          actionLabel="前往登入"
          onAction={() => {
            window.location.href = `/login?redirect=${encodeURIComponent("/downloads")}`;
          }}
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={720} width="100%" alignSelf="center">
      <H1>取得下載連結</H1>
      <Paragraph color="$color11">
        若訂單已付款並通過審核，可在此取得教材檔案的簽名下載網址。剛結帳的項目會暫存在此頁清單（僅本機瀏覽器）。
      </Paragraph>

      {keys.length === 0 ? (
        <EmptyState
          title="沒有待下載清單"
          description="結帳成功後會自動帶入教材，或於下方手動輸入教材 ID。"
        />
      ) : (
        <YStack gap="$3">
          {pending.map((row) => (
            <Card key={row.material_id} padding="$4" borderWidth={1} borderColor="$borderColor" gap="$2">
              <Paragraph fontWeight="700">{row.material_title ?? row.material_id}</Paragraph>
              <Paragraph size="$2" color="$color10">
                ID：{row.material_id}
              </Paragraph>
              <Button size="sm" variant="secondary" onPress={() => void fetchLink(row.material_id)}>
                取得下載連結
              </Button>
              {results[row.material_id]?.url ? (
                <Paragraph>
                  <strong>連結：</strong>{" "}
                  <a href={results[row.material_id]?.url} target="_blank" rel="noreferrer">
                    開啟下載
                  </a>
                </Paragraph>
              ) : null}
              {results[row.material_id]?.error ? (
                <Paragraph color="$orange10">{results[row.material_id]?.error}</Paragraph>
              ) : null}
            </Card>
          ))}
        </YStack>
      )}

      <Card padding="$4" borderWidth={1} borderColor="$borderColor" gap="$3">
        <Paragraph fontWeight="600">手動輸入教材 ID</Paragraph>
        <InputField id="manual-mid" label="教材 ID" value={manualId} onChangeText={setManualId} placeholder="mat_..." />
        <Button variant="secondary" onPress={() => void fetchManual()}>
          查詢下載連結
        </Button>
        {manualId.trim() && results[manualId.trim()]?.url ? (
          <Paragraph>
            <a href={results[manualId.trim()]?.url} target="_blank" rel="noreferrer">
              開啟下載
            </a>
          </Paragraph>
        ) : null}
        {manualId.trim() && results[manualId.trim()]?.error ? (
          <Paragraph color="$orange10">{results[manualId.trim()]?.error}</Paragraph>
        ) : null}
      </Card>

      <Link href="/orders">
        <Paragraph color="$blue10" textDecorationLine="underline">
          查看訂單狀態
        </Paragraph>
      </Link>
    </YStack>
  );
}
