"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AccountPageHeaderOrders,
  OrderListSkeleton,
  QueryErrorBanner,
} from "../../components/account/ProductAccountChrome";
import { AccentTextLink, BrandCtaLink, PrimaryCtaLink, SurfaceCard } from "../../components/ds";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { OrderFlowMini } from "../../components/orders/OrderFlowMini";
import { describePaymentRejection } from "../../lib/payment-rejection";
import type { Order, OrderDetailResponse, OrderItemRow, OrdersListResponse } from "../../lib/api-types";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";
import { dismissNotification, readNotifications, type InAppNotification } from "../../lib/notifications";

type UiOrder = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  cancelledAt?: string | null;
  paymentProofPendingReviewCount: number;
  progressState: string;
  /** 退件原因代碼與備註 —— 買家必須看得到自己為什麼被退（`lib/payment-rejection.ts`）。 */
  rejectedReason?: string | null;
  rejectedNote?: string | null;
};

type ListTab = "active" | "history";

/**
 * 買家看到的訂單編號 —— **就是 Backend 的 `orders.id`**，不做任何轉換。
 *
 * 先前這裡用 `建立日期 + id 的 hash % 1000` 現算出一個 `#O260825676` 這樣的編號。
 * 那個編號有三個問題，每一個單獨都足以讓客服無法運作：
 *   1. **不存在於資料庫** —— Admin 的訂單查詢吃的是 `ord_*`，買家報的編號查無結果。
 *   2. **不唯一** —— 每天只有 1000 個可能值，依生日問題約 37 筆訂單就有過半機率碰撞。
 *   3. **只存在於清單頁** —— 同一張訂單在訂單詳情、付款憑證頁與通知信都顯示 `ord_*`，
 *      買家在自己的介面上就會看到兩個互相矛盾的「訂單編號」。
 *
 * `orders.id` 本來就由 server 產生、唯一且持久化（`orderService.newOrderId()`），
 * 因此不需要新增 `order_number` 欄位或 migration —— canonical identifier 已經存在，
 * 缺的只是「前端不要自己再發明一個」。
 */
function orderRefLabel(id: string): string {
  return id;
}

function isHistoricalOrder(o: UiOrder): boolean {
  const s = String(o.status ?? "").toLowerCase();
  if (o.cancelledAt) return true;
  return ["approved", "completed", "paid", "cancelled", "canceled"].includes(s);
}

function statusChipLabel(o: UiOrder): string {
  const p = String(o.progressState || "").toLowerCase();
  if (p === "reviewing") return "審核中";
  if (p === "proof_uploaded") return "已上傳憑證";
  if (p === "pending") return "待付款";
  if (p === "rejected") return "審核未通過";
  if (p === "approved") return "已完成";
  // `cancelled` 是 Backend 的終態之一（`COR-03`）。少了這一條，已取消的訂單會落到
  // `pending` 而顯示「待付款」，卻同時被 `isHistoricalOrder()` 歸進歷史訂單。
  if (p === "cancelled") return "已取消";
  const s = String(o.status ?? "").toLowerCase();
  if (s === "approved" || s === "completed" || s === "paid") return "已完成";
  if (s === "cancelled" || s === "canceled") return "已取消";
  return "處理中";
}

