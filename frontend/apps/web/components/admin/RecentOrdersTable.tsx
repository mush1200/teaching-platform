import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";
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

function statusClass(status: string): string {
  if (status === "pending_payment") return "bg-[#FFE4E6] text-[#FF6B73]";
  if (status === "paid" || status === "approved") return "bg-[#EDE9FE] text-[#6C63FF]";
  if (status === "cancelled") return "bg-gray-100 text-gray-600";
  return "bg-slate-100 text-slate-700";
}

function formatDate(date?: string): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString("zh-TW", { hour12: false });
}

export function RecentOrdersTable({ orders, loading, error }: Props) {
  return (
    <section className="overflow-hidden rounded-3xl border border-[#E5E7EB]/80 bg-white shadow-sm">
      <div className="border-b border-[#E5E7EB]/80 px-5 py-4">
        <h2 className="text-lg font-bold text-[#1F2937]">最近訂單</h2>
      </div>
      <div className="p-4">
        {loading ? <LoadingState title="載入訂單中…" /> : null}
        {!loading && error ? <ErrorState title="訂單載入失敗" description={error} /> : null}
        {!loading && !error && orders.length === 0 ? <EmptyState title="沒有訂單資料" description="目前查無可顯示的訂單。" /> : null}
      </div>
      {!loading && !error && orders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#FAFAFA] text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-5 py-3">訂單編號</th>
                <th className="px-5 py-3">用戶</th>
                <th className="px-5 py-3">金額</th>
                <th className="px-5 py-3">狀態</th>
                <th className="px-5 py-3">時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-[#FAFAFF]/80">
                  <td className="px-5 py-3 font-mono text-[#1F2937]">{order.id}</td>
                  <td className="px-5 py-3 text-[#4B5563]">{order.user_id ?? "-"}</td>
                  <td className="px-5 py-3 font-semibold text-[#1F2937]">
                    NT${Math.floor(Number(order.total_amount ?? order.total_price ?? 0)).toLocaleString("zh-TW")}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#6B7280]">{formatDate(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
