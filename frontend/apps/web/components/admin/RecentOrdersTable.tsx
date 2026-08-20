import { AccentTextLink, EmptyState, ErrorState, LoadingState, SurfaceCard } from "../ds";
import type { Order } from "../../lib/api-types";

type Props = {
  orders: Order[];
  loading: boolean;
  error: string | null;
};

function statusLabel(status: string): string {
  if (status === "pending_payment") return "待付款";
  if (status === "paid") return "已付款";
  if (status === "approved") return "已核准";
  if (status === "cancelled") return "已取消";
  return status;
}

/**
 * 訂單狀態 → canonical `status.*` token（`tailwind.config.ts`；數值見 `docs/design-tokens-v1.1.md` §2.4）。
 *
 * - `paid` 是 legacy 值，Backend 啟動時會 normalize 成 `approved`（`bootstrapModel.js`），
 *   此處沿用原有分組，不改判斷邏輯。
 * - `cancelled` 目前沒有語意精確的 status token，維持中性灰（非 arbitrary hex）。
 */
function statusClass(status: string): string {
  if (status === "pending_payment") return "bg-status-pendingPaymentBg text-status-pendingPaymentText";
  if (status === "paid" || status === "approved") return "bg-status-approvedBg text-status-approvedText";
  if (status === "cancelled") return "bg-gray-100 text-gray-600";
  return "bg-slate-100 text-slate-700";
}

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
 * Dashboard 摘要 widget。
 *
 * 欄寬策略：「訂單／用戶」欄吃 `w-full max-w-0` 並 truncate，其餘欄 `w-px whitespace-nowrap`
 * 收縮至內容寬。如此 status 在任何寬度都不會被推出可視範圍，也不需要 horizontal scroll。
 * 「時間」為最低優先欄位，`sm` 以下隱藏。
 *
 * 不畫 `<thead>`：四個欄位的內容本身已自明（mono 識別碼／NT$ 金額／彩色狀態徽章／日期），
 * 欄位標籤帶只會多出一條 36px 的裝飾，並讓本卡比同筆數的「最近活動」高一截。
 * 無障礙標籤改由 `<caption class="sr-only">` 與各列的 `title` 提供。
 */
export function RecentOrdersTable({ orders, loading, error }: Props) {
  return (
    <SurfaceCard elevation="raised" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-ds-borderMuted px-4 py-3">
        <h2 className="text-title text-ds-heading">最近訂單</h2>
        <AccentTextLink href="/admin/orders" className="text-sm">
          查看全部
        </AccentTextLink>
      </header>

      {loading || error || orders.length === 0 ? (
        <div className="p-4">
          {loading ? <LoadingState title="載入訂單中…" /> : null}
          {!loading && error ? <ErrorState title="訂單載入失敗" description={error} /> : null}
          {!loading && !error && orders.length === 0 ? (
            <EmptyState title="沒有訂單資料" description="目前查無可顯示的訂單。" />
          ) : null}
        </div>
      ) : (
        /* 欄寬策略下不應觸發捲動；overflow-x-auto 僅作安全網，避免極端內容被靜默裁掉。 */
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-left text-sm">
            <caption className="sr-only">最近訂單：訂單編號與用戶、金額、狀態、建立時間</caption>
            <tbody className="divide-y divide-ds-borderMuted">
              {orders.map((order) => {
                const when = formatDateParts(order.created_at);
                return (
                  <tr key={order.id} className="align-middle hover:bg-ds-surfaceMuted">
                    <td className="w-full max-w-0 py-2.5 pl-4 pr-3">
                      <p className="truncate font-mono text-sm font-medium text-ds-heading" title={order.id}>{order.id}</p>
                      <p className="truncate font-mono text-meta text-ds-textSubtle" title={order.user_id ?? undefined}>{order.user_id ?? "-"}</p>
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ds-heading">
                      NT${Math.floor(Number(order.total_amount ?? order.total_price ?? 0)).toLocaleString("zh-TW")}
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
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
