"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountPageHeaderOrders } from "../../../../components/account/ProductAccountChrome";
import { PrimaryCtaLink, SurfaceCard } from "../../../../components/ds";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { OrderStatusTimeline, type TimelineItem } from "../../../../components/orders/OrderStatusTimeline";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../../../lib/api-client";
import { trackEvent } from "../../../../lib/analytics";
import { pushNotification } from "../../../../lib/notifications";
import type { OrderDetailResponse } from "../../../../lib/api-types";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

export default function PaymentProofPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const token = getStoredToken();
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderInfoOpen, setOrderInfoOpen] = useState(false);
  const [idempotencyKey] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const [orderDetail, setOrderDetail] = useState<OrderDetailResponse | null>(null);
  const flash = useMemo(() => search.get("flash"), [search]);

  useEffect(() => {
    if (flash === "order_created_email_sent") {
      setMsg("訂單成立通知已寄送至您的 Email。");
    }
  }, [flash]);

  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => router.push("/me/orders?flash=proof_uploaded"), 1200);
    return () => window.clearTimeout(timer);
  }, [submitted, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`me/orders/${encodeURIComponent(orderId)}`);
      if (!res.ok || cancelled) return;
      const payload = (await res.json()) as OrderDetailResponse;
      if (!cancelled) setOrderDetail(payload);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId, token, submitted]);

  function formatTime(value?: string | null): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function buildTimeline(): TimelineItem[] {
    const progress = String(orderDetail?.order?.order_progress_state || "");
    const createdAt = formatTime(orderDetail?.order?.created_at);
    const latestUploadAt = formatTime(orderDetail?.order?.payment_proof_latest_uploaded_at);
    const latestReviewAt = formatTime(orderDetail?.order?.payment_proof_latest_reviewed_at);
    const rejectedNote = String(orderDetail?.order?.payment_proof_rejected_note || "").trim();

    if (progress === "approved" || orderDetail?.order?.status === "approved") {
      return [
        { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
        { label: "已完成匯款", helper: latestUploadAt || "已收到匯款憑證", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", helper: latestUploadAt || "等待平台審核", tone: "processing", icon: "proofUploaded" },
        { label: "平台審核中", helper: latestReviewAt || "已完成審核", tone: "completed", icon: "reviewing" },
        { label: "已開放教材下載", helper: "可前往我的教材下載", tone: "completed", icon: "downloadReady" },
      ];
    }

    if (progress === "rejected") {
      return [
        { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
        { label: "已完成匯款", helper: latestUploadAt || "已收到匯款憑證", tone: "completed", icon: "transferCompleted" },
        { label: "付款憑證未通過", helper: rejectedNote || "請重新上傳付款憑證", tone: "failed", icon: "proofRejected" },
        { label: "等待開放下載", helper: latestReviewAt || "待重新送件", tone: "locked", icon: "locked" },
      ];
    }

    if (submitted || progress === "reviewing") {
      return [
        { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
        { label: "已完成匯款", helper: latestUploadAt || "匯款完成", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", helper: latestUploadAt || "等待平台審核", tone: "processing", icon: "proofUploaded" },
        { label: "平台審核中", helper: "預計 6~24 小時完成審核", tone: "processing", icon: "reviewing" },
      ];
    }

    return [
      { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
      { label: "已完成匯款", helper: "請先完成轉帳", tone: "processing", icon: "transferCompleted" },
      { label: "已送出付款憑證", helper: "上傳後平台將進行審核", tone: "processing", icon: "proofUploaded" },
      { label: "平台審核中", helper: "預計 6~24 小時完成審核", tone: "locked", icon: "reviewing" },
    ];
  }

  const timeline = buildTimeline();

  function onPick(nextFiles: File[]) {
    setProofFiles(nextFiles.slice(0, MAX_FILES));
  }

  async function submit() {
    setMsg(null);
    if (proofFiles.length < 1) return setMsg("請至少上傳 1 張憑證圖片。");
    if (proofFiles.length > MAX_FILES) return setMsg("最多只能上傳 3 張憑證圖片。");
    const invalidType = proofFiles.find((f) => !ACCEPTED_TYPES.has(f.type));
    if (invalidType) return setMsg("僅支援 JPG、JPEG、PNG、WEBP 圖檔。");
    const oversized = proofFiles.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) return setMsg(`檔案「${oversized.name}」超過 10MB。`);
    if (!token) return setMsg("請先登入。");

    setLoading(true);
    trackEvent("proof_upload_clicked", { orderId, fileCount: proofFiles.length });
    try {
      const body = new FormData();
      proofFiles.forEach((file) => body.append("proofs", file));
      const res = await apiFetch(`orders/${encodeURIComponent(orderId)}/payment-proof`, {
        method: "POST",
        body,
        headers: { "x-idempotency-key": idempotencyKey },
      });
      if (!res.ok) {
        setMsg(await parseApiErrorMessage(res));
        return;
      }
      setSubmitted(true);
      trackEvent("proof_uploaded", { orderId });
      pushNotification({
        tone: "success",
        title: "付款憑證已送出",
        body: "平台已收到您的憑證，正在安排人工審核。",
      });
      setMsg("已收到付款憑證，目前等待人工審核。");
      setProofFiles([]);
    } catch {
      setMsg("上傳失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell withBottomNav className="bg-transparent">
      <div className="md:hidden">
        <MobileHeader title="付款憑證" backHref="/me/orders" right="none" />
      </div>
      <main className="mx-auto w-full max-w-[1120px] bg-transparent px-4 pb-20 pt-6 md:px-6">
        <div className="mx-auto max-w-[1040px] space-y-4">
          <AccountPageHeaderOrders title="上傳付款憑證" description="完成匯款後，請上傳圖檔憑證，平台將進行人工審核。" />
          {!token ? (
            <SurfaceCard elevation="raised" className="rounded-3xl border-[#ececf2] bg-white p-8 text-center shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
              <p className="text-lg font-semibold text-ds-heading">請先登入</p>
              <p className="mt-2 text-sm text-ds-textMuted">需要登入才能提交憑證。</p>
              <PrimaryCtaLink href={`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment-proof`)}`} className="mt-5 inline-flex w-auto min-w-[200px]">
                前往登入
              </PrimaryCtaLink>
            </SurfaceCard>
          ) : (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <SurfaceCard elevation="raised" className="rounded-3xl border-[#ececf2] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                  <button
                    type="button"
                    onClick={() => setOrderInfoOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl border border-[#ececf2] bg-[#fafafc] px-3 py-2.5 text-left"
                  >
                    <span className="text-sm font-semibold text-[#1F2937]">訂單資訊</span>
                    <span className="text-sm text-[#6B7280]">{orderInfoOpen ? "收合 ▴" : "展開 ▾"}</span>
                  </button>
                  {orderInfoOpen ? (
                    <div className="mt-3 rounded-xl border border-[#ececf2] bg-white p-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ds-textSubtle">訂單資訊明細</p>
                      <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                        <p className="text-[#6B7280]">訂單編號</p>
                        <p className="font-medium text-[#4B5563]">{orderId}</p>
                        <p className="text-[#6B7280]">訂單成立時間</p>
                        <p className="font-medium text-[#4B5563]">{formatTime(orderDetail?.order?.created_at) || "—"}</p>
                        <p className="text-[#6B7280]">付款方式</p>
                        <p className="font-medium text-[#4B5563]">銀行轉帳（代碼 812）</p>
                        <p className="text-[#6B7280]">付款金額</p>
                        <p className="text-[28px] font-extrabold leading-none tracking-tight text-[#6C63FF]">
                          NT${Number(orderDetail?.order?.total_amount || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="my-3 h-px w-full bg-[#ececf2]" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ds-textSubtle">付款憑證</p>
                  <p className="mt-1 text-sm font-medium text-[#777777]">訂單編號：{orderId}</p>
                  <p className="mt-1 text-sm text-[#6B7280]">付款方式：銀行轉帳（代碼 812）</p>
                  <div className="mt-2 rounded-xl border border-[#ececf2] bg-[#fafafc] p-3 text-xs leading-relaxed text-[#4B5563]">
                    <p>銀行名稱：Teaching Platform 收款帳戶</p>
                    <p>銀行代碼：812</p>
                    <p>匯款帳號：1234-5678-9012-3456</p>
                    <p>戶名：Teaching Platform Co.</p>
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                    <p>人工審核時段：每日 10:00 - 19:00</p>
                    <p>平均審核時間：6-24 小時</p>
                    <p>通知管道：Email + 我的訂單頁面</p>
                  </div>
                </SurfaceCard>

                <SurfaceCard elevation="raised" className="rounded-3xl border-[#ececf2] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                  <p className="text-sm font-semibold text-[#1F2937]">上傳付款憑證</p>
                  <p className="mt-1 text-xs text-[#6B7280]">請上傳匯款憑證圖片成功的畫面截圖。</p>
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onPick(Array.from(e.dataTransfer.files || []));
                    }}
                    className="mt-3 block cursor-pointer rounded-2xl border-2 border-dashed border-[#D8D2FF] bg-[#FAF8FF] p-6 text-center"
                  >
                    <p className="text-sm font-semibold text-ds-body">點擊上傳或拖拉檔案到此</p>
                    <p className="mt-1 text-xs text-ds-textMuted">支援 JPG/JPEG/PNG/WEBP，單張最大 10MB，最多 3 張</p>
                    <input
                      type="file"
                      className="hidden"
                      aria-label="拖拉圖檔到此處，或點擊選擇檔案"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => onPick(Array.from(e.currentTarget.files ?? []))}
                    />
                  </label>
                  {proofFiles.length > 0 ? (
                    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {proofFiles.map((f) => (
                        <li key={`${f.name}-${f.lastModified}`} className="overflow-hidden rounded-xl border border-[#ececf2] bg-white p-2">
                          <img src={URL.createObjectURL(f)} alt={f.name} className="h-20 w-full rounded-lg object-cover" />
                          <p className="mt-1 line-clamp-1 text-xs text-[#6B7280]">{f.name}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="inline-flex h-[42px] w-full items-center justify-center rounded-xl bg-intent-action px-5 py-0 text-sm font-semibold text-white shadow-button-action disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={loading}
                      onClick={() => void submit()}
                    >
                      {loading ? "送出中…" : "送出憑證"}
                    </button>
                    <Link href="/me/orders" className="inline-flex h-[42px] w-full items-center justify-center rounded-xl border border-[#ececf2] bg-white px-5 text-sm font-semibold text-ds-body">
                      返回我的訂單
                    </Link>
                    {(String(orderDetail?.order?.order_progress_state || "") === "approved" || String(orderDetail?.order?.status || "") === "approved") ? (
                      <Link href="/me/materials" className="inline-flex h-[42px] w-full items-center justify-center rounded-xl border border-[#dcd0ff] bg-[#f7f4ff] px-5 text-sm font-semibold text-[#6C63FF]">
                        前往我的教材
                      </Link>
                    ) : null}
                  </div>
                  {msg ? <p className={`mt-3 text-sm ${msg.includes("失敗") || msg.includes("請") || msg.includes("超過") ? "text-amber-700" : "text-emerald-700"}`}>{msg}</p> : null}
                </SurfaceCard>
              </div>

              <div className="lg:sticky lg:top-20 lg:h-fit">
                <OrderStatusTimeline title="訂單進度 Timeline" items={timeline} className="shadow-[0_4px_12px_rgba(0,0,0,0.04)]" />
              </div>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}
