"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Report } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";
import { REPORT_STATUS_LABEL, REPORT_STATUS_TONE } from "../../../../../lib/admin-labels";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "../../../../../components/ds";
import { MaterialFeedbackContext } from "../../../../../components/admin/MaterialFeedbackContext";

/**
 * 教材的檢舉脈絡（**contextual read-only**）。
 *
 * ## 這一頁不是案件處理器
 *
 * 它回答的是「**這份教材**被檢舉過什麼」—— Admin 在審核教材、處理客訴時需要的背景。
 * 真正的案件處理（調查 → 與創作者往返 → 判定 → 處置）只有一個地方：
 * **`/admin/reports`**（見 `docs/admin-information-architecture.md`）。
 *
 * ## 移除了什麼，為什麼
 *
 * 這一頁原本有一顆「標記已處理」，打的是 legacy 的
 * `PATCH /admin/reports/:id { status: "reviewed" }`。那條路徑：
 *   - 繞過整個案件流程（沒有調查、沒有與創作者溝通）
 *   - 不留處置紀錄（沒有 resolution、沒有 note、沒有 `report_events`）
 *   - 是**正式產品 UI 中最後一個還會產生新 legacy `reviewed` 的入口**
 *
 * 因此它被移除了。既有的 `reviewed` 資料保留、照常顯示（標示為「舊版已處理」），
 * 但不再有任何產品操作會產生新的。
 *
 * ## 也不會在這裡複製新版 workflow
 *
 * 不放 investigate / request-response / resolve / dismiss —— 那會變成第二套案件處理器，
 * 兩邊的稽核軌跡與可用動作遲早分歧。每一筆案件都用「查看案件」深連回 `/admin/reports`。
 */

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function reportStatusLabel(status?: string): string {
  if (!status) return "未知";
  return REPORT_STATUS_LABEL[status as keyof typeof REPORT_STATUS_LABEL] ?? status;
}

function reportStatusTone(status?: string) {
  return REPORT_STATUS_TONE[status as keyof typeof REPORT_STATUS_TONE] ?? "neutral";
}

/** 仍需要 Admin 行動的案件；與 Backend 的 `OPEN_REPORT_STATUSES` 對齊。 */
const OPEN_STATUSES = new Set(["pending", "investigating", "awaiting_creator"]);

export default function AdminMaterialReportsPage() {
  const params = useParams();
  const materialId = String(params.materialId ?? "").trim();

  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!materialId) return;
    setLoading(true);
    setError(null);
    try {
      /*
       * 沿用既有的 per-material 端點（回傳這份教材的所有檢舉，含新工作流的狀態）。
       * 這裡**不帶** `?status=` —— 那個 query 只接受 legacy 的 `pending` / `reviewed`，
       * 拿它當產品篩選會漏掉 investigating / awaiting_creator 的案件。
       */
      const res = await apiFetch(`admin/materials/${encodeURIComponent(materialId)}/reports`);
      if (!res.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as Report[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!materialId) {
    return (
      <section className="mx-auto w-full max-w-5xl flex-col gap-4">
        <PageHeader title="教材檢舉脈絡" description="缺少教材 ID。" />
      </section>
    );
  }

  const openCount = items.filter((item) => OPEN_STATUSES.has(String(item.status))).length;

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="教材檢舉脈絡"
        description="這份教材被檢舉過什麼。這是唯讀檢視；案件的調查與處置一律在檢舉管理進行。"
      />

      <div className="flex flex-wrap items-center gap-4 text-meta">
        <Link href="/admin/materials" className="font-medium text-edu-primary underline">
          ← 返回教材審核
        </Link>
        <Link
          href={`/admin/materials/${encodeURIComponent(materialId)}/activity-logs`}
          className="font-medium text-edu-primary underline"
        >
          此教材的活動紀錄
        </Link>
        <Link href="/admin/reports" className="font-medium text-edu-primary underline">
          檢舉案件佇列
        </Link>
        <span className="text-ds-textSubtle">教材 ID：{materialId}</span>
      </div>

      {/*
        同一份教材的另一種外部訊號：使用者的教學回饋。
        與檢舉並列在這裡，Admin 判斷「這份教材有沒有問題」時不必再跳去全平台的回饋列表。
        唯讀 —— 回饋本身沒有處置動作，內容有問題時走檢舉流程。
      */}
      {materialId ? <MaterialFeedbackContext materialId={materialId} heading="h2" /> : null}

      {!loading && !error && items.length > 0 ? (
        <p className="rounded-ds-card border border-ds-border bg-ds-surface px-4 py-3 text-meta text-ds-textMuted">
          共 {items.length} 件檢舉
          {openCount > 0 ? `，其中 ${openCount} 件仍需處理` : "，目前沒有待處理的案件"}。
          要調查或處置，請點該筆的「查看案件」進入檢舉管理。
        </p>
      ) : null}

      {loading ? <LoadingState title="載入檢舉中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="沒有檢舉紀錄" description="這份教材目前沒有任何檢舉。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((report) => {
            const isLegacy = report.status === "reviewed";
            return (
              <article
                key={report.id}
                data-testid="material-report-row"
                className="rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-title text-ds-heading">
                      {report.reason ? `「${report.reason}」` : "（未填寫檢舉理由）"}
                    </p>
                    <p className="mt-0.5 text-meta text-ds-textMuted">
                      檢舉時間：{formatDateTime(report.created_at)}
                    </p>
                  </div>
                  <StatusPill tone={reportStatusTone(report.status)} label={reportStatusLabel(report.status)} />
                </div>

                {/*
                  Legacy 案件的弱化提示：它不是新版的「已處理」——
                  沒有處置紀錄，只是舊版有人按過「標記已處理」。
                */}
                {isLegacy ? (
                  <p
                    data-testid="material-report-legacy-hint"
                    className="mt-2 rounded-xl bg-edu-page px-3 py-2 text-caption text-ds-textMuted"
                  >
                    此案件使用舊版「標記已處理」流程結案，沒有新版案件的處置紀錄。
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-meta">
                  {/*
                    所有處置都在 `/admin/reports`。深連到該案件，Admin 不必再自己搜尋一次。
                  */}
                  <Link
                    href={`/admin/reports?status=all&case=${encodeURIComponent(report.id)}`}
                    data-testid="material-report-open-case"
                    className="min-h-10 rounded-xl bg-edu-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-95"
                  >
                    查看案件
                  </Link>
                  <span className="text-caption text-ds-textSubtle">案件 ID：{report.id}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
