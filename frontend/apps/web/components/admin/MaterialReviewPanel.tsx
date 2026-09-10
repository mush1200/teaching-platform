"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  ActivityLogRow,
  ActivityLogsListResponse,
  AdminMaterialRow,
  Material,
  MaterialReviewActionResponse,
  MaterialReviewReasonCode,
} from "../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../lib/api-client";
import {
  MATERIAL_REVIEW_NOTE_MIN_LENGTH,
  MATERIAL_REVIEW_REASONS,
  MATERIAL_REVIEW_REASON_LABEL,
  MATERIAL_STATUS_LABEL,
  MATERIAL_STATUS_TONE,
  describeActivity,
} from "../../lib/admin-labels";
import { DetailField, DetailGrid, ErrorState, LoadingState, StatusPill } from "../ds";
import { Button } from "../ui/Button";
import { ConfirmAction } from "../ui/ConfirmAction";
import { FormField } from "../ui/FormField";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { MediaImage, MediaLink } from "../materials/MediaImage";
import { formatFileSize, type MaterialFileInfo } from "../../lib/material-file";
import {
  groupMaterialFeatures,
  MATERIAL_FEATURE_GROUP_LABELS,
  type MaterialFeatureGroupKey,
} from "@/src/constants/materialFeatures";

/**
 * 教材審核面板（Material Review MVP Phase 1）。
 *
 * ## 資訊架構（由上而下）
 *
 *   1. 標題與提交資訊      6. 教材特色
 *   2. 視覺內容            7. 教材檔案（可下載審閱）
 *   3. 教材基本資料        8. 著作權聲明
 *   4. 教學設計            9. 品質與風險背景
 *   5. 教材內容清單       10. 審核紀錄（activity_logs）
 *                        11. 技術資訊（預設收合）
 *                        12. 審核決定（sticky footer）
 *
 * ## 教材檔案
 *
 * Admin 可以把創作者送審的檔案實際下載下來打開 —— 沒有這個能力，「審核教材」就只是
 * 核對表單，`file_problem` 這個退回原因也無從誠實成立。
 *
 * 兩個 slot 分開呈現而不是「這份教材的檔案」：審核中的教材同時存在**待審候選檔**與
 * **目前交付中的檔案**兩份不同的東西，混在一起會讓 Admin 以為自己審了新檔、其實看的是舊檔。
 *
 * 每一次下載都寫 `admin.material_file_downloaded` 稽核事件：付費教材的內容經由這條路徑
 * 離開平台。
 *
 * ## 資料來源
 *
 * 內容用既有的 `GET /materials/:id`（admin 可讀所有狀態，回應含 contents / detail_images
 * 與 `material_file` 摘要），歷程用既有的 `GET /admin/materials/:id/activity-logs`，
 * 檔案位元組用 `GET /admin/materials/:id/file?slot=`。
 */

type Props = {
  /** 佇列列（帶 creator_email 與 open_report_count —— 詳情 API 沒有這兩個）。 */
  row: AdminMaterialRow;
  /** 審核完成後通知佇列重新載入。 */
  onReviewed: () => Promise<void> | void;
  onClose: () => void;
  /** 「下一筆待審」；沒有下一筆時傳 null。 */
  onNext: (() => void) | null;
};

type Decision = { kind: "approved" | "changes_requested"; at: Date };

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function noteLength(value: string) {
  return [...value.trim()].length;
}

/** 區塊標題。整個面板只有一種層級節奏，不再多發明字級。 */
function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-ds-borderMuted pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-title text-ds-heading">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * 一個檔案 slot 的呈現。
 *
 * 待審與已核准用不同的視覺色調，因為兩者對 Admin 的意義完全不同：
 * 一個是「你現在要審的東西」，另一個是「買家已經拿到的東西」。
 */
