"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { OrderStatusTimeline, type TimelineItem } from "../../../../components/orders/OrderStatusTimeline";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import type { OrderDetailResponse } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";

export default function MyOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await apiFetch(`me/orders/${encodeURIComponent(orderId)}`);
      if (!res.ok) {
        if (!cancelled) setError(await parseApiErrorMessage(res));
        setLoading(false);
        return;
      }
      const json = (await res.json()) as OrderDetailResponse;
      if (!cancelled) setData(json);
      if (!cancelled) setLoading(false);
    })().catch(() => {
      if (!cancelled) setError("載入訂單失敗。");
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function buildTimeline(): TimelineItem[] {
    if (!data) return [];
    const order = data.order as Record<string, unknown>;
    const progress = String(order.order_progress_state || "");
    const latestProof = String(order.payment_proof_latest_status || "");
    const uploadedCount = Number(order.payment_proof_uploaded_count || 0);
    const rejectedNote = String(order.payment_proof_rejected_note || "").trim();

    const base: TimelineItem[] = [{ label: "訂單成立", tone: "completed", icon: "orderCreated" }];

    if (progress === "approved" || order.status === "approved") {
      return [
        ...base,
        { label: "已完成匯款", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", tone: "processing", icon: "proofUploaded" },
        { label: "已開放教材下載", tone: "completed", icon: "downloadReady" },
      ];
    }

    if (progress === "rejected" || latestProof === "rejected") {
      return [
        ...base,
        { label: "已完成匯款", tone: "completed", icon: "transferCompleted" },
        { label: "付款憑證未通過", tone: "failed", helper: rejectedNote || "請重新上傳付款憑證。", icon: "proofRejected" },
        { label: "等待開放下載", tone: "locked", icon: "locked" },
      ];
    }

    if (progress === "reviewing" || latestProof === "pending" || uploadedCount > 0) {
      return [
        ...base,
        { label: "已完成匯款", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", tone: "processing", icon: "proofUploaded" },
        { label: "平台審核中", tone: "processing", helper: "預計 6~24 小時完成審核", icon: "reviewing" },
        { label: "等待開放下載", tone: "locked", icon: "locked" },
      ];
    }

    return [
      ...base,
      { label: "已完成匯款", tone: "processing", helper: "請先完成轉帳", icon: "transferCompleted" },
      { label: "已送出付款憑證", tone: "locked", helper: "請先上傳付款憑證", icon: "proofUploaded" },
      { label: "平台審核中", tone: "locked", helper: "預計 6~24 小時完成審核", icon: "reviewing" },
      { label: "等待開放下載", tone: "locked", icon: "locked" },
    ];
  }

  const timeline = buildTimeline();

  return (
    <AppShell withBottomNav>
      <MobileHeader title="訂單詳情" backHref="/me/orders" right="none" />
      <main className="mx-auto w-full max-w-[860px] space-y-4 px-4 pb-24 pt-4 sm:px-6">
        <Card level="default">
          <h1 className="text-lg font-bold text-[#1F2937]">訂單編號：{orderId}</h1>
          {loading ? <p className="mt-2 text-sm text-[#6B7280]">載入中…</p> : null}
          {error ? <p className="mt-2 text-sm text-amber-700">{error}</p> : null}
          {data ? (
            <>
              <p className="mt-2 text-sm text-[#4B5563]">狀態：{data.order.status}</p>
              <p className="text-sm text-[#4B5563]">總金額：NT${Number(data.order.total_amount || 0).toLocaleString()}</p>
              <OrderStatusTimeline items={timeline} />
              <div className="mt-3 rounded-xl border border-[#ececf2] bg-[#fafafc] p-3 text-xs text-[#4B5563]">
                {(data.order as Record<string, unknown>).order_progress_state === "pending" ? "下一步：請先完成匯款並上傳付款憑證。" : null}
                {(data.order as Record<string, unknown>).order_progress_state === "reviewing" ? "下一步：平台審核中，完成後會以 Email 與站內通知提醒您。" : null}
                {(data.order as Record<string, unknown>).order_progress_state === "rejected" ? "下一步：請依退件原因重新上傳憑證。" : null}
                {(data.order as Record<string, unknown>).order_progress_state === "approved" ? "下一步：可前往我的教材下載已授權教材。" : null}
              </div>
              <ul className="mt-3 divide-y divide-[#F3F4F6]">
                {data.items.map((item) => (
                  <li key={item.id} className="flex justify-between py-2 text-sm">
                    <span>{item.material_title}</span>
                    <span>NT${Number(item.subtotal || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <Link href="/me/orders" className="flex-1">
                  <Button intent="neutral" variant="outline" fullWidth>
                    返回訂單列表
                  </Button>
                </Link>
                {data.order.status === "pending_payment" ? (
                  <Link href={`/orders/${encodeURIComponent(orderId)}/payment-proof`} className="flex-1">
                    <Button intent="flow" fullWidth>
                      {(data.order as Record<string, unknown>).payment_proof_latest_status === "rejected" ? "重新上傳付款憑證" : "上傳付款憑證"}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      </main>
    </AppShell>
  );
}
