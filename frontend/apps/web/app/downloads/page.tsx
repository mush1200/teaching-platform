"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, InputField } from "@teaching-platform/ui";
import Link from "next/link";
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
      <section className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">下載</h1>
        <p className="mt-2 text-sm text-slate-600">載入中...</p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">下載</h1>
        <EmptyState
          title="請先登入"
          description="下載授權需登入後由伺服器驗證購買紀錄。"
          actionLabel="前往登入"
          onAction={() => {
            window.location.href = `/login?redirect=${encodeURIComponent("/downloads")}`;
          }}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">取得下載連結</h1>
      <p className="text-sm text-slate-600">
        若訂單已付款並通過審核，可在此取得教材檔案的簽名下載網址。剛結帳的項目會暫存在此頁清單（僅本機瀏覽器）。
      </p>

      {keys.length === 0 ? (
        <EmptyState
          title="沒有待下載清單"
          description="結帳成功後會自動帶入教材，或於下方手動輸入教材 ID。"
        />
      ) : (
        <div className="space-y-3">
          {pending.map((row) => (
            <article key={row.material_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{row.material_title ?? row.material_id}</p>
              <p className="mt-1 text-xs text-slate-500">ID：{row.material_id}</p>
              <Button size="sm" variant="secondary" onPress={() => void fetchLink(row.material_id)}>
                取得下載連結
              </Button>
              {results[row.material_id]?.url ? (
                <p className="mt-2 text-sm text-slate-700">
                  <strong>連結：</strong>{" "}
                  <a href={results[row.material_id]?.url} target="_blank" rel="noreferrer">
                    開啟下載
                  </a>
                </p>
              ) : null}
              {results[row.material_id]?.error ? (
                <p className="mt-1 text-sm text-amber-600">{results[row.material_id]?.error}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">手動輸入教材 ID</p>
        <InputField id="manual-mid" label="教材 ID" value={manualId} onChangeText={setManualId} placeholder="mat_..." />
        <Button variant="secondary" onPress={() => void fetchManual()}>
          查詢下載連結
        </Button>
        {manualId.trim() && results[manualId.trim()]?.url ? (
          <p className="text-sm text-slate-700">
            <a href={results[manualId.trim()]?.url} target="_blank" rel="noreferrer">
              開啟下載
            </a>
          </p>
        ) : null}
        {manualId.trim() && results[manualId.trim()]?.error ? (
          <p className="text-sm text-amber-600">{results[manualId.trim()]?.error}</p>
        ) : null}
      </article>

      <Link href="/orders">
        <span className="text-sm font-medium text-indigo-600 underline">查看訂單狀態</span>
      </Link>
    </section>
  );
}
