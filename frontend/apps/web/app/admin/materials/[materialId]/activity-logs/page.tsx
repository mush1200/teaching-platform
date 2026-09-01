"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ActivityLogRow, ActivityLogsListResponse } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";
import { ActivityLogCard } from "../../../../../components/admin/ActivityLogCard";
import {
  AccentTextLink,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
} from "../../../../../components/ds";

const PAGE_SIZE = 20;

/**
 * 教材的活動時間軸（IA §6 的 entity-centric 主入口之一）。
 *
 * ## 修正前（IA-02 criterion 4）
 *
 * 每一列的標題是 `{log.action ?? "unknown action"}` —— 也就是畫面上直接出現
 * `material.changes_requested`；下面接 `角色：{log.actor_role}`，於是 `admin` /
 * `parent` 這種 role 字面值也直接見人（違反 `docs/ui-role-naming-checklist.md`）。
 * `meta` 完全沒有顯示，樣式停在 legacy slate / indigo。
 *
 * ## 現在
 *
 * 與全站列表、單筆詳情共用 `ActivityLogCard` 與 `describeActivity()` /
 * `describeActivityMeta()`，樣式改用 `components/ds`。同一筆事件在哪一頁看都一樣。
 *
 * 資料仍來自既有的 `GET /admin/materials/:materialId/activity-logs`（scoped 路由與
 * 全站列表共用同一個 service，因此這裡本來就拿得到 `actor_email` / `target_label`）。
 */
export default function AdminMaterialActivityLogsPage() {
  const params = useParams();
  const materialId = String(params.materialId ?? "").trim();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ActivityLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const paramsQs = new URLSearchParams();
    paramsQs.set("page", String(page));
    paramsQs.set("limit", String(PAGE_SIZE));
    return `admin/materials/${encodeURIComponent(materialId)}/activity-logs?${paramsQs.toString()}`;
  }, [materialId, page]);

  const load = useCallback(async () => {
    if (!materialId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(query);
      if (!res.ok) {
        setItems([]);
        setError(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as ActivityLogsListResponse;
      const nextItems = data.items ?? [];
      setItems(nextItems);
      const total = data.pagination?.total ?? nextItems.length;
      const pages = data.pagination?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE));
      setTotalItems(total);
      setTotalPages(Math.max(1, pages));
    } catch {
      setItems([]);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [materialId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!materialId) {
    return (
      <section className="flex w-full flex-col gap-4">
        <PageHeader title="教材活動紀錄" />
        <EmptyState title="缺少教材 ID" description="這個網址沒有帶到教材編號，請從教材列表進入。" />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="教材活動紀錄"
        description="這份教材身上發生過的所有操作，由新到舊。"
        breadcrumb={
          <div className="flex flex-wrap items-center gap-4">
            <AccentTextLink href="/admin/materials" className="text-sm">
              ← 返回教材審核
            </AccentTextLink>
            <AccentTextLink
              href={`/admin/materials/${encodeURIComponent(materialId)}/reports`}
              className="text-sm"
            >
              此教材的檢舉
            </AccentTextLink>
          </div>
        }
      />

      {loading ? <LoadingState title="載入紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="沒有活動紀錄" description="這份教材還沒有任何操作紀錄。" />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((log) => (
            <ActivityLogCard key={log.id} log={log} links={<EntryLinks log={log} />} />
          ))}
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            disabled={loading}
            onPageChange={setPage}
            className="pt-2"
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * 每一列的導航。這一頁本身就是對象的時間軸，所以**不**再指回自己 ——
 * 只留「這個人做過什麼」與單筆詳情，兩者都是既有入口，不新增任何 route。
 */
function EntryLinks({ log }: { log: ActivityLogRow }) {
  return (
    <>
      {log.actor_id ? (
        <Link
          href={`/admin/users/${encodeURIComponent(log.actor_id)}/activity-logs`}
          className="font-medium text-edu-primary underline"
        >
          此操作者紀錄
        </Link>
      ) : null}
      <Link
        href={`/admin/activity-logs/${encodeURIComponent(log.id)}`}
        className="font-medium text-edu-primary underline"
      >
        單筆詳情
      </Link>
    </>
  );
}
