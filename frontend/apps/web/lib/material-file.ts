import { apiFetch, parseApiErrorMessage } from "./api-client";

/**
 * 教材**本體**檔案（買家付費取得的商品）。
 *
 * 與 `upload-material-media.ts` 的差別是根本性的：行銷素材上傳完會得到一個公開 URL，
 * 教材本體上傳完只會得到一個 `fileId` —— 它不是位址，任何人拿到都下載不了東西。
 * 檔案存在後端的私有目錄，只有通過購買授權或 Admin 審核才會被交付。
 *
 * 這些常數與後端 `utils/materialFilePolicy.js` 對應。前端這一份的作用只有
 * **提早給使用者回饋**（在按下上傳之前就知道選錯檔）；真正的把關一律在後端，
 * 包含前端無法檢查的 magic bytes。
 */

/** `<input type="file" accept>` 用。與後端 allowlist 對應。 */
export const MATERIAL_FILE_ACCEPT = [
  ".pdf",
  ".zip",
  ".pptx",
  ".docx",
  ".xlsx",
  "application/pdf",
  "application/zip",
].join(",");

export const MATERIAL_FILE_EXTENSIONS_LABEL = "PDF、ZIP、PPTX、DOCX、XLSX";

/** 與後端 `MAX_MATERIAL_FILE_BYTES` 的預設值一致。 */
export const MATERIAL_FILE_MAX_BYTES = 100 * 1024 * 1024;
export const MATERIAL_FILE_MAX_LABEL = "100 MB";

/**
 * 檔案形狀的 canonical 定義在 `api-types.ts`（與 Backend 契約放在一起）。
 * 這裡只轉出，避免同一個形狀在兩個檔案各寫一份而慢慢長歪。
 */
export type { MaterialFileInfo, MaterialFileSummary } from "./api-types";

export type UploadedMaterialFile = {
  fileId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

/** 人看得懂的檔案大小。教材動輒數十 MB，位元組數對使用者沒有意義。 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 上傳一份教材本體檔案。
 *
 * 回傳 `fileId` 而不是 URL —— 之後在建立教材（`POST /materials`）或更換檔案
 * （`POST /materials/:id/file`）時把它交出去，才會被認領成待審候選檔。
 * 沒有被認領的上傳會在 24 小時後由維運腳本清掉。
 */
export async function uploadMaterialFile(file: File): Promise<UploadedMaterialFile> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch("teacher/uploads/material-file", { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res));
  }
  const data = (await res.json()) as Partial<UploadedMaterialFile>;
  if (!data.fileId) {
    throw new Error("上傳回應格式異常");
  }
  return {
    fileId: data.fileId,
    originalFilename: data.originalFilename ?? file.name,
    mimeType: data.mimeType ?? "",
    sizeBytes: Number(data.sizeBytes ?? file.size),
  };
}
