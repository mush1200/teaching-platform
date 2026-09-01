import { apiFetch, parseApiErrorMessage } from "./api-client";

/**
 * 申訴證據附件的安全取得方式（P1-09 Gate 4 / `N3`，Wave 2 #13）。
 *
 * ## 為什麼不能直接 `<a href>` / `<img src>`
 *
 * 與付款憑證同一個理由（見 `lib/payment-proof.ts`）：讀取端點要求
 * `Authorization: Bearer`，而 **HTML 的子資源請求不會帶 Authorization header** ——
 * 瀏覽器只會帶 cookie，而這個平台的授權來源是 localStorage 裡的 JWT
 * （`tp_role` cookie 只是 UX hint，不能拿來授權，見 CLAUDE.md §3）。
 *
 * 因此走 **blob fetch**：`apiFetch` 自動帶上 JWT，經 same-origin 的
 * `/api/backend/[...path]` proxy 串流二進位，取回位元組後轉成 object URL。
 * **token 永遠不進 query string、不進 DOM、不進任何公開 URL。**
 *
 * ## 兩個 scope，同一個 resolver
 *
 * Buyer 與 Admin 走不同路由（各自的 router 有各自的授權中介層），
 * 但 backend 兩邊呼叫的是**同一個** `resolveEvidenceForAccess`，
 * 因此授權判斷只有一份。前端這裡的 `scope` 只決定打哪一條路徑。
 */
export type EvidenceScope = "buyer" | "admin";

/** 證據附件的受保護讀取路徑。 */
export function complaintEvidenceFilePath(
  scope: EvidenceScope,
  complaintId: string,
  evidenceId: string
): string {
  const base = scope === "admin" ? "admin/complaints" : "me/complaints";
  return `${base}/${encodeURIComponent(complaintId)}/evidence/${encodeURIComponent(evidenceId)}/file`;
}

/**
 * 取回一份證據附件並轉成 object URL（供 `<img>` 預覽或新分頁開啟）。
 *
 * 呼叫端**必須**在切換／卸載時 `revokeComplaintEvidenceObjectUrl()`，
 * 否則 object URL 會讓整個檔案留在分頁記憶體裡直到頁面關閉。
 *
 * @throws 帶著後端訊息的 Error
 *   （403 不是你的申訴 / 404 綁定不符 / 409 這筆只有文字沒有附件 / 503 儲存後端）
 */
export async function fetchComplaintEvidenceObjectUrl(
  scope: EvidenceScope,
  complaintId: string,
  evidenceId: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const res = await apiFetch(complaintEvidenceFilePath(scope, complaintId, evidenceId), {
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  return URL.createObjectURL(await res.blob());
}

export function revokeComplaintEvidenceObjectUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}

/**
 * 下載原始證據檔。
 *
 * `?download=1` 讓後端改用 `Content-Disposition: attachment`，**並且**寫一筆
 * `complaint_evidence_downloaded` 稽核 —— 單純的 inline 預覽不寫，
 * 否則每次載入預覽都留一筆，會把真正重要的「有人把原始證據取走了」淹掉。
 */
export async function downloadComplaintEvidence(
  scope: EvidenceScope,
  complaintId: string,
  evidenceId: string,
  filename?: string | null
): Promise<void> {
  const res = await apiFetch(
    `${complaintEvidenceFilePath(scope, complaintId, evidenceId)}?download=1`
  );
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "complaint-evidence";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 人看得懂的檔案大小。`null` / 0 一律回 `null`，不顯示「0 B」誤導。 */
export function formatEvidenceSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
