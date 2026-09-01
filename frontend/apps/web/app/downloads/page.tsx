"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@teaching-platform/ui";
import { Button } from "../../components/ui/Button";
import {
  AccountPageHeader,
  CountBadge,
  LibraryGridSkeleton,
  QueryErrorBanner,
} from "../../components/account/ProductAccountChrome";
import { SurfaceCard } from "../../components/ds";
import type { DownloadLinkResponse, MyLibraryItem, MyLibraryResponse } from "../../lib/api-types";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";

function formatDate(iso: string | null | undefined): string | null {
  if (!iso || iso === "-") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 加分的相對更新提示：僅在近日內顯示，其餘仍用完整日期 */
function formatUpdateHint(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days === 0) return "今日曾更新";
  if (days === 1) return "昨日曾更新";
  if (days > 0 && days < 7) return `${days} 天內曾更新`;
  return null;
}

const pageBg = "min-h-dvh bg-ds-page";

export default function DownloadsPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<MyLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    const t = getStoredToken();
    if (!t) return;
    setLoading(true);
    setListError(null);
    try {
      const res = await apiFetch("me/materials");
      if (!res.ok) {
        setListError(await parseApiErrorMessage(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as MyLibraryResponse;
      setItems(data.items ?? []);
    } catch {
      setListError("無法載入教材清單，請稍後再試。");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadLibrary();
  }, [token, loadLibrary]);

  async function handleDownload(materialId: string) {
    if (!token) return;
    setDownloadingId(materialId);
    setDownloadError((prev) => ({ ...prev, [materialId]: "" }));
    try {
      const res = await apiFetch(`download/${encodeURIComponent(materialId)}`);
      if (!res.ok) {
        const err = await parseApiErrorMessage(res);
        setDownloadError((prev) => ({ ...prev, [materialId]: err }));
        return;
      }
      const data = (await res.json()) as DownloadLinkResponse;
      if (!data.signedUrl) {
        setDownloadError((prev) => ({ ...prev, [materialId]: "下載連結取得失敗，請稍後再試。" }));
        return;
      }
      /*
       * 用隱藏的 <a download> 觸發，而不是 window.open。
       *
       * 回應帶 `Content-Disposition: attachment`，所以瀏覽器不會離開目前頁面；
       * 新分頁的做法會被彈出視窗攔截器擋掉，而且成功時也只是閃過一個空白分頁。
       */
      const anchor = document.createElement("a");
      anchor.href = data.signedUrl;
      if (data.filename) anchor.download = data.filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setDownloadError((prev) => ({ ...prev, [materialId]: "連線失敗" }));
    } finally {
      setDownloadingId(null);
    }
  }

  if (!hydrated) {
    return (
      <section className={`${pageBg} px-4 py-8 pb-16 md:px-6 md:pb-12`}>
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 h-24 animate-pulse rounded-ds-card bg-ds-surface/80 shadow-ds-card-soft" />
          <LibraryGridSkeleton />
        </div>
      </section>
    );
  }

  if (!token) {
    return (
      <section className={`${pageBg} px-4 py-8 pb-16 md:px-6`}>
        <div className="mx-auto max-w-6xl">
          <AccountPageHeader title="我的教材" description="登入後即可瀏覽已購買並取得授權的教材。" />
          <div className="mt-10">
            <EmptyState
              title="請先登入"
              description="我們會依你的帳號顯示可用教材，並保護下載授權。"
              actionLabel="前往登入"
              onAction={() => {
                window.location.href = `/login?redirect=${encodeURIComponent("/me/materials")}`;
              }}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${pageBg} px-4 py-8 pb-20 md:px-6 md:pb-14`}>
      <div className="mx-auto max-w-6xl">
        <AccountPageHeader
          title="我的教材"
          description="你已購買並取得授權的教材都會顯示於此。建議先從「查看教材」瀏覽內容，需要檔案時再下載。"
          badge={
            !loading && !listError && items.length > 0 ? (
              <CountBadge>
                共 {items.length} 項
              </CountBadge>
            ) : null
          }
        />

        <div className="mt-10 space-y-8">
          {loading ? <LibraryGridSkeleton /> : null}

          {!loading && listError ? (
            <QueryErrorBanner message={listError} onRetry={() => void loadLibrary()} />
          ) : null}

          {!loading && !listError && items.length === 0 ? (
            <SurfaceCard elevation="flat" className="p-2">
              <EmptyState
                title="尚未擁有教材"
                description="完成購買並通過審核後，教材會自動出現在這裡。"
                actionLabel="前往探索教材"
                onAction={() => {
                  window.location.href = "/explore";
                }}
              />
            </SurfaceCard>
          ) : null}

          {!loading && !listError && items.length > 0 ? (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const purchased = formatDate(item.purchasedAt);
                const updated = formatDate(item.materialUpdatedAt);
                const updateHint = formatUpdateHint(item.materialUpdatedAt);
                const href = `/materials/${encodeURIComponent(item.materialId)}`;
                const cover = item.coverImageUrl?.trim();
                return (
                  <li key={item.materialId}>
                    <article className="group flex h-full flex-col overflow-hidden rounded-ds-card border border-ds-border bg-ds-surface shadow-ds-card transition duration-300 hover:-translate-y-1 hover:border-ds-borderStrong hover:shadow-ds-card-hover focus-within:ring-2 focus-within:ring-edu-primary/25 focus-within:ring-offset-2 focus-within:ring-offset-ds">
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-[#eef0ff] to-[#e8ecff]">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote creator uploads
                          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ds-textSubtle" aria-hidden>
                            <span className="text-3xl">📚</span>
                            <span className="text-xs font-medium">尚未設定封面</span>
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition group-hover:opacity-100" />
                      </div>

                      <div className="flex flex-1 flex-col p-5 pt-5">
                        <h2 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-tight text-ds-heading">{item.title}</h2>
                        <p className="mt-1.5 text-[13px] leading-snug text-ds-textMuted">
                          {item.authorName?.trim() ? item.authorName : "授課創作者"}
                        </p>

                        <dl className="mt-4 space-y-1 border-t border-ds-borderMuted pt-4 text-[12px] leading-relaxed text-ds-textSubtle">
                          {purchased ? (
                            <div className="flex justify-between gap-2">
                              <dt className="shrink-0 text-ds-textSubtle">購買日期</dt>
                              <dd className="text-right font-medium text-ds-textMuted">{purchased}</dd>
                            </div>
                          ) : null}
                          {updated ? (
                            <div className="flex justify-between gap-2">
                              <dt className="shrink-0 text-ds-textSubtle">教材更新</dt>
                              <dd className="text-right font-medium text-ds-textMuted">{updated}</dd>
                            </div>
                          ) : null}
                          {updateHint ? (
                            <p className="pt-0.5 text-[11px] font-medium text-edu-primary/90">{updateHint}</p>
                          ) : null}
                        </dl>

                        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                          <Button intent="flow" fullWidth type="button" onClick={() => router.push(href)}>
                            查看教材
                          </Button>
                          <Button
                            intent="neutral"
                            variant="outline"
                            fullWidth
                            className="border-ds-borderMuted bg-ds-surface text-ds-body hover:border-gray-300 hover:bg-gray-50"
                            type="button"
                            onClick={() => router.push(`/me/materials/${encodeURIComponent(item.materialId)}/feedback`)}
                          >
                            分享教學回饋
                          </Button>
                          <Button
                            intent="neutral"
                            variant="outline"
                            fullWidth
                            className="border-ds-borderMuted bg-ds-surface text-ds-body hover:border-gray-300 hover:bg-gray-50"
                            disabled={downloadingId === item.materialId}
                            type="button"
                            onClick={() => void handleDownload(item.materialId)}
                          >
                            {downloadingId === item.materialId ? "準備檔案中…" : "下載教材"}
                          </Button>
                        </div>
                        {downloadError[item.materialId] ? (
                          <p className="mt-3 text-xs font-medium text-rose-600" role="alert">
                            {downloadError[item.materialId]}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
