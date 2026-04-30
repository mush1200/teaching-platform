import { apiFetch, parseApiErrorMessage } from "./api-client";

export type MaterialMediaKind = "cover" | "detail" | "demo";

/** Teacher-only: POST multipart `file` → `{ url }` served from backend `/uploads/...`. */
export async function uploadMaterialMedia(file: File, kind: MaterialMediaKind): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(`teacher/uploads/material-media?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url || typeof data.url !== "string") {
    throw new Error("上傳回應格式異常");
  }
  return data.url;
}
