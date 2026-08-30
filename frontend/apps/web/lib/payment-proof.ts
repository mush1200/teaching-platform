import { apiFetch, parseApiErrorMessage } from "./api-client";

/**
 * 付款憑證影像的安全取得方式。
 *
 * ## 為什麼不能直接 `<img src={...}>`
 *
 * 憑證是敏感交易檔案，讀取端點要求 `Authorization: Bearer`（Admin 或訂單擁有者）。
 * 而 **HTML 的 `<img>` 不會帶 Authorization header** —— 瀏覽器對子資源請求只會帶
 * cookie，而這個平台的授權來源是 localStorage 裡的 JWT，不是 cookie
 * （`tp_role` cookie 只是 UX hint，不能拿來授權，見 CLAUDE.md §3）。
 *
 * 因此走 **blob fetch**：用 `apiFetch`（會自動帶上 JWT，並經由 same-origin 的
 * `/api/backend/[...path]` proxy 串流二進位）取回位元組，轉成 object URL 再交給
 * `<img>`。這條路徑不需要新增任何 cookie auth、view token 或第二個 proxy。
 *
 * ## 用完一定要 revoke
 *
 * object URL 會讓整張圖留在分頁的記憶體裡直到被釋放。Admin 審核會連續看很多張，
 * 不釋放就是一路累積 —— 所以每個呼叫端都必須在切換／卸載時呼叫
 * `revokeProofObjectUrl()`（React 的 `useEffect` cleanup）。
 */

/** 憑證影像的受保護讀取路徑。與 Backend 的 `proof_file_path` 是同一條路徑。 */
export function paymentProofFilePath(orderId: string, proofId: string): string {
  return `orders/${encodeURIComponent(orderId)}/payment-proofs/${encodeURIComponent(proofId)}/file`;
}

/**
 * 取回一張憑證影像並轉成 object URL。
 *
 * @throws 帶著後端訊息的 Error（403 不是你的訂單 / 409 legacy 憑證沒有影像 / 503 儲存後端）
 */
export async function fetchPaymentProofObjectUrl(
  orderId: string,
  proofId: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const res = await apiFetch(paymentProofFilePath(orderId, proofId), {
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  return URL.createObjectURL(await res.blob());
}

export function revokeProofObjectUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}

/**
 * 下載原始憑證檔（Admin 需要留存或轉交時）。
 *
 * `?download=1` 讓後端改用 `Content-Disposition: attachment`，**並且**寫一筆
 * `payment_proof_downloaded` 稽核 —— 單純的 inline 預覽不寫，否則每次載入
 * `<img>` 都留一筆會把 activity log 淹掉。
 */
export async function downloadPaymentProof(
  orderId: string,
  proofId: string,
  filename?: string | null
): Promise<void> {
  const res = await apiFetch(`${paymentProofFilePath(orderId, proofId)}?download=1`);
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "payment-proof";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
