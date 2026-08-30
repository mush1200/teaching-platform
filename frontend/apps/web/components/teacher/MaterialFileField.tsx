"use client";

import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import {
  MATERIAL_FILE_ACCEPT,
  MATERIAL_FILE_EXTENSIONS_LABEL,
  MATERIAL_FILE_MAX_BYTES,
  MATERIAL_FILE_MAX_LABEL,
  formatFileSize,
  uploadMaterialFile,
  type MaterialFileSummary,
  type UploadedMaterialFile,
} from "../../lib/material-file";

type Props = {
  /** 這一次已經上傳、等著被送出的檔案（尚未成為候選檔）。 */
  uploaded: UploadedMaterialFile | null;
  onUploaded: (file: UploadedMaterialFile | null) => void;
  /** 教材目前已有的檔案（編輯頁才有）。 */
  summary?: MaterialFileSummary | null;
  /** 目前狀態是否允許更換教材檔案（`materialWorkflow.canReplaceFile`）。 */
  canReplace?: boolean;
  /** 不能更換時的說明 —— 使用者需要知道「為什麼」，而不是只看到一個灰掉的按鈕。 */
  lockedReason?: string;
  disabled?: boolean;
};

/**
 * 教材本體檔案的上傳欄位。
 *
 * ## 與行銷素材的差別
 *
 * 封面照上傳完會得到一個公開 URL，貼到哪裡都能看。教材本體上傳完**只得到一個 id**，
 * 因為它是買家付費才拿得到的商品 —— 前端從頭到尾不會、也不該拿到它的位址。
 *
 * ## 為什麼要顯示「送審後才會生效」
 *
 * 上傳成功不等於買家拿得到。新檔案要等 Admin 核准才會成為交付版本，在那之前
 * 買家下載到的仍是舊檔。這件事如果不寫在畫面上，創作者會以為上傳完就換好了。
 */
export function MaterialFileField({
  uploaded,
  onUploaded,
  summary,
  canReplace = true,
  lockedReason,
  disabled,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const approved = summary?.approvedFile ?? null;
  const pending = summary?.pendingFile ?? null;

  async function handleFile(file: File) {
    setError(null);
    // 後端才是真正的把關，這裡只是讓使用者不用等 100MB 傳完才知道太大。
    if (file.size > MATERIAL_FILE_MAX_BYTES) {
      setError(`檔案超過上限（最大 ${MATERIAL_FILE_MAX_LABEL}）。`);
      return;
    }
    setBusy(true);
    try {
      onUploaded(await uploadMaterialFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "上傳失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="material-file-field">
      <div>
        <p className="text-sm font-medium text-slate-800">教材檔案 *</p>
        <p className="mt-1 text-xs text-slate-500">
          買家購買後實際下載到的檔案。支援 {MATERIAL_FILE_EXTENSIONS_LABEL}，最大 {MATERIAL_FILE_MAX_LABEL}。
          多個檔案請先打包成 ZIP。
        </p>
      </div>

      {approved ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="material-file-approved">
          <p className="font-medium text-slate-800">目前交付中的檔案</p>
          <p className="mt-1 text-slate-600">
            {approved.originalFilename}
            <span className="ml-2 text-xs text-slate-500">{formatFileSize(approved.sizeBytes)}</span>
          </p>
        </div>
      ) : null}

      {pending ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
          data-testid="material-file-pending"
        >
          <p className="font-medium text-amber-900">待審核的檔案</p>
          <p className="mt-1 text-amber-800">
            {pending.originalFilename}
            <span className="ml-2 text-xs text-amber-700">{formatFileSize(pending.sizeBytes)}</span>
          </p>
          <p className="mt-1 text-xs text-amber-700">
            通過審核後才會成為買家下載到的版本；在那之前買家取得的仍是原本的檔案。
          </p>
        </div>
      ) : null}

      {canReplace ? (
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={MATERIAL_FILE_ACCEPT}
            className="hidden"
            data-testid="material-file-input"
            disabled={disabled || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            data-testid="material-file-upload-button"
          >
            {busy ? "上傳中…" : approved || pending ? "更換教材檔案" : "選擇教材檔案"}
          </Button>

          {uploaded ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"
              data-testid="material-file-uploaded"
            >
              <span className="font-medium text-emerald-900">已上傳：{uploaded.originalFilename}</span>
              <span className="text-xs text-emerald-800">{formatFileSize(uploaded.sizeBytes)}</span>
              <button
                type="button"
                className="text-xs text-emerald-900 underline"
                disabled={disabled || busy}
                onClick={() => onUploaded(null)}
              >
                移除
              </button>
              <p className="w-full text-xs text-emerald-800">
                {approved
                  ? "送出後會進入審核；通過後才會取代目前交付中的檔案。"
                  : "送出後會連同教材一起送審。"}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600" data-testid="material-file-locked">
          {lockedReason ?? "目前狀態無法更換教材檔案。"}
        </p>
      )}

      {error ? (
        <p className="text-sm text-rose-600" data-testid="material-file-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
