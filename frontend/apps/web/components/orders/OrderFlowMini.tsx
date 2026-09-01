/**
 * 三步驟輔助流程的目前位置。
 *
 * **優先讀 `order_progress_state`**（Backend 的 canonical 買家進度，定義見
 * `Backend/services/buyerOrders.service.js`）。舊版只有 `orders.status` ＋ pending 憑證數：
 * 憑證 A 待審、較新的憑證 B 被退回時，`pendingReviews` 仍為真，stepper 會停在
 * 「審核中」，但同一張卡片的徽章已經是「審核未通過」（`COR-01`）。
 *
 * `status` 保留為 fallback：後端沒回進度欄位時（舊 payload）行為不變。
 */
export function mapOrderStatusToFlow(
  status: string,
  paymentProofPendingReviewCount = 0,
  progressState = "",
): {
  activeStep: 1 | 2 | 3;
  complete: boolean;
  message: string;
} {
  const s = status.toLowerCase();
  const p = progressState.toLowerCase();
  const pendingReviews = paymentProofPendingReviewCount > 0;

  if (p === "approved" || s === "approved" || s === "completed" || s === "paid") {
    return {
      activeStep: 3,
      complete: true,
      message: "訂單已完成。",
    };
  }
  // 已取消是終態，沒有下一步可走（`COR-03`）。少了這一條會落到最後的通用分支
  // 而說「訂單處理中」，與徽章的「已取消」互相矛盾。
  if (p === "cancelled") {
    return {
      activeStep: 1,
      complete: false,
      message: "訂單已取消。",
    };
  }
  if (p === "rejected") {
    return {
      activeStep: 1,
      complete: false,
      message: "付款憑證未通過，請重新上傳付款憑證。",
    };
  }
  if (p === "reviewing" || p === "proof_uploaded") {
    return {
      activeStep: 2,
      complete: false,
      message: "已送出憑證，審核完成後即可開通（約 1～2 個工作天）。",
    };
  }
  if (p === "pending") {
    return {
      activeStep: 1,
      complete: false,
      message: "請完成轉帳並上傳付款憑證。",
    };
  }
  if (s === "pending_payment" && pendingReviews) {
    return {
      activeStep: 2,
      complete: false,
      message: "已送出憑證，審核完成後即可開通（約 1～2 個工作天）。",
    };
  }
  if (s === "pending_payment") {
    return {
      activeStep: 1,
      complete: false,
      message: "請完成轉帳並上傳付款憑證。",
    };
  }
  return {
    activeStep: 1,
    complete: false,
    message: "訂單處理中。",
  };
}

type Props = {
  status: string;
  /** Backend 的 `order_progress_state`；有值時優先於 `status`。 */
  progressState?: string;
  paymentProofPendingReviewCount?: number;
  className?: string;
};

const STEP_LABELS = ["待付款", "審核中", "已完成"] as const;

/** 輔助流程：總寬約 320–360px、短連線、節點與 label 格線對齊 */
export function OrderFlowMini({ status, progressState = "", paymentProofPendingReviewCount = 0, className = "" }: Props) {
  const { activeStep, complete, message } = mapOrderStatusToFlow(status, paymentProofPendingReviewCount, progressState);
  const segAfter1 = complete || activeStep >= 2;
  const segAfter2 = complete || activeStep >= 3;

  function dotClasses(stepIndex: 1 | 2 | 3): string {
    const done = complete || stepIndex < activeStep;
    const active = !complete && stepIndex === activeStep;
    if (done) {
      return "border-0 bg-edu-primary text-[13px] font-bold text-white shadow-sm";
    }
    if (active) {
      return "border-0 bg-edu-primary text-[13px] font-bold text-white shadow-[0_0_0_4px_rgba(108,99,255,0.22)]";
    }
    return "border-0 bg-[#d9d9e5] text-[13px] font-bold text-[#9CA3AF]";
  }

  function segmentAfter(stepIndex: 1 | 2): string {
    const done = stepIndex === 1 ? segAfter1 : segAfter2;
    return done ? "bg-edu-primary/45" : "bg-[#dcdceb]";
  }

  function dotContent(stepIndex: 1 | 2 | 3): string {
    const done = complete || stepIndex < activeStep;
    if (done) return "✓";
    return String(stepIndex);
  }

  function labelTone(stepIndex: 1 | 2 | 3): string {
    const done = complete || stepIndex < activeStep;
    const active = !complete && stepIndex === activeStep;
    return done || active ? "text-ds-heading" : "text-[#9CA3AF]";
  }

  const gridCols =
    "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]";

  return (
    <div className={`mx-auto w-full max-w-[340px] origin-center scale-[0.92] ${className}`.trim()}>
      <div className={`${gridCols} items-center`}>
        <div className="flex justify-center">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full leading-none ${dotClasses(1)}`}>
            {dotContent(1)}
          </span>
        </div>
        <div className={`mx-1 h-0.5 w-8 shrink-0 rounded-full self-center ${segmentAfter(1)}`} aria-hidden />
        <div className="flex justify-center">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full leading-none ${dotClasses(2)}`}>
            {dotContent(2)}
          </span>
        </div>
        <div className={`mx-1 h-0.5 w-8 shrink-0 rounded-full self-center ${segmentAfter(2)}`} aria-hidden />
        <div className="flex justify-center">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full leading-none ${dotClasses(3)}`}>
            {dotContent(3)}
          </span>
        </div>
      </div>
      <div className={`mt-1 ${gridCols} items-start`}>
        <span className={`text-center text-sm font-medium leading-tight ${labelTone(1)}`}>{STEP_LABELS[0]}</span>
        <span className="mx-1 block w-8 shrink-0" aria-hidden />
        <span className={`text-center text-sm font-medium leading-tight ${labelTone(2)}`}>{STEP_LABELS[1]}</span>
        <span className="mx-1 block w-8 shrink-0" aria-hidden />
        <span className={`text-center text-sm font-medium leading-tight ${labelTone(3)}`}>{STEP_LABELS[2]}</span>
      </div>
      <p className="mt-1 block w-full text-center text-[13px] leading-snug text-[#666666]">{message}</p>
    </div>
  );
}
