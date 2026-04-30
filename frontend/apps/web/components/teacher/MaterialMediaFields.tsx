"use client";

import { useRef, useState } from "react";
import { Button, InputField } from "@teaching-platform/ui";
import { uploadMaterialMedia } from "../../lib/upload-material-media";

type Props = {
  coverImageUrl: string;
  onCoverImageUrlChange: (value: string) => void;
  detailImagesText: string;
  onDetailImagesTextChange: (value: string) => void;
  demoVideoUrl: string;
  onDemoVideoUrlChange: (value: string) => void;
  disabled?: boolean;
  onNotify: (message: string) => void;
};

export function MaterialMediaFields({
  coverImageUrl,
  onCoverImageUrlChange,
  detailImagesText,
  onDetailImagesTextChange,
  demoVideoUrl,
  onDemoVideoUrlChange,
  disabled,
  onNotify,
}: Props) {
  const [coverBusy, setCoverBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const detailInputRef = useRef<HTMLInputElement>(null);

  async function runUpload(
    file: File,
    kind: "cover" | "detail" | "demo",
    setBusy: (v: boolean) => void
  ) {
    setBusy(true);
    try {
      const url = await uploadMaterialMedia(file, kind);
      if (kind === "cover") {
        onCoverImageUrlChange(url);
      } else if (kind === "detail") {
        const line = `${url}|`;
        onDetailImagesTextChange(detailImagesText.trim() ? `${detailImagesText.trim()}\n${line}` : line);
      } else {
        onDemoVideoUrlChange(url);
      }
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "上傳失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">封面照 *</p>
        <p className="text-xs text-slate-500">
          上傳圖片後會自動填入可供前台顯示的 URL（JPEG／PNG／GIF／WebP，最大 10MB）。亦可改用手動貼上外部圖片連結。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50">
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              disabled={disabled || coverBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void runUpload(f, "cover", setCoverBusy);
              }}
            />
            {coverBusy ? "上傳中…" : "選擇檔案並上傳封面"}
          </label>
        </div>
        {coverImageUrl.trim() ? (
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverImageUrl.trim()} alt="" className="h-24 w-auto max-w-[200px] rounded-lg object-cover" />
          </div>
        ) : null}
        <InputField
          id="material-cover-url"
          label="封面圖片 URL（上傳後自動填入，可改為外部 CDN）"
          value={coverImageUrl}
          onChangeText={onCoverImageUrlChange}
          placeholder="https://..."
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">細節照片（選填）</p>
        <p className="text-xs text-slate-500">可多次上傳；每張會新增一行「image_url|alt_text」。也可在下方文字區手動編輯。</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={detailInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            disabled={disabled || detailBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void runUpload(f, "detail", setDetailBusy);
            }}
          />
          <Button variant="secondary" disabled={disabled || detailBusy} onPress={() => detailInputRef.current?.click()}>
            {detailBusy ? "上傳中…" : "上傳一張細節照片"}
          </Button>
        </div>
        <label htmlFor="material-detail-images" className="text-sm font-medium text-slate-800">
          細節照片清單（每行：image_url|alt_text）
        </label>
        <textarea
          id="material-detail-images"
          value={detailImagesText}
          onChange={(e) => onDetailImagesTextChange(e.target.value)}
          placeholder={"每行一張；上傳後會自動插入 URL\nhttps://example.com/a.jpg|步驟說明"}
          disabled={disabled}
          className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">教學玩法影片（選填）</p>
        <p className="text-xs text-slate-500">可貼上 YouTube／外部連結，或上傳 MP4／WebM（最大 80MB）。</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100">
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="sr-only"
              disabled={disabled || demoBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void runUpload(f, "demo", setDemoBusy);
              }}
            />
            {demoBusy ? "上傳中…" : "上傳影片檔"}
          </label>
        </div>
        <InputField
          id="material-demo-video-url"
          label="影片 URL（上傳後自動填入，可改為 YouTube 連結）"
          value={demoVideoUrl}
          onChangeText={onDemoVideoUrlChange}
          placeholder="https://www.youtube.com/watch?v=..."
          disabled={disabled}
        />
      </div>
    </div>
  );
}
