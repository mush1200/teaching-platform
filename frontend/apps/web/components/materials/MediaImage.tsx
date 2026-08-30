"use client";

import { useEffect, useState } from "react";
import {
  fetchMaterialMediaObjectUrl,
  isPlatformMediaUrl,
  revokeMediaObjectUrl,
} from "../../lib/material-media";

type Props = {
  src: string;
  alt: string;
  className?: string;
  /** 傳給 `<img>` 的 `data-testid`，讓既有 E2E 斷言不必改寫。 */
  testId?: string;
};

/**
 * 教材素材的圖片預覽，**給創作者與 Admin 的介面用**。
 *
 * 公開商品頁**不該**用這個元件：已上架教材的素材本來就匿名可取，走普通的
 * `<img src>` 由瀏覽器直接快取即可，套上 blob fetch 只會多繞一圈並失去快取。
 * 這裡處理的是另外那半邊 —— 審核中、已退回、已下架、尚未認領的素材，
 * 它們的交付端點會回 401/403，而 `<img>` 帶不了 Authorization header
 * （理由見 `lib/material-media.ts`）。
 *
 * 外部 CDN 連結（創作者手動貼的）會原樣交給 `<img>`：那不是平台素材，
 * 平台既沒有它的授權資訊，也沒有理由把它 proxy 一遍。
 */
export function MediaImage({ src, alt, className, testId }: Props) {
  const trimmed = src.trim();
  const needsAuth = isPlatformMediaUrl(trimmed);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!needsAuth) return;

    const controller = new AbortController();
    let created: string | null = null;
    setError(null);

    void (async () => {
      try {
        created = await fetchMaterialMediaObjectUrl(trimmed, { signal: controller.signal });
        setObjectUrl(created);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "素材載入失敗");
      }
    })();

    return () => {
      controller.abort();
      // 元件卸載或 src 換掉時一定要釋放，否則連續審核會一路累積整張圖在記憶體裡。
      revokeMediaObjectUrl(created);
      setObjectUrl(null);
    };
  }, [trimmed, needsAuth]);

  if (!needsAuth) {
    /* 外部 CDN 連結：平台沒有它的授權資訊，直接交給瀏覽器 */
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={trimmed} alt={alt} className={className} data-testid={testId} />;
  }

  if (error) {
    return (
      <div
        className={className}
        data-testid={testId ? `${testId}-error` : undefined}
        role="img"
        aria-label={`${alt}（載入失敗）`}
      >
        <p className="p-3 text-xs text-ds-textSubtle">{error}</p>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={className}
        data-testid={testId ? `${testId}-loading` : undefined}
        aria-busy="true"
      />
    );
  }

  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={objectUrl} alt={alt} className={className} data-testid={testId} />;
}

type LinkProps = {
  src: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
};

/**
 * 「開啟素材」連結 —— 給試看影片這類不適合直接內嵌的素材用。
 *
 * 外部連結就是普通的 `<a target="_blank">`。平台素材不行：新分頁的請求同樣帶不了
 * Authorization header，未上架教材的影片會直接 401。因此改成先 blob fetch 再開
 * object URL。
 *
 * **已知代價：** blob fetch 會把整支影片load進記憶體（上限 80 MB）。這條路徑只有
 * Admin 審核與創作者自己會走，且僅在教材尚未上架時才需要 —— 已上架教材的影片
 * 匿名可取，走的是下面的普通連結分支。要在不犧牲授權的前提下支援串流播放，
 * 需要一次性 view token（比照 `material_download_tokens`），那是獨立的一輪工作。
 */
export function MediaLink({ src, children, className, testId }: LinkProps) {
  const trimmed = src.trim();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPlatformMediaUrl(trimmed)) {
    return (
      <a href={trimmed} target="_blank" rel="noreferrer" className={className} data-testid={testId}>
        {children}
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className}
        data-testid={testId}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void (async () => {
            try {
              const objectUrl = await fetchMaterialMediaObjectUrl(trimmed);
              window.open(objectUrl, "_blank", "noopener,noreferrer");
              /*
               * 不能立刻 revoke —— 新分頁還在讀它。交給分頁關閉時的 GC。
               * 這裡刻意不做「N 秒後 revoke」的計時器：猜錯就是使用者看到空白頁。
               */
            } catch (e) {
              setError(e instanceof Error ? e.message : "素材載入失敗");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "載入中…" : children}
      </button>
      {error ? <span className="text-xs text-ds-textSubtle">{error}</span> : null}
    </span>
  );
}