function FileSlot({
  tone,
  title,
  hint,
  file,
  busy,
  onDownload,
}: {
  tone: "pending" | "approved";
  title: string;
  hint: string;
  file: MaterialFileInfo;
  busy: boolean;
  onDownload: () => void;
}) {
  const toneClass =
    tone === "pending"
      ? "border-status-pendingReviewText/30 bg-status-pendingReviewBg"
      : "border-ds-border bg-edu-page";
  return (
    <div
      className={`rounded-xl border p-3 ${toneClass}`}
      data-testid={`material-review-file-${tone}`}
    >
      <p className="text-body font-medium text-ds-heading">{title}</p>
      <p className="mt-1 text-meta text-ds-textMuted">{hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-body text-ds-text">{file.originalFilename}</span>
        <span className="text-meta text-ds-textSubtle">{formatFileSize(file.sizeBytes)}</span>
        <Button
          intent="neutral"
          variant="outline"
          size="sm"
          loading={busy}
          onClick={onDownload}
          data-testid={`material-review-file-download-${tone}`}
        >
          {busy ? "下載中…" : "下載審閱"}
        </Button>
      </div>
    </div>
  );
}

function Paragraph({ value }: { value?: string | null }) {
  if (!value || !String(value).trim()) return <p className="text-body text-ds-textSubtle">未填寫</p>;
  return <p className="whitespace-pre-wrap text-body text-ds-body">{value}</p>;
}

export function MaterialReviewPanel({ row, onReviewed, onClose, onNext }: Props) {
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<ActivityLogRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reasonCode, setReasonCode] = useState<MaterialReviewReasonCode>("incomplete_info");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** `UI-CONS-04`：字數不足改為**欄位層級**錯誤，而不是頁尾一段與欄位無關的文字。 */
  const [noteError, setNoteError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [fileDownload, setFileDownload] = useState<"pending" | "approved" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(row.id)}`);
      if (!res.ok) {
        setMaterial(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setMaterial((await res.json()) as Material);
    } catch {
      setMaterial(null);
      setError("無法載入教材內容。");
    } finally {
      setLoading(false);
    }
  }, [row.id]);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const res = await apiFetch(
        `admin/materials/${encodeURIComponent(row.id)}/activity-logs?page=1&limit=20`
      );
      if (!res.ok) {
        setHistory([]);
        setHistoryError(await parseApiErrorMessage(res));
        return;
      }
      const payload = (await res.json()) as ActivityLogsListResponse;
      setHistory(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setHistory([]);
      setHistoryError("無法載入審核紀錄。");
    }
  }, [row.id]);

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory]);

  /** 換一筆教材時，上一筆打到一半的退回說明不得跟著過來。 */
  useEffect(() => {
    setMode("idle");
    setReasonCode("incomplete_info");
    setNote("");
    setMessage(null);
    setNoteError(null);
    setDecision(null);
    setShowTechnical(false);
  }, [row.id]);

  const status = (material?.status ?? row.status) as keyof typeof MATERIAL_STATUS_LABEL;
  const isPending = status === "pending_review";
  const noteTooShort = noteLength(note) < MATERIAL_REVIEW_NOTE_MIN_LENGTH;

  async function submit(action: "approve" | "request-changes") {
    if (action === "request-changes" && noteTooShort) {
      /*
        `UI-CONS-04`：改送**欄位層級**錯誤。原本這一則進 `message`，
        渲染在頁尾一段與欄位無關的 `<p>` —— 看得見，但輔助技術無從知道是哪個欄位。
      */
      setNoteError(`補充說明至少 ${MATERIAL_REVIEW_NOTE_MIN_LENGTH} 個字，創作者才知道要修改什麼。`);
      return;
    }
    setNoteError(null);
    setMessage(null);
    setBusy(action === "approve" ? "approve" : "reject");
    try {
      const res = await apiFetch(`admin/materials/${encodeURIComponent(row.id)}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "approve" ? {} : { reasonCode, note: note.trim() }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      const payload = (await res.json()) as MaterialReviewActionResponse;
      setMaterial((prev) => ({ ...(prev ?? {}), ...payload.material }));
      setDecision({ kind: action === "approve" ? "approved" : "changes_requested", at: new Date() });
      setMode("idle");
      setNote("");
      await loadHistory();
      await onReviewed();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setBusy(null);
    }
  }

  /**
   * 下載某個 slot 的教材檔案。
   *
   * 用 fetch + Blob 而不是直接開新分頁：這支端點需要 `Authorization` header，
   * 而瀏覽器的分頁導航帶不了 header。物件 URL 用完立刻釋放，避免把整份教材
   * 留在分頁的記憶體裡。
   */
  async function downloadReviewFile(slot: "pending" | "approved") {
    setFileError(null);
    setFileDownload(slot);
    try {
      const res = await apiFetch(
        `admin/materials/${encodeURIComponent(row.id)}/file?slot=${slot}`
      );
      if (!res.ok) {
        setFileError(await parseApiErrorMessage(res));
        return;
      }
      const blob = await res.blob();
      const info = slot === "pending" ? pendingFile : approvedFile;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = info?.originalFilename ?? "material-file";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setFileError("下載失敗，請稍後再試。");
    } finally {
      setFileDownload(null);
    }
  }

  const features = Array.isArray(material?.material_features) ? material!.material_features! : [];
  const groupedFeatures = groupMaterialFeatures(features);
  const contents = Array.isArray(material?.contents) ? material!.contents! : [];
  const detailImages = Array.isArray(material?.detail_images) ? material!.detail_images! : [];
  const approvedFile = material?.material_file?.approvedFile ?? null;
  const pendingFile = material?.material_file?.pendingFile ?? null;

  /** 曾經因檢舉被下架、以及過去被退回幾次 —— 都從既有的稽核事件推導，不編造。 */
  const unpublishEvents = history.filter((item) => item.action === "material.unpublished");
  const changesRequestedEvents = history.filter((item) => item.action === "material.changes_requested");
  const resubmitCount = history.filter((item) => item.action === "material.resubmitted").length;

  return (
    <article
      data-testid="material-review-panel"
      className="relative rounded-ds-card border border-edu-primary bg-ds-surface shadow-ds-card"
    >
      <div className="space-y-4 p-5">
        {/* 1. 標題與提交資訊 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h3 text-ds-heading">{material?.title ?? row.title}</h2>
            <p className="mt-1 text-meta text-ds-textMuted">
              創作者：{row.creator_email ?? material?.teacher_id ?? "—"}
            </p>
            <p className="mt-0.5 text-meta text-ds-textMuted">
              送出：{formatDateTime(material?.created_at ?? row.created_at)} ・ 最後更新：
              {formatDateTime(material?.updated_at ?? row.updated_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill
              tone={MATERIAL_STATUS_TONE[status] ?? "neutral"}
              label={MATERIAL_STATUS_LABEL[status] ?? String(status)}
            />
            <Button intent="neutral" variant="outline" size="sm" onClick={onClose}>
              關閉
            </Button>
          </div>
        </div>

        {loading && !material ? <LoadingState title="載入教材內容中…" /> : null}
        {error && !material ? (
          <ErrorState title="載入失敗" description={error} onRetry={() => void load()} />
        ) : null}

        {material ? (
          <>
            {/* 2. 視覺內容 */}
            <Section title="視覺內容">
              {/*
                * 審核面板看的多半是 **pending_review** 的教材 —— 它的素材對匿名訪客
                * 是 401，普通 `<img src>` 會直接破圖。`MediaImage` 會對平台素材走
                * 授權 blob fetch，對創作者手貼的外部 CDN 連結則原樣渲染。
                */}
              {material.cover_image_url ? (
                <MediaImage
                  src={material.cover_image_url}
                  alt={`${material.title} 封面`}
                  testId="material-review-cover"
                  className="max-h-72 w-full rounded-xl border border-ds-borderMuted bg-edu-page object-contain"
                />
              ) : (
                <p className="text-body text-ds-textSubtle">沒有封面圖片。</p>
              )}
              {detailImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {detailImages.map((image, index) => (
                    <MediaImage
                      key={`${image.image_url}-${index}`}
                      src={image.image_url}
                      alt={image.alt_text ?? `細節圖 ${index + 1}`}
                      className="h-28 w-full rounded-lg border border-ds-borderMuted bg-edu-page object-cover"
                    />
                  ))}
                </div>
              ) : null}
              {material.demo_video_url ? (
                <MediaLink
                  src={material.demo_video_url}
                  className="inline-block text-sm font-medium text-ds-textAccent underline"
                >
                  開啟示範影片
                </MediaLink>
              ) : null}
            </Section>

            {/* 3. 教材基本資料 */}
            <Section title="基本資料">
              <DetailGrid>
                <DetailField label="售價">NT$ {Math.floor(Number(material.price) || 0).toLocaleString("zh-TW")}</DetailField>
                <DetailField label="適用年齡">{material.age_range || "未填寫"}</DetailField>
                <DetailField label="分類">{material.category || "未填寫"}</DetailField>
                <DetailField label="首次上架時間">{formatDateTime(material.published_at)}</DetailField>
              </DetailGrid>
              <div className="space-y-1">
                <p className="text-meta text-ds-textMuted">簡述</p>
                <Paragraph value={material.short_description} />
              </div>
              <div className="space-y-1">
                <p className="text-meta text-ds-textMuted">完整描述</p>
                <Paragraph value={material.description} />
              </div>
            </Section>

            {/* 4. 教學設計 */}
            <Section title="教學設計">
              <div className="space-y-1">
                <p className="text-meta text-ds-textMuted">教學目標</p>
                <Paragraph value={material.teaching_objective} />
              </div>
              <div className="space-y-1">
                <p className="text-meta text-ds-textMuted">教學方式</p>
                {Array.isArray(material.teaching_methods) && material.teaching_methods.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {material.teaching_methods.map((method) => (
                      <span
                        key={method}
                        className="rounded-full border border-ds-borderMuted bg-edu-page px-2.5 py-1 text-caption text-ds-body"
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-body text-ds-textSubtle">未填寫</p>
                )}
              </div>
              <DetailGrid>
                <DetailField label="使用時長">{material.usage_duration || "未填寫"}</DetailField>
              </DetailGrid>
              <div className="space-y-1">
                <p className="text-meta text-ds-textMuted">活動步驟</p>
                <Paragraph value={material.activity_steps} />
              </div>
              <div className="space-y-1">
                <p className="text-meta text-ds-textMuted">延伸價值</p>
                <Paragraph value={material.extension_value} />
              </div>
            </Section>

            {/* 5. 教材內容清單 */}
            <Section title="教材內容" aside={<span className="text-caption text-ds-textSubtle">{contents.length} 項</span>}>
              {contents.length === 0 ? (
                <p className="text-body text-ds-textSubtle">沒有教材內容項目。</p>
              ) : (
                <ul className="divide-y divide-ds-borderMuted rounded-xl border border-ds-borderMuted">
                  {contents.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="px-3 py-2 text-body">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-ds-heading">{item.name}</span>
                        <span className="text-meta text-ds-textMuted">
                          {item.type}
                          {item.count ? ` ・ ${item.count} 份` : ""}
                        </span>
                      </div>
                      {item.description ? (
                        <p className="mt-0.5 text-meta text-ds-textMuted">{item.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* 6. 教材特色 —— 依既有的五組分類呈現，與買家看到的教材頁一致 */}
            <Section title="教材特色">
              {features.length === 0 ? (
                <p className="text-body text-ds-textSubtle">未標註任何特色。</p>
              ) : (
                <div className="space-y-2">
                  {(Object.keys(groupedFeatures) as MaterialFeatureGroupKey[])
                    .filter((groupKey) => groupedFeatures[groupKey].length > 0)
                    .map((groupKey) => (
                      <div key={groupKey} className="flex flex-wrap items-baseline gap-2">
                        <span className="text-meta text-ds-textMuted">
                          {MATERIAL_FEATURE_GROUP_LABELS[groupKey]}
                        </span>
                        {groupedFeatures[groupKey].map((feature) => (
                          <span
                            key={feature}
                            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-caption font-medium text-sky-700"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </Section>

            {/* 7. 教材檔案 —— Admin 可以實際下載審閱 */}
            <Section title="教材檔案">
              {pendingFile || approvedFile ? (
                <div className="space-y-3">
                  {pendingFile ? (
                    <FileSlot
                      tone="pending"
                      title="待審核的教材檔案"
                      hint="這是創作者這次送審的檔案。核准後它才會成為買家下載到的版本。"
                      file={pendingFile}
                      busy={fileDownload === "pending"}
                      onDownload={() => void downloadReviewFile("pending")}
                    />
                  ) : null}
                  {approvedFile ? (
                    <FileSlot
                      tone="approved"
                      title="目前交付中的教材檔案"
                      hint="買家現在下載到的版本。處理檢舉或事故調查時看這一份。"
                      file={approvedFile}
                      busy={fileDownload === "approved"}
                      onDownload={() => void downloadReviewFile("approved")}
                    />
                  ) : null}
                  {fileError ? (
                    <p className="text-meta text-status-rejectedText" data-testid="material-review-file-error">
                      {fileError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ds-border bg-edu-page p-3">
                  <p className="text-body font-medium text-ds-heading">這份教材沒有教材檔案</p>
                  <p className="mt-1 text-meta text-ds-textMuted">
                    可能是啟用教材檔案交付之前建立的舊教材。買家點下載時會看到「尚未提供可下載檔案」，
                    因此**不應該**在這個狀態下核准上架；請退回並請創作者上傳教材檔案
                    （退回原因選「教材檔案問題」）。
                  </p>
                </div>
              )}
            </Section>

            {/* 8. 著作權聲明 */}
            <Section title="著作權聲明">
              <DetailGrid>
                <DetailField label="創作者已同意">
                  {material.ip_declaration_accepted ? "是" : "否"}
                </DetailField>
                <DetailField label="同意時間">{formatDateTime(material.ip_declaration_at)}</DetailField>
              </DetailGrid>
            </Section>

            {/* 9. 品質與風險背景 */}
            <Section title="品質與風險背景">
              <DetailGrid>
                <DetailField label="未結檢舉">
                  {(row.open_report_count ?? 0) > 0 ? (
                    <Link
                      href={`/admin/materials/${encodeURIComponent(row.id)}/reports`}
                      className="font-semibold text-edu-error underline"
                    >
                      {row.open_report_count} 件（查看）
                    </Link>
                  ) : (
                    "無"
                  )}
                </DetailField>
                <DetailField label="曾因檢舉下架">
                  {unpublishEvents.length > 0 ? `是（${unpublishEvents.length} 次）` : "否"}
                </DetailField>
                <DetailField label="過去被退回">
                  {changesRequestedEvents.length > 0 ? `${changesRequestedEvents.length} 次` : "無"}
                </DetailField>
                <DetailField label="重新送審次數">{resubmitCount > 0 ? `${resubmitCount} 次` : "無"}</DetailField>
              </DetailGrid>

              {material.review_reason_code ? (
                <div className="rounded-xl bg-edu-page p-3">
                  <p className="text-meta text-ds-textMuted">最近一次審核結果</p>
                  <p className="mt-0.5 text-body text-ds-heading">
                    {MATERIAL_REVIEW_REASON_LABEL[material.review_reason_code] ?? material.review_reason_code}
                  </p>
                  {material.review_note ? (
                    <p className="mt-1 whitespace-pre-wrap text-body text-ds-body">{material.review_note}</p>
                  ) : null}
                  <p className="mt-1 text-caption text-ds-textSubtle">
                    {formatDateTime(material.reviewed_at)}
                  </p>
                </div>
              ) : null}
            </Section>

            {/* 10. 審核紀錄 */}
            <Section
              title="審核紀錄"
              aside={
                <Link
                  href={`/admin/materials/${encodeURIComponent(row.id)}/activity-logs`}
                  className="text-caption font-medium text-ds-textAccent underline"
                >
                  完整紀錄
                </Link>
              }
            >
              {historyError ? <p className="text-body text-ds-textMuted">{historyError}</p> : null}
              {!historyError && history.length === 0 ? (
                <p className="text-body text-ds-textSubtle">尚無紀錄。</p>
              ) : null}
              {history.length > 0 ? (
                <ol className="space-y-1" data-testid="material-review-history">
                  {history.slice(0, 8).map((item) => {
                    const described = describeActivity(item);
                    return (
                      <li key={item.id} className="text-meta text-ds-textMuted">
                        <span className="text-ds-body">{described.sentence}</span>
                        <span className="ml-2 text-ds-textSubtle">{formatDateTime(item.created_at)}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </Section>

            {/* 11. 技術資訊（預設收合） */}
            <Section title="技術資訊">
              {/*
                `UI-CONS-24`／disclosure semantics（Wave UI-7）：這是 disclosure，不是一般按鈕。
                補上 `aria-expanded` 與 `aria-controls` 之後，輔助技術才知道它控制的區塊
                目前是展開還是收合 —— 其餘四個 disclosure（admin 三個列表列 ＋ creator/cases）
                本來就有，只有這一個漏掉。
              */}
              <button
                type="button"
                onClick={() => setShowTechnical((prev) => !prev)}
                aria-expanded={showTechnical}
                aria-controls="material-technical-details"
                data-testid="material-technical-toggle"
                className="text-meta font-medium text-ds-textMuted underline"
              >
                {showTechnical ? "隱藏技術資訊" : "顯示技術資訊"}
              </button>
              {showTechnical ? (
                <dl id="material-technical-details" className="grid grid-cols-1 gap-1 rounded-xl bg-edu-page p-3 font-mono text-caption text-ds-textMuted sm:grid-cols-2">
                  <div>
                    <dt className="inline">material id：</dt>
                    <dd className="inline">{material.id}</dd>
                  </div>
                  <div>
                    <dt className="inline">teacher_id：</dt>
                    <dd className="inline">{material.teacher_id ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">created_at：</dt>
                    <dd className="inline">{material.created_at ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">updated_at：</dt>
                    <dd className="inline">{material.updated_at ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">reviewed_by：</dt>
                    <dd className="inline">{material.reviewed_by ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">published_at：</dt>
                    <dd className="inline">{material.published_at ?? "—"}</dd>
                  </div>
                </dl>
              ) : null}
            </Section>
          </>
        ) : null}
      </div>

      {/*
        12. 審核決定 —— sticky footer。
        面板有 10 幾個區塊，Admin 往往在看完前半就有結論；決定列因此固定在
        詳情欄底部。它在詳情的捲動容器內 sticky，不會蓋住頁面其他區域。
      */}
      <div
        data-testid="material-review-decision"
        className="sticky bottom-0 z-10 space-y-3 rounded-b-ds-card border-t border-ds-border bg-ds-surface/95 p-4 backdrop-blur"
      >
        {decision ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p data-testid="material-review-result" className="text-body font-semibold text-ds-heading">
              {decision.kind === "approved" ? "已核准上架" : "已退回修改"}
              <span className="ml-2 text-meta font-normal text-ds-textMuted">
                {decision.at.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </p>
            {/*
              刻意**不**自動跳下一筆：mutation 成功的瞬間把畫面換掉，Admin 就無法確認
              自己剛才做了什麼（尤其退回會寄信給創作者）。由 Admin 自己決定何時前進。
            */}
            {onNext ? (
              <Button intent="action" size="sm" onClick={onNext} data-testid="material-review-next">
                下一筆待審 →
              </Button>
            ) : (
              <span className="text-meta text-ds-textMuted">沒有其他待審教材了。</span>
            )}
          </div>
        ) : !isPending ? (
          <p className="text-body text-ds-textMuted">
            此教材目前是「{MATERIAL_STATUS_LABEL[status] ?? String(status)}」，沒有可執行的審核動作。
            {status === "changes_requested" ? "等待創作者修改後重新送審。" : null}
            {status === "published" ? "若要下架，請透過檢舉案件處置。" : null}
            {status === "unpublished" ? "等待創作者修改後重新送審。" : null}
          </p>
        ) : mode === "idle" ? (
          <div className="flex flex-wrap gap-2">
            {/*
              `UI-CONS-12` / `UI-CONS-08`（Wave UI-3）—— 這一組在 Wave UI-2 刻意延後，
              因為 canonical `Button` 當時沒有 success 語意，而改用其他 intent 等於改顏色
              （`UI-CONS-01`）。本輪 `success` 通過了「跨頁面 semantic intent」門檻
              （本檔 ＋ `app/admin/payment-proofs`），因此整組一起遷移。

              **色值完全沒變**：`success` solid 沿用既有的 `edu-success`(#22C55E)。
              白字 on #22C55E ＝ 2.28:1 的對比缺口**依然存在**，但已從兩個檔案的複製貼上
              集中到 primitive 一處，待 `UI-CONS-01` / Wave UI-7 由 Owner 決定色值後一次修好。
            */}
            {/*
              `UI-CONS-16`（Wave UI-5）：核准是**高影響且實質不可逆**的決定 ——
              它會寫入 `approved_file_id`（唯一能寫的路徑）並讓教材對買家可購買可下載；
              要收回只能改走檢舉處置的 `unpublish_material`，不是同一條流程的「復原」。
              旁邊的「退回修改」有必填理由、理由輸入本身就是確認步驟，所以只有這一顆需要補確認。
            */}
            <ConfirmAction
              triggerLabel="核准上架"
              triggerIntent="success"
              intent="success"
              disabled={busy !== null}
              loading={busy === "approve"}
              title="確定要核准這份教材上架？"
              description="核准後教材會對買家公開販售，並鎖定目前這一版檔案為可下載版本。要收回只能另外走檢舉處置的下架流程。"
              confirmLabel={busy === "approve" ? "處理中…" : "確認核准上架"}
              onConfirm={() => submit("approve")}
              testId="material-approve"
            />
            <Button
              intent="danger"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setMode("reject")}
              data-testid="material-request-changes-open"
            >
              退回修改
            </Button>
          </div>
        ) : (
          /*
            退回表單就地展開，不用 modal —— 填原因時 Admin 仍然需要對照上方的教材內容。
          */
          <div className="space-y-3">
            {/*
              `UI-CONS-04` —— 這兩個欄位原本是 `<label>` 包 `<span>` ＋ 裸控制項，
              字數不足的錯誤則被送到頁尾一個**與欄位無關**的 `<p>`（`material-review-message`）。
              視覺上看得到、程式上沒有任何關聯：`aria-invalid` 與 `aria-describedby` 全 app 皆為 0。
              改用 `FormField` 後，錯誤會同時 (a) 讓 textarea 帶 `aria-invalid="true"`、
              (b) 由 `aria-describedby` 指向錯誤節點，(c) 以 `role="alert"` 在送出後朗讀。
            */}
            <FormField label="退回原因（必選，創作者會看到）">
              <Select
                size="sm"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value as MaterialReviewReasonCode)}
                data-testid="material-reason-select"
              >
                {MATERIAL_REVIEW_REASONS.map((code) => (
                  <option key={code} value={code}>
                    {MATERIAL_REVIEW_REASON_LABEL[code]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label={`補充說明（必填，至少 ${MATERIAL_REVIEW_NOTE_MIN_LENGTH} 字）`}
              help={`目前 ${noteLength(note)} 字`}
              error={noteError}
            >
              <Textarea
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  // 使用者一開始修正就撤下錯誤 —— 錯誤訊息不該在已經改好之後還留在畫面上。
                  if (noteError) setNoteError(null);
                }}
                rows={3}
                data-testid="material-reason-note"
                placeholder="具體說明要修改什麼，例如：活動步驟只寫了一句，請補充完整流程與所需時間。"
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button
                intent="danger"
                loading={busy === "reject"}
                disabled={busy !== null}
                onClick={() => void submit("request-changes")}
                data-testid="material-request-changes-confirm"
              >
                {busy === "reject" ? "處理中…" : "確認退回"}
              </Button>
              <Button
                intent="neutral"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setMode("idle");
                  setMessage(null);
                  setNoteError(null);
                }}
              >
                取消
              </Button>
            </div>
          </div>
        )}

        {message ? (
          <p data-testid="material-review-message" className="text-body text-edu-warning">
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}
