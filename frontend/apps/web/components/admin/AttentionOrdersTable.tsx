import Link from "next/link";
import { AccentTextLink, EmptyState, ErrorState, LoadingState, StatusPill, SurfaceCard } from "../ds";
import {
  adminOrderOperationalStatusLabel,
  adminOrderOperationalStatusTone,
} from "../../lib/admin-labels";
import type { Order } from "../../lib/api-types";

type Props = {
  orders: Order[];
  loading: boolean;
  error: string | null;
};

/** 拆成日期／時間兩行，讓「時間」欄在窄卡片內只佔一個日期寬，不必犧牲年份或改用橫向捲動。 */
function formatDateParts(date?: string): { date: string; time: string } {
  if (!date) return { date: "-", time: "" };
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return { date, time: "" };
  return {
    date: parsed.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }),
    time: parsed.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

/**
 * 這張訂單「需要注意」的原因在付款憑證上 —— 兩個 attention 狀態
 * （`pending_review` / `payment_rejected`）都是由 `manual_payment_proofs.review_status`
 * 衍生出來的。因此點進去要落在**付款審核**這個既有 operational surface，
 * 並用 `status=all` 讓該訂單的 pending 與 rejected 憑證同時看得到
 * （預設篩選是 `pending`，只帶 `q` 會把被退回的那一筆藏起來）。
 *
 * Dashboard 不長出自己的審核介面，也不建立第二套 workflow：這裡只是一條深連結。
 */
function paymentReviewHref(orderId: string): string {
  return `/admin/payment-proofs?status=all&q=${encodeURIComponent(orderId)}`;
}

/**
 * Dashboard「需要注意的訂單」（IA-04）。
 *
 * 取代舊的「最近訂單」。舊版是純時間序的 latest-N —— 它回答「最近有人買東西嗎」，
 * 而那個問題已經由「新增訂單」KPI 與趨勢圖回答了，Admin 從中得不到任何行動。
 * 現在只顯示 Backend `operational_status` 判定為需要處理的訂單
 * （`ATTENTION_ORDER_STATUSES`），資料仍由 API 篩選，前端不自行推導狀態。
 *
 * 空清單是**好消息**，不是錯誤：代表沒有卡住的付款。文案要說得出這件事，
 * 不能沿用「查無資料」那種讓人以為壞掉的說法。
 *
 * 欄寬策略：「訂單／用戶」欄吃 `w-full max-w-0` 並 truncate，其餘欄 `w-px whitespace-nowrap`
 * 收縮至內容寬。如此 status 在任何寬度都不會被推出可視範圍，也不需要 horizontal scroll。
 * 「時間」為最低優先欄位，`sm` 以下隱藏。
 */
export function AttentionOrdersTable({ orders, loading, error }: Props) {
  return (
    <SurfaceCard elevation="raised" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-ds-borderMuted px-4 py-3">
        <h2 className="text-title text-ds-heading">需要注意的訂單</h2>
        <AccentTextLink href="/admin/orders" className="text-sm">
          查看全部
        </AccentTextLink>
      </header>

      {loading || error || orders.length === 0 ? (
        <div className="p-4">
          {loading ? <LoadingState title="載入訂單中…" /> : null}
          {!loading && error ? <ErrorState title="訂單載入失敗" description={error} /> : null}
          {!loading && !error && orders.length === 0 ? (
            <EmptyState
              title="目前沒有需要注意的訂單"
              description="待審核與被退回的付款都已處理完畢。"
            />
          ) : null}
        </div>
      ) : (
        /* 欄寬策略下不應觸發捲動；overflow-x-auto 僅作安全網，避免極端內容被靜默裁掉。 */
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-left text-sm">
            <caption className="sr-only">需要注意的訂單：訂單編號與用戶、金額、處理狀態、建立時間</caption>
            <tbody className="divide-y divide-ds-borderMuted">
              {orders.map((order) => {
                const when = formatDateParts(order.created_at);
                return (
                  <tr key={order.id} data-testid="attention-order-row" className="align-middle hover:bg-ds-surfaceMuted">
                    <td className="w-full max-w-0 py-2.5 pl-4 pr-3">
                      <Link
                        href={paymentReviewHref(order.id)}
                        className="block truncate font-mono text-sm font-medium text-ds-heading underline decoration-transparent underline-offset-2 hover:decoration-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
                        title={`查看訂單 ${order.id} 的付款憑證`}
                      >
                        {order.id}
                      </Link>
                      <p className="truncate font-mono text-meta text-ds-textSubtle" title={order.user_id ?? undefined}>
                        {order.user_id ?? "-"}
                      </p>
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ds-heading">
                      NT${Math.floor(Number(order.total_amount ?? order.total_price ?? 0)).toLocaleString("zh-TW")}
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5">
                      {/* 徽章讀 Backend 的 operational_status，不是 orders.status —— 與 /admin/orders 同一份 mapping。 */}
                      <StatusPill
                        label={adminOrderOperationalStatusLabel(order.operational_status)}
                        tone={adminOrderOperationalStatusTone(order.operational_status)}
                      />
                    </td>
                    <td className="hidden w-px whitespace-nowrap py-2.5 pl-3 pr-4 text-meta text-ds-textMuted sm:table-cell">
                      <span className="block">{when.date}</span>
                      <span className="block">{when.time}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  );
}
