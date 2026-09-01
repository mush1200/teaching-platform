"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { OrderStatusTimeline, type TimelineItem } from "../../../../components/orders/OrderStatusTimeline";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import type { OrderDetailResponse } from "../../../../lib/api-types";
import { describePaymentRejection } from "../../../../lib/payment-rejection";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";
import { PAYMENT_REVIEW_SLA_SHORT } from "../../../../lib/payment-timing";

/**
 * 付款期限的買家可見文案。**`payment_due_at` 為 null 時不推算、不顯示。**
 */
function formatPaymentDue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

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

  /**
   * Timeline 一律依 Backend 的 canonical `order_progress_state` 分支。
   *
   * 舊版在每個分支各補一個 fallback（`latestProof === "rejected"`、`uploadedCount > 0`），
   * 等於前端自己又推導了一次進度 —— 這正是列表與詳情可以講出不同故事的來源。
   * 「最新一筆憑證決定進度」的判斷只存在於 Backend 一處（`COR-01`）。
   */
  function buildTimeline(): TimelineItem[] {
    if (!data) return [];
    const order = data.order as Record<string, unknown>;
    const progress = String(order.order_progress_state || "");
    /* 結構化原因優先，備註作為補充（`lib/payment-rejection.ts`）。 */
    const rejectionDetail = describePaymentRejection(
      order.payment_proof_rejected_reason,
      order.payment_proof_rejected_note,
    );

    const base: TimelineItem[] = [{ label: "訂單成立", tone: "completed", icon: "orderCreated" }];

    if (progress === "approved" || order.status === "approved") {
      return [
        ...base,
        { label: "已完成匯款", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", tone: "processing", icon: "proofUploaded" },
        { label: "已開放教材下載", tone: "completed", icon: "downloadReady" },
      ];
    }

    // 已取消是終態（`COR-03`）：沒有匯款、沒有審核、也沒有可解鎖的下載。
    // 少了這一條會落到最後的預設分支，對一張已取消的訂單說「請先完成轉帳」。
    if (progress === "cancelled") {
      return [
        ...base,
        { label: "訂單已取消", tone: "failed", helper: "這張訂單已取消，不需要再付款。", icon: "proofRejected" },
      ];
    }

    if (progress === "rejected") {
      return [
        ...base,
        { label: "已完成匯款", tone: "completed", icon: "transferCompleted" },
        { label: "付款憑證未通過", tone: "failed", helper: rejectionDetail ? `${rejectionDetail}。請依說明修正後重新上傳付款憑證。` : "請重新上傳付款憑證。", icon: "proofRejected" },
        { label: "等待開放下載", tone: "locked", icon: "locked" },
      ];
    }

    if (progress === "reviewing" || progress === "proof_uploaded") {
      return [
        ...base,
        { label: "已完成匯款", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", tone: "processing", icon: "proofUploaded" },
        { label: "平台審核中", tone: "processing", helper: PAYMENT_REVIEW_SLA_SHORT, icon: "reviewing" },
        { label: "等待開放下載", tone: "locked", icon: "locked" },
      ];
    }

    return [
      ...base,
      { label: "已完成匯款", tone: "processing", helper: "請先完成轉帳", icon: "transferCompleted" },
      { label: "已送出付款憑證", tone: "locked", helper: "請先上傳付款憑證", icon: "proofUploaded" },
      { label: "平台審核中", tone: "locked", helper: PAYMENT_REVIEW_SLA_SHORT, icon: "reviewing" },
      { label: "等待開放下載", tone: "locked", icon: "locked" },
    ];
  }

  const timeline = buildTimeline();
  /** 進度文案、CTA、timeline 三者共用同一個來源，不得各自解讀 `orders.status`。 */
  const progressState = String((data?.order as Record<string, unknown> | undefined)?.order_progress_state || "");

  return (
    <AppShell withBottomNav>
      <MobileHeader title="訂單詳情" backHref="/me/orders" right="none" />
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 pb-24 pt-4 sm:px-6">
        <Card level="default">
          <h1 className="text-lg font-bold text-[#1F2937]">訂單編號：{orderId}</h1>
          {loading ? <p className="mt-2 text-sm text-[#6B7280]">載入中…</p> : null}
          {error ? <p className="mt-2 text-sm text-amber-700">{error}</p> : null}
          {data ? (
            <>
              <p className="mt-2 text-sm text-[#4B5563]">狀態：{data.order.status}</p>
              <p className="text-sm text-[#4B5563]">總金額：NT${Number(data.order.total_amount || 0).toLocaleString()}</p>
              {/*
                * 付款期限只在**尚未付款**時才有意義；已核准的訂單再顯示期限只會製造疑慮。
                * `payment_due_at` 為 null（legacy 訂單）時**不顯示任何期限** ——
                * 那些訂單從未被揭露過期限，前端不得自行補算。
                */}
              {data.order.status === "pending_payment" && data.order.payment_due_at ? (
                <p className="text-sm text-[#4B5563]">
                  付款期限：{formatPaymentDue(data.order.payment_due_at)} 前
                </p>
              ) : null}
              <OrderStatusTimeline items={timeline} />
              <div className="mt-3 rounded-xl border border-[#ececf2] bg-[#fafafc] p-3 text-xs text-[#4B5563]">
                {progressState === "pending" && data.order.payment_submission_allowed !== false
                  ? "下一步：請先完成匯款並上傳付款憑證。"
                  : null}
                {data.order.payment_submission_allowed === false
                  ? "此訂單的付款期限已過，無法再提交付款憑證。如仍要購買，請重新建立訂單。"
                  : null}
                {progressState === "reviewing" ? "下一步：平台審核中，完成後會以 Email 與站內通知提醒您。" : null}
                {progressState === "rejected" && data.order.payment_submission_allowed !== false
                  ? "下一步：請依退件原因重新上傳憑證。"
                  : null}
                {progressState === "approved" ? "下一步：可前往我的教材下載已授權教材。" : null}
              </div>
              {/*
                * 申訴入口（P1-09 Gate 3 / Wave 2 #10）。
                * 放在訂單詳情 —— 那是「正確的交易 context」：帶著 orderId 進入表單，
                * backend 會驗證這張訂單確實屬於本人（非本人 403 `order_not_owned`）。
                */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/me/complaints/new?orderId=${encodeURIComponent(orderId)}`}
                  className="inline-flex min-h-11 items-center rounded-xl border border-[#ececf2] px-4 text-sm font-semibold text-[#4B5563]"
                  data-testid="order-complaint-link"
                >
                  對這筆訂單提出申訴
                </Link>
                <Link
                  href="/me/complaints"
                  className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-[#6C63FF]"
                >
                  我的申訴
                </Link>
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
                {/*
                  * 審核中**不給**上傳入口：買家已經送出憑證，正在等平台審核，
                  * 再叫他上傳一次只會產生重複憑證與焦慮（`COR-01`）。
                  * 這裡與列表頁的「等待審核中」是同一個判斷依據。
                  */}
                {progressState === "reviewing" ? (
                  <span className="flex flex-1 items-center justify-center rounded-xl border border-[#ececf2] bg-[#fafafc] px-4 py-2 text-sm font-semibold text-[#666666]">
                    等待審核中
                  </span>
                ) : null}
                {/*
                  * 付款期限已過且從未於期限內提交過（Wave 2 #12）——
                  * **不顯示按了必定 409 的 CTA**。
                  * 判準是 backend 的 `payment_submission_allowed`，前端不比日期：
                  * 逾期但曾於期限內提交過的訂單（A2）仍會顯示重新上傳。
                  */}
                {data.order.status === "pending_payment" &&
                progressState !== "reviewing" &&
                data.order.payment_submission_allowed === false ? (
                  <span
                    data-testid="order-payment-blocked"
                    className="flex flex-1 items-center justify-center rounded-xl border border-edu-error/40 bg-status-rejectedBg px-4 py-2 text-sm font-semibold text-status-rejectedText"
                  >
                    付款期限已過，無法再提交
                  </span>
                ) : null}
                {data.order.status === "pending_payment" &&
                progressState !== "reviewing" &&
                data.order.payment_submission_allowed !== false ? (
                  <Link href={`/orders/${encodeURIComponent(orderId)}/payment-proof`} className="flex-1">
                    <Button intent="flow" fullWidth data-testid="order-upload-proof-cta">
                      {progressState === "rejected" ? "重新上傳付款憑證" : "上傳付款憑證"}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