function statusChipClass(o: UiOrder): string {
  const p = String(o.progressState || "").toLowerCase();
  if (p === "reviewing") return "border-violet-200 bg-violet-50 text-violet-900";
  if (p === "proof_uploaded" || p === "pending") return "border-orange-200 bg-orange-50 text-orange-900";
  if (p === "rejected") return "border-amber-200 bg-amber-50 text-amber-950";
  if (p === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  // 與下方 `s === "cancelled"` 的 fallback 同一組灰階：同一個語意不該有兩種視覺。
  if (p === "cancelled") return "border-[#ececf2] bg-gray-50 text-[#777777]";
  const s = String(o.status ?? "").toLowerCase();
  if (s === "approved" || s === "completed" || s === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (s === "cancelled" || s === "canceled") return "border-[#ececf2] bg-gray-50 text-[#777777]";
  return "border-[#ececf2] bg-white text-ds-body";
}

function canShowMaterialsLink(status: string): boolean {
  const s = status.toLowerCase();
  return s === "approved" || s === "completed" || s === "paid";
}

/**
 * 主要 CTA 由 canonical 的 `order_progress_state` 決定。
 *
 * 舊版分別解讀 `orders.status` 與 pending 憑證數，於是同一張卡片可以同時出現
 * 「審核未通過」的狀態徽章與「等待審核中」的 CTA（憑證 A 待審、較新的憑證 B 被退回時）。
 * 徽章與 CTA 現在讀同一個欄位，講的必然是同一個故事（`COR-01`）。
 *
 * `pending_payment` 以外的訂單（已核准／已取消）沒有付款動作，一律不給 CTA。
 */
function renderPrimaryAction(o: UiOrder) {
  if (o.status.toLowerCase() !== "pending_payment") return null;
  const p = o.progressState.toLowerCase();

  // 買家已經重新上傳、正在等平台審核 —— 這裡**不得**再叫他上傳一次。
  if (p === "reviewing") {
    return (
      <span className="inline-flex h-[42px] min-h-[42px] w-full max-w-full items-center justify-center rounded-xl border border-[#ececf2] bg-[#fafafc] px-5 text-center text-sm font-semibold leading-snug text-[#666666] lg:w-auto">
        等待審核中
      </span>
    );
  }
  if (p === "rejected") {
    /*
     * 退件原因必須跟 CTA 一起出現。只給「重新上傳」而不說原因，買家最合理的行為
     * 就是把同一張憑證再傳一次 —— 然後再被退一次。Admin 端的表單也明講了
     * 「退回原因（必選，購買者會看到）」，這裡就是那個「看到」的地方。
     */
    return (
      <BrandCtaLink
        href={`/orders/${encodeURIComponent(o.id)}/payment-proof`}
        className="h-[42px] min-h-[42px] w-full shrink-0 justify-center rounded-xl px-5 py-0 text-sm font-semibold lg:inline-flex lg:w-auto lg:max-w-none"
      >
        重新上傳付款憑證
      </BrandCtaLink>
    );
  }
  if (p === "pending" || p === "proof_uploaded") {
    return (
      <BrandCtaLink
        href={`/orders/${encodeURIComponent(o.id)}/payment-proof`}
        className="h-[42px] min-h-[42px] w-full shrink-0 justify-center rounded-xl px-5 py-0 text-sm font-semibold lg:inline-flex lg:w-auto lg:max-w-none"
      >
        上傳付款憑證
      </BrandCtaLink>
    );
  }
  return null;
}

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => getStoredToken(), []);
  const [orders, setOrders] = useState<UiOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItemRow[]>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});
  const [listTab, setListTab] = useState<ListTab>("active");
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  useEffect(() => {
    setNotifications(readNotifications());
  }, []);

  useEffect(() => {
    const flash = searchParams.get("flash");
    if (flash === "proof_uploaded") {
      setFlashMessage("已收到付款憑證，目前等待人工審核。");
      return;
    }
    if (flash === "payment_approved") {
      setFlashMessage("付款已審核通過，教材已開放下載。");
      return;
    }
    if (flash === "payment_rejected") {
      setFlashMessage("付款憑證未通過，請重新上傳。");
      return;
    }
    setFlashMessage(null);
  }, [searchParams]);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("me/orders");
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setOrders([]);
        return;
      }
      const payload = (await res.json()) as OrdersListResponse;
      const list = (payload.items ?? []).map((item: Order) => ({
        id: item.id,
        status: item.status,
        total: Math.floor(Number(item.total_amount ?? item.total_price ?? 0) || 0),
        createdAt: item.created_at ?? "-",
        cancelledAt: item.cancelled_at ?? null,
        paymentProofPendingReviewCount: Number(item.payment_proof_pending_review_count ?? 0) || 0,
        progressState: String(item.order_progress_state || ""),
        rejectedReason: item.payment_proof_rejected_reason ?? null,
        rejectedNote: item.payment_proof_rejected_note ?? null,
      }));
      setOrders(list);
    } catch {
      setError("載入訂單失敗，請稍後再試。");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const activeOrders = useMemo(() => orders.filter((o) => !isHistoricalOrder(o)), [orders]);
  const historyOrders = useMemo(() => orders.filter((o) => isHistoricalOrder(o)), [orders]);

  useEffect(() => {
    if (activeOrders.length === 0 && historyOrders.length > 0) {
      setListTab("history");
    }
    if (activeOrders.length > 0 && historyOrders.length === 0) {
      setListTab("active");
    }
  }, [activeOrders.length, historyOrders.length]);

  async function toggleDetail(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (orderItems[orderId]) return;
    setDetailLoadingId(orderId);
    setDetailError((prev) => ({ ...prev, [orderId]: "" }));
    try {
      const res = await apiFetch(`me/orders/${encodeURIComponent(orderId)}`);
      if (!res.ok) {
        const message = await parseApiErrorMessage(res);
        setDetailError((prev) => ({ ...prev, [orderId]: message }));
        return;
      }
      const payload = (await res.json()) as OrderDetailResponse;
      setOrderItems((prev) => ({ ...prev, [orderId]: payload.items ?? [] }));
    } catch {
      setDetailError((prev) => ({ ...prev, [orderId]: "載入訂單內容失敗。" }));
    } finally {
      setDetailLoadingId(null);
    }
  }

  function renderOrderCard(o: UiOrder) {
    const refLabel = orderRefLabel(o.id);
    const chipLabel = statusChipLabel(o);
    const chipCls = statusChipClass(o);
    const dateStr =
      o.createdAt && o.createdAt !== "-"
        ? new Date(o.createdAt).toLocaleDateString("zh-TW", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
        : null;
    const dateFull =
      o.createdAt && o.createdAt !== "-"
        ? new Date(o.createdAt).toLocaleString("zh-TW", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;

    const primaryAction = renderPrimaryAction(o);
    const showMaterials = canShowMaterialsLink(o.status);
    const statusLower = String(o.status || "").toLowerCase();

    return (
      <article
        key={o.id}
        className="rounded-3xl border border-[#ececf2] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition hover:shadow-[0_6px_16px_rgba(0,0,0,0.06)]"
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-6">
          {/* 左：金額 / 編號 / 查看明細 / 日期 */}
          <div className="min-w-0 lg:flex-[1.1]">
            <p className="mb-2.5 text-[34px] font-bold leading-none tracking-tight text-ds-heading tabular-nums">
              NT${o.total.toLocaleString()}
            </p>
            <div>
              <span className="font-semibold tabular-nums text-ds-body">{refLabel}</span>
              <button
                type="button"
                className="mt-0.5 block w-fit text-left text-sm font-semibold text-edu-primary underline-offset-4 transition-opacity hover:opacity-75 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
                onClick={() => void toggleDetail(o.id)}
                aria-expanded={expandedId === o.id}
              >
                {expandedId === o.id ? "收合明細" : "查看明細"}
                <span aria-hidden> →</span>
              </button>
            </div>
            {dateStr ? (
              <p className="mt-2.5 text-sm leading-snug text-[#888888]" title={dateFull ?? undefined}>
                成立時間 {dateStr}
              </p>
            ) : null}
          </div>

          {/* 中：Stepper（窄版輔助資訊） */}
          <div className="flex min-w-0 w-full flex-1 justify-center">
            <OrderFlowMini status={o.status} progressState={o.progressState} paymentProofPendingReviewCount={o.paymentProofPendingReviewCount} />
            {o.progressState.toLowerCase() === "rejected" ? (
              (() => {
                const detail = describePaymentRejection(o.rejectedReason, o.rejectedNote);
                return detail ? (
                  <p
                    data-testid="order-rejection-reason"
                    className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
                  >
                    退件原因：{detail}
                  </p>
                ) : null;
              })()
            ) : null}
          </div>

          {/* 右：狀態 + CTA 垂直群組、右對齊置中 */}
          <div className="flex w-full flex-col items-end justify-center gap-2.5 lg:w-[220px] lg:shrink-0">
            {/* testid：狀態徽章與流程圖的「審核中」文字相同，E2E 需要能只指到徽章。 */}
            <span
              data-testid="order-status-chip"
              className={`inline-flex h-8 w-fit shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-semibold ${chipCls}`}
            >
              {chipLabel}
            </span>
            {primaryAction ?? null}
          </div>
        </div>

        {statusLower === "approved" || statusLower === "completed" || statusLower === "paid" ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">付款已審核通過，教材已開放下載。</p>
        ) : null}

        {showMaterials ? (
          <div className="mt-3 border-t border-[#ececf2] pt-2.5">
            <p className="text-[13px] leading-relaxed text-ds-textMuted">
              教材已加入「我的教材」
              <AccentTextLink href="/me/materials" className="ml-1.5 inline font-semibold">
                查看教材 →
              </AccentTextLink>
            </p>
          </div>
        ) : null}

        {expandedId === o.id ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-[#ececf2] bg-[#fafafc]/90">
            <div className="border-b border-[#ececf2] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ds-textSubtle">訂單項目</p>
            </div>
            <div className="p-3">
              {detailLoadingId === o.id ? (
                <div className="flex items-center gap-2 text-sm text-ds-textMuted">
                  <span className="inline-block size-4 animate-spin rounded-full border-2 border-gray-200 border-t-edu-primary" />
                  載入明細中…
                </div>
              ) : null}
              {detailError[o.id] ? <p className="text-sm font-medium text-rose-600">{detailError[o.id]}</p> : null}
              {!detailLoadingId && !detailError[o.id] ? (
                (orderItems[o.id] ?? []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[260px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#ececf2] text-left text-[11px] font-semibold uppercase tracking-wide text-ds-textSubtle">
                          <th className="pb-2 pr-2 font-semibold">項目</th>
                          <th className="pb-2 pr-2 font-semibold tabular-nums">數量</th>
                          <th className="pb-2 font-semibold tabular-nums">小計</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ececf2]">
                        {(orderItems[o.id] ?? []).map((item) => (
                          <tr key={item.id}>
                            <td className="py-2 pr-2 font-medium text-edu-text">{item.material_title ?? "教材"}</td>
                            <td className="py-2 pr-2 tabular-nums text-ds-textMuted">{item.quantity ?? 1}</td>
                            <td className="py-2 font-semibold tabular-nums text-ds-heading">
                              NT${Math.floor(Number(item.subtotal ?? 0)).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-ds-textSubtle">僅供核對；金額以訂單總額為準。</p>
                  </div>
                ) : (
                  <p className="text-sm text-ds-textMuted">此訂單目前沒有明細資料。</p>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  function TabButton({
    active,
    label,
    count,
    onClick,
  }: {
    active: boolean;
    label: string;
    count: number;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className={`relative flex items-center gap-1.5 rounded-t-lg px-3 pb-2.5 pt-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus ${
          active ? "font-bold text-edu-primary" : "font-medium text-[#888888] hover:text-ds-body"
        }`}
      >
        <span>{label}</span>
        <span
          className={`inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${
            active ? "bg-edu-primary/15 text-edu-primary" : "bg-[#f0f0f5] text-[#888888]"
          }`}
        >
          {count}
        </span>
        {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-edu-primary" aria-hidden /> : null}
      </button>
    );
  }

  return (
    <AppShell withBottomNav className="bg-transparent">
      <div className="md:hidden">
        <MobileHeader title="我的訂單" backHref="/materials" right="none" />
      </div>
      <div className="mx-auto w-full max-w-[960px] bg-transparent px-4 pb-20 pt-6 md:px-6">
        {!token ? (
          <SurfaceCard elevation="raised" className="border-[#ececf2] p-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <p className="text-lg font-semibold text-ds-heading">請先登入</p>
            <p className="mt-2 text-sm leading-relaxed text-ds-textMuted">登入後可查看交易紀錄、付款進度與憑證狀態。</p>
            <PrimaryCtaLink href={`/login?redirect=${encodeURIComponent("/me/orders")}`} className="mt-6 inline-flex w-auto min-w-[200px]">
              前往登入
            </PrimaryCtaLink>
          </SurfaceCard>
        ) : null}

        {token ? (
          <div className="flex flex-col">
            <AccountPageHeaderOrders
              title="我的訂單"
              description="檢視付款與審核進度，已取得授權的教材請至「我的教材」。"
              aside={
                orders.length > 0 ? (
                  <>
                    <span className="font-medium text-ds-heading">{activeOrders.length}</span> 筆待處理訂單
                  </>
                ) : null
              }
            />

            {flashMessage ? (
              <SurfaceCard elevation="raised" className="mt-3 border-[#e6dcff] bg-[#f7f4ff] p-3 text-sm font-medium text-[#5b45d9]">
                {flashMessage}
              </SurfaceCard>
            ) : null}
            {notifications.length > 0 ? (
              <SurfaceCard elevation="raised" className="mt-3 border-[#ececf2] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ds-textSubtle">通知中心</p>
                <ul className="mt-2 space-y-2">
                  {notifications.slice(0, 3).map((n) => (
                    <li key={n.id} className="rounded-xl border border-[#ececf2] p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ds-heading">{n.title}</p>
                          <p className="text-xs text-ds-textMuted">{n.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            dismissNotification(n.id);
                            setNotifications(readNotifications());
                          }}
                          className="text-xs text-ds-textSubtle"
                        >
                          關閉
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </SurfaceCard>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
            {loading ? <OrderListSkeleton rows={3} /> : null}

            {!loading && error ? <QueryErrorBanner message={error} onRetry={() => void loadOrders()} /> : null}

            {!loading && !error && orders.length === 0 ? (
              <SurfaceCard elevation="raised" className="border-[#ececf2] px-6 py-14 text-center shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-ds-page text-2xl" aria-hidden>
                  📋
                </div>
                <p className="text-lg font-semibold text-ds-heading">尚無訂單</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ds-textMuted">
                  完成購買後，訂單紀錄與審核狀態會顯示於此。
                </p>
                <PrimaryCtaLink href="/explore" className="mt-8 inline-flex w-auto min-w-[200px]">
                  前往探索教材
                </PrimaryCtaLink>
              </SurfaceCard>
            ) : null}

            {!loading && !error && orders.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div role="tablist" aria-label="訂單分類" className="flex gap-1 border-b border-[#ececf2]">
                  <TabButton
                    active={listTab === "active"}
                    label="進行中"
                    count={activeOrders.length}
                    onClick={() => setListTab("active")}
                  />
                  <TabButton
                    active={listTab === "history"}
                    label="歷史訂單"
                    count={historyOrders.length}
                    onClick={() => setListTab("history")}
                  />
                </div>

                {listTab === "active" ? (
                  activeOrders.length > 0 ? (
                    <div className="flex flex-col gap-5">{activeOrders.map((o) => renderOrderCard(o))}</div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#dcdce8] bg-white px-4 py-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                      <p className="text-sm font-medium text-ds-textMuted">目前沒有進行中的訂單</p>
                      <p className="mt-1 text-xs text-ds-textSubtle">請切換至「歷史訂單」查看紀錄</p>
                    </div>
                  )
                ) : historyOrders.length > 0 ? (
                  <div className="flex flex-col gap-5">{historyOrders.map((o) => renderOrderCard(o))}</div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#dcdce8] bg-white px-4 py-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                    <p className="text-sm font-medium text-ds-textMuted">尚無歷史訂單</p>
                  </div>
                )}
              </div>
            ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
