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
import { pushNotification } from "../../../../lib/notifications";
import type { OrderDetailResponse } from "../../../../lib/api-types";
import { describePaymentRejection } from "../../../../lib/payment-rejection";
import { usePaymentBankInfo } from "../../../../lib/payment-bank-info";
import { BankTransferInfo } from "../../../../components/payment/BankTransferInfo";
import {
  PAYMENT_REVIEW_SLA_SHORT,
  PAYMENT_REVIEW_SLA_TEXT,
  PAYMENT_DUE_UNSET_TEXT,
  PAYMENT_DEADLINE_EXPIRED_TITLE,
  PAYMENT_DEADLINE_EXPIRED_BODY,
} from "../../../../lib/payment-timing";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

/**
 * 付款期限的買家可見文案。
 *
 * **`payment_due_at` 為 null 時絕不推算** —— legacy 訂單從未被揭露過期限，
 * 顯示一個前端算出來的日期等於事後補造契約事實。
 */
function formatPaymentDue(value?: string | null): string {
  if (!value) return PAYMENT_DUE_UNSET_TEXT;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return PAYMENT_DUE_UNSET_TEXT;
  // 期限是「那一天的終了」，因此顯示日期即可（與 §18 I(2) 的「付款期日」一致）。
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function PaymentProofPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const token = getStoredToken();
  const bankInfo = usePaymentBankInfo();
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /*
   * 買家申報的付款辨識資訊（P1-09 Gate 6）。**四個欄位皆為選填** ——
   * 既有流程允許只上傳圖片，新增欄位不得把它變成必填。
   * 這些是「買家說的」，平台核帳時會另行記錄實際入帳事實，兩者並存。
   */
  const [reportedBankName, setReportedBankName] = useState("");
  const [reportedAccountLast4, setReportedAccountLast4] = useState("");
  const [reportedAmount, setReportedAmount] = useState("");
  const [reportedTransferAt, setReportedTransferAt] = useState("");
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
    const rejectionDetail = describePaymentRejection(
      orderDetail?.order?.payment_proof_rejected_reason,
      orderDetail?.order?.payment_proof_rejected_note,
    );

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
        { label: "付款憑證未通過", helper: rejectionDetail ? `${rejectionDetail}。請依說明修正後重新上傳付款憑證。` : "請重新上傳付款憑證", tone: "failed", icon: "proofRejected" },
        { label: "等待開放下載", helper: latestReviewAt || "待重新送件", tone: "locked", icon: "locked" },
      ];
    }

    // 已取消是終態（`COR-03`）：這一頁的預設分支會叫買家「請先完成轉帳」，
    // 但已取消的訂單沒有付款動作可做。
    if (progress === "cancelled") {
      return [
        { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
        { label: "訂單已取消", helper: "這張訂單已取消，不需要再付款。", tone: "failed", icon: "proofRejected" },
      ];
    }

    if (submitted || progress === "reviewing") {
      return [
        { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
        { label: "已完成匯款", helper: latestUploadAt || "匯款完成", tone: "completed", icon: "transferCompleted" },
        { label: "已送出付款憑證", helper: latestUploadAt || "等待平台審核", tone: "processing", icon: "proofUploaded" },
        { label: "平台審核中", helper: PAYMENT_REVIEW_SLA_SHORT, tone: "processing", icon: "reviewing" },
      ];
    }

    return [
      { label: "訂單成立", helper: createdAt || "已建立訂單", tone: "completed", icon: "orderCreated" },
      { label: "已完成匯款", helper: "請先完成轉帳", tone: "processing", icon: "transferCompleted" },
      { label: "已送出付款憑證", helper: "上傳後平台將進行審核", tone: "processing", icon: "proofUploaded" },
      { label: "平台審核中", helper: PAYMENT_REVIEW_SLA_SHORT, tone: "locked", icon: "reviewing" },
    ];
  }

  const timeline = buildTimeline();

  function onPick(nextFiles: File[]) {
    setProofFiles(nextFiles.slice(0, MAX_FILES));
  }

  /**
   * **是否還能提交 —— 完全來自 backend 的 canonical 判準。**
   *
   * 前端不得用 `Date.now() > payment_due_at` 自行判斷：逾期但曾在期限內提交過的
   * 訂單仍可重傳（A2），純看日期會把它誤判成不可提交。
   * `undefined`（舊 API 回應或尚未載入）視為允許 —— 真正的守門在 backend。
   */
  const submissionBlocked = orderDetail?.order?.payment_submission_allowed === false;

  async function submit() {
    setMsg(null);
    if (proofFiles.length < 1) return setMsg("請至少上傳 1 張憑證圖片。");
    if (proofFiles.length > MAX_FILES) return setMsg("最多只能上傳 3 張憑證圖片。");
    const invalidType = proofFiles.find((f) => !ACCEPTED_TYPES.has(f.type));
    if (invalidType) return setMsg("僅支援 JPG、JPEG、PNG、WEBP 圖檔。");
    const oversized = proofFiles.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) return setMsg(`檔案「${oversized.name}」超過 10MB。`);
    if (reportedAccountLast4.trim() && !/^[0-9]{4}$/.test(reportedAccountLast4.trim())) {
      return setMsg("匯款帳號末四碼必須是 4 位數字。");
    }
    if (reportedAmount.trim() && !/^[1-9][0-9]*$/.test(reportedAmount.trim())) {
      return setMsg("匯款金額必須是正整數。");
    }
    if (!token) return setMsg("請先登入。");

    setLoading(true);
    try {
      const body = new FormData();
      proofFiles.forEach((file) => body.append("proofs", file));
      // 只送有填的欄位；後端 `utils/reportedPayment.js` 是唯一的驗證來源。
      if (reportedBankName.trim()) body.append("reportedBankName", reportedBankName.trim());
      if (reportedAccountLast4.trim()) body.append("reportedAccountLast4", reportedAccountLast4.trim());
      if (reportedAmount.trim()) body.append("reportedAmount", reportedAmount.trim());
      if (reportedTransferAt.trim()) {
        // `datetime-local` 是本地牆上時間；轉成 ISO 才不會被當成 UTC。
        body.append("reportedTransferAt", new Date(reportedTransferAt).toISOString());
      }
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
      pushNotification({
        tone: "success",
        title: "付款憑證已送出",
        body: "平台已收到您的憑證，正在安排人工審核。",
      });
      setMsg("已收到付款憑證，目前等待人工審核。");
      setProofFiles([]);
      setReportedBankName("");
      setReportedAccountLast4("");
      setReportedAmount("");
      setReportedTransferAt("");
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
      <div className="mx-auto w-full max-w-[1120px] bg-transparent px-4 pb-20 pt-6 md:px-6">
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
                        <p className="text-[#6B7280]">付款期限</p>
                        <p className="font-medium text-[#4B5563]">
                          {orderDetail?.order?.payment_due_at
                            ? `請於 ${formatPaymentDue(orderDetail.order.payment_due_at)} 前完成匯款並提交付款資訊`
                            : PAYMENT_DUE_UNSET_TEXT}
                        </p>
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
                  <p className="mt-1 text-sm text-[#6B7280]">付款方式：銀行轉帳</p>
                  <div className="mt-2">
                    <BankTransferInfo state={bankInfo} />
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                    <p>人工審核時段：每日 10:00 - 19:00</p>
                    <p>核帳時間：{PAYMENT_REVIEW_SLA_TEXT}</p>
                    <p>通知管道：Email + 我的訂單頁面</p>
                  </div>
                </SurfaceCard>

                <SurfaceCard elevation="raised" className="rounded-3xl border-[#ececf2] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                  {/*
                    * 整個「選檔」區塊在 `submissionBlocked` 時**完全不渲染**。
                    * 只藏送出鈕是不夠的 —— 留著 dropzone 等於邀請買家挑檔案，
                    * 而那條路的終點必定是 409。
                    */}
                  {submissionBlocked ? null : (
                    <>
                      <p className="text-sm font-semibold text-[#1F2937]">上傳付款憑證</p>
                      <p className="mt-1 text-xs text-[#6B7280]">請上傳匯款憑證圖片成功的畫面截圖。</p>
                      <label
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          onPick(Array.from(e.dataTransfer.files || []));
                        }}
                        data-testid="proof-dropzone"
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
                    </>
                  )}
                  {/*
                    * 付款期限已過且從未在期限內提交過（Wave 2 #12）——
                    * **不呈現按了必定 409 的控制項**，改為真實狀態。
                    * 判準來自 backend 的 `payment_submission_allowed`。
                    */}
                  {submissionBlocked ? (
                    <div
                      role="status"
                      data-testid="payment-deadline-expired"
                      className="rounded-xl border border-edu-error/40 bg-status-rejectedBg p-4"
                    >
                      <p className="text-body font-semibold text-status-rejectedText">
                        {PAYMENT_DEADLINE_EXPIRED_TITLE}
                      </p>
                      <p className="mt-1 text-meta text-status-rejectedText">
                        {PAYMENT_DEADLINE_EXPIRED_BODY}
                      </p>
                    </div>
                  ) : null}

                  {/*
                    * 付款辨識資訊（P1-09 Gate 6）。選填 —— 填了能讓人工核帳更快對上帳。
                    * 只收帳號**末四碼**，不收完整帳號。
                    */}
                  {submissionBlocked ? null : (
                  <fieldset className="mt-4 rounded-xl border border-[#ececf2] bg-[#fafafd] p-4">
                    <legend className="px-1 text-sm font-semibold text-ds-body">
                      匯款資訊（選填，可加速對帳）
                    </legend>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      這些是您提供的匯款資訊，平台會再與銀行實際入帳紀錄核對。為保護您的權益，請勿填寫完整帳號。
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ds-body">匯款銀行</span>
                        <input
                          type="text"
                          maxLength={60}
                          value={reportedBankName}
                          onChange={(e) => setReportedBankName(e.currentTarget.value)}
                          placeholder="例：國泰世華"
                          className="h-[42px] rounded-xl border border-[#ececf2] bg-white px-3 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ds-body">匯款帳號末四碼</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={reportedAccountLast4}
                          onChange={(e) => setReportedAccountLast4(e.currentTarget.value.replace(/[^0-9]/g, ""))}
                          placeholder="0000"
                          className="h-[42px] rounded-xl border border-[#ececf2] bg-white px-3 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ds-body">匯款金額</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={reportedAmount}
                          onChange={(e) => setReportedAmount(e.currentTarget.value.replace(/[^0-9]/g, ""))}
                          placeholder="例：480"
                          className="h-[42px] rounded-xl border border-[#ececf2] bg-white px-3 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ds-body">匯款時間</span>
                        <input
                          type="datetime-local"
                          value={reportedTransferAt}
                          onChange={(e) => setReportedTransferAt(e.currentTarget.value)}
                          className="h-[42px] rounded-xl border border-[#ececf2] bg-white px-3 text-sm"
                        />
                      </label>
                    </div>
                  </fieldset>
                  )}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {/* 被 enforcement 擋住時**不渲染送出按鈕** —— 不呈現必定失敗的控制項。 */}
                    {submissionBlocked ? null : (
                    <button
                      type="button"
                      data-testid="proof-submit"
                      className="inline-flex h-[42px] w-full items-center justify-center rounded-xl bg-intent-action px-5 py-0 text-sm font-semibold text-white shadow-button-action disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={loading}
                      onClick={() => void submit()}
                    >
                      {loading ? "送出中…" : "送出憑證"}
                    </button>
                    )}
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
      </div>
    </AppShell>
  );
}
