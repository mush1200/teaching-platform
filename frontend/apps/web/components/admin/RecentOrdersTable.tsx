import type { MockAdminOrder } from "../../lib/mock-data";

const statusLabel: Record<MockAdminOrder["status"], string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
  cancelled: "已取消",
};

const statusClass: Record<MockAdminOrder["status"], string> = {
  pending: "bg-[#FFE4E6] text-[#FF6B73]",
  processing: "bg-[#EDE9FE] text-[#6C63FF]",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600",
};

type Props = {
  orders: MockAdminOrder[];
};

export function RecentOrdersTable({ orders }: Props) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#E5E7EB]/80 bg-white shadow-sm">
      <div className="border-b border-[#E5E7EB]/80 px-5 py-4">
        <h2 className="text-lg font-bold text-[#1F2937]">最近訂單</h2>
      </div>
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
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-[#FAFAFF]/80">
                <td className="px-5 py-3 font-mono text-[#1F2937]">{o.id}</td>
                <td className="px-5 py-3 text-[#4B5563]">{o.user}</td>
                <td className="px-5 py-3 font-semibold text-[#1F2937]">NT${o.amount.toLocaleString()}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[o.status]}`}>
                    {statusLabel[o.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#6B7280]">{o.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
