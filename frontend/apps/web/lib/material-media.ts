import { apiFetch, parseApiErrorMessage } from "./api-client";

/**
 * 教材行銷素材（封面／詳情圖／試看影片）的取得方式。
 *
 * ## 為什麼不能一律 `<img src={url}>`
 *
 * 素材搬進私有儲存之後（`SEC-02`），交付端點 `GET /materials/media/:mediaId` 是
 * **條件公開**的：
 *
 *   已上架教材的素材      → 匿名可取。公開商品頁維持普通的 `<img src>`，不需要改。
 *   未上架／已下架／未認領 → 401 / 403。而 **HTML 的 `<img>` 不會帶 Authorization
 *                            header** —— 瀏覽器對子資源請求只會帶 cookie，而這個平台
 *                            的授權來源是 localStorage 裡的 JWT（`tp_role` cookie 只是
 *                            UX hint，不能拿來授權，見 CLAUDE.md §3）。
 *
 * 因此**只有創作者與 Admin 的介面**（編輯表單、審核面板）需要 blob fetch：用
 * `apiFetch`（會自動帶 JWT，並經由 same-origin 的 `/api/backend/[...path]` proxy
 * 串流二進位）取回位元組，轉成 object URL 再交給 `<img>`。這與 `lib/payment-proof.ts`
 * 是同一條路徑，不需要新增任何 cookie auth、view token 或第二個 proxy。
 *
 * ## 用完一定要 revoke
 *
 * object URL 會讓整張圖留在分頁的記憶體裡直到被釋放。審核者會連續看很多份教材，
 * 不釋放就是一路累積 —— 所以取用端必須在切換／卸載時 revoke（見 `MediaImage`）。
 */

/** 平台素材交付路徑的形狀。id 是 UUID（`material_media_files.id`）。 */
const MEDIA_PATH_PATTERN = /\/materials\/media\/([0-9a-fA-F-]{36})\/?$/;

/**
 * 這個 URL 是不是平台自己的素材？
 *
 * 只看 path 不看 host —— 後端在本機是 `localhost:3000`、部署時是 `PUBLIC_BACKEND_URL`，
 * 拿 host 當判斷依據會讓同一筆資料換環境後突然被當成外部連結。
 * 外部 CDN 連結是合法用法（表單明說可以手動貼），它們走普通 `<img src>`。
 */
export function isPlatformMediaUrl(url: string | null | undefined): boolean {
  return parseMediaId(url) !== null;
}

export function parseMediaId(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const withoutQuery = url.split("?")[0].split("#")[0];
  const match = MEDIA_PATH_PATTERN.exec(withoutQuery);
  return match ? match[1].toLowerCase() : null;
}

/** 受保護的素材讀取路徑（給 `apiFetch` 用，相對於 API base）。 */
export function materialMediaFilePath(mediaId: string): string {
  return `materials/media/${encodeURIComponent(mediaId)}`;
}

/**
 * 取回一份素材並轉成 object URL。
 *
 * @throws 帶著後端訊息的 Error（401 尚未公開需登入 / 403 不是你的素材 / 503 儲存後端）
 */
export async function fetchMaterialMediaObjectUrl(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const mediaId = parseMediaId(url);
  if (!mediaId) throw new Error("不是平台素材連結");
  const res = await apiFetch(materialMediaFilePath(mediaId), { signal: options?.signal });
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  return URL.createObjectURL(await res.blob());
}

export function revokeMediaObjectUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}
