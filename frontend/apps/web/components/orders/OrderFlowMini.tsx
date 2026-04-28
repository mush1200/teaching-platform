export function mapOrderStatusToFlow(
  status: string,
  proofPendingReviewCount = 0,
): {
  activeStep: 1 | 2 | 3 | 4;
  label: string;
  variant: "progress" | "review" | "success" | "warning" | "danger";
} {
  const s = status.toLowerCase();
  const pendingReviews = proofPendingReviewCount > 0;

  if (s === "approved" || s === "completed" || s === "paid") {
    return {
      activeStep: 4,
      label: "已核准 · 可前往下載中心取得教材",
      variant: "success",
    };
  }
  if (s === "rejected") {
    return {
      activeStep: 3,
      label: "付款未通過 · 請重新上傳憑證或聯絡客服",
      variant: "danger",
    };
  }
  if (s === "pending_payment" && pendingReviews) {
    return {
      activeStep: 4,
      label: "已送出憑證，等待管理員審核（通常 1～2 個工作天）",
      variant: "review",
    };
  }
  if (s === "pending_payment") {
    return {
      activeStep: 3,
      label: "請完成轉帳並上傳付款憑證（送出後由管理員審核）",
      variant: "progress",
    };
  }
  return {
    activeStep: 2,
    label: "訂單處理中",
    variant: "warning",
  };
}

type Props = {
  status: string;
  /** From API `payment_proof_pending_review_count` — proofs awaiting admin */
  paymentProofPendingReviewCount?: number;
};

const STEP_LABELS = ["確認", "成立", "憑證", "審核"] as const;

export function OrderFlowMini({ status, paymentProofPendingReviewCount = 0 }: Props) {
  const { activeStep, label, variant } = mapOrderStatusToFlow(status, paymentProofPendingReviewCount);
  const allComplete = variant === "success";
  const barCls =
    variant === "success"
      ? "border-emerald-200 bg-emerald-50/80"
      : variant === "danger"
        ? "border-red-200 bg-red-50/80"
        : variant === "warning"
          ? "border-amber-200 bg-amber-50/60"
          : variant === "review"
            ? "border-[#DDD6FE] bg-[#F5F3FF]"
            : "border-[#E5E7EB] bg-[#FAF8FF]";

  return (
    <div className={`rounded-[var(--radius-card-flat)] border px-3 py-2.5 ${barCls}`}>
      <p className="text-xs font-medium leading-snug text-[#1F2937]">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-1" aria-hidden>
        {STEP_LABELS.map((short, i) => {
          const n = i + 1;
          const active = !allComplete && n === activeStep;
          const done = allComplete || n < activeStep;
          return (
            <div key={short} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  allComplete
                    ? "bg-emerald-500 text-white"
                    : done
                      ? "bg-[#6C63FF] text-white"
                      : active
                        ? "bg-[#FF6B73] text-white ring-2 ring-[#FF6B73]/30"
                        : "border border-[#E5E7EB] bg-white text-[#9CA3AF]"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span
                className={`truncate text-[9px] font-semibold sm:text-[10px] ${active || allComplete ? "text-[#1F2937]" : "text-[#9CA3AF]"}`}
              >
                {short}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
