"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "../../components/admin/KpiCard";
import { OrderStatusDonutPlaceholder } from "../../components/admin/OrderStatusDonutPlaceholder";
import { RecentOrdersTable } from "../../components/admin/RecentOrdersTable";
import { getAdminRecentOrders, getAdminStats } from "../../lib/edu-api-mock";
import type { MockAdminOrder, MockAdminStats } from "../../lib/mock-data";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<MockAdminStats | null>(null);
  const [orders, setOrders] = useState<MockAdminOrder[]>([]);

  useEffect(() => {
    void (async () => {
      const [s, o] = await Promise.all([getAdminStats(), getAdminRecentOrders()]);
      setStats(s);
      setOrders(o);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937] md:text-3xl">歡迎回來，Admin！</h1>
          <p className="mt-1 text-sm text-[#6B7280]">以下為 mock 資料，之後可接 Node.js API。</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#6B7280] shadow-sm">
          <span>日期</span>
          <input type="date" className="rounded-lg border-0 bg-transparent text-[#1F2937]" defaultValue="2026-04-01" />
          <span>—</span>
          <input type="date" className="rounded-lg border-0 bg-transparent text-[#1F2937]" defaultValue="2026-04-25" />
        </div>
      </div>

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="總營收" value={`$${stats.revenue.toLocaleString()}`} trend={stats.revenueTrend} />
          <KpiCard title="訂單總數" value={stats.orders.toLocaleString()} trend={stats.ordersTrend} />
          <KpiCard title="教材總數" value={stats.materials.toLocaleString()} trend={stats.materialsTrend} />
          <KpiCard title="用戶總數" value={stats.users.toLocaleString()} trend={stats.usersTrend} />
        </div>
      ) : (
        <p className="text-sm text-[#6B7280]">載入 KPI…</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {stats ? <OrderStatusDonutPlaceholder segments={stats.orderStatusDonut} /> : null}
        <RecentOrdersTable orders={orders} />
      </div>
    </div>
  );
}
