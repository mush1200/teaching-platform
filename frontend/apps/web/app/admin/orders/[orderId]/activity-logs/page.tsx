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
 * 訂單的活動時間軸（IA §6 的 entity-centric 主入口之一）。
 *
 * 這一頁是客訴調查最常落地的地方：「這張訂單到底發生了什麼」。
 * 修正內容與教材紀錄頁相同 —— 原本每一列的標題是 raw `action`、下面接
 * `角色：{actor_role}`（`admin` / `parent` 字面值），`meta` 完全沒顯示。
 * 現在共用 `ActivityLogCard` 的三層資訊架構與 `components/ds` 樣式。
 *
 * 資料仍來自既有的 `GET /admin/orders/:orderId/activity-logs`，未新增任何端點。
 */
export default function AdminOrderActivityLogsPage() {
  const params = useParams();
  const orderId = String(params.orderId ?? "").trim();
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
    return `admin/orders/${encodeURIComponent(orderId)}/activity-logs?${paramsQs.toString()}`;
  }, [orderId, page]);

  const load = useCallback(async () => {
    if (!orderId) return;
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
  }, [orderId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!orderId) {
    return (
      <section className="flex w-full flex-col gap-4">
        <PageHeader title="訂單活動紀錄" />
        <EmptyState title="缺少訂單 ID" description="這個網址沒有帶到訂單編號，請從訂單管理進入。" />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="訂單活動紀錄"
        description={`訂單 ${orderId} 身上發生過的所有操作，由新到舊。`}
        breadcrumb={
          <div className="flex flex-wrap items-center gap-4">
            <AccentTextLink href="/admin/orders" className="text-sm">
              ← 返回訂單管理
            </AccentTextLink>
            {/*
              付款審核是這條時間軸最常見的來源與去處。深連結帶 `status=all`：
              預設篩選會把已決定的憑證藏起來，而調查時要看的往往正是被退回的那一張。
            */}
            <AccentTextLink
              href={`/admin/payment-proofs?status=all&q=${encodeURIComponent(orderId)}`}
              className="text-sm"
            >
              此訂單的付款審核
            </AccentTextLink>
          </div>
        }
      />

      {loading ? <LoadingState title="載入紀錄中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="沒有活動紀錄" description="這張訂單還沒有任何操作紀錄。" />
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
