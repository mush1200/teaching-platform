"use client";

import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { IconCart } from "../../ui/icons";

type Props = {
  price: number;
  originalPrice: number;
  discountPercent: number;
  quantity: number;
  busy: boolean;
  feedback: { kind: "ok" | "err"; text: string } | null;
  onDecrease: () => void;
  onIncrease: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  layout?: "card" | "sticky";
};

function QuantityStepper({
  quantity,
  busy,
  onDecrease,
  onIncrease,
}: Pick<Props, "quantity" | "busy" | "onDecrease" | "onIncrease">) {
  return (
    <div className="inline-flex h-11 items-stretch overflow-hidden rounded-xl border border-ds-borderStrong bg-ds-surface">
      <button
        type="button"
        className="inline-flex w-11 items-center justify-center text-lg text-ds-body transition-colors hover:bg-ds-surfaceSubtle disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onDecrease}
        disabled={busy || quantity <= 1}
        aria-label="減少數量"
      >
        −
      </button>
      <span className="inline-flex min-w-12 items-center justify-center border-x border-ds-border px-3 text-base font-semibold text-ds-heading">
        {quantity}
      </span>
      <button
        type="button"
        className="inline-flex w-11 items-center justify-center text-lg text-ds-body transition-colors hover:bg-ds-surfaceSubtle disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onIncrease}
        disabled={busy}
        aria-label="增加數量"
      >
        +
      </button>
    </div>
  );
}

function PriceBlock({ price, originalPrice, discountPercent }: Pick<Props, "price" | "originalPrice" | "discountPercent">) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <p className="text-3xl font-extrabold leading-none tracking-tight text-edu-cta sm:text-[2rem]">NT${price}</p>
      {discountPercent > 0 ? (
        <>
          <span className="text-sm text-ds-textSubtle line-through">NT${originalPrice}</span>
          <span className="rounded-full bg-edu-cta/10 px-2 py-0.5 text-xs font-bold text-edu-cta">{discountPercent}% OFF</span>
        </>
      ) : null}
    </div>
  );
}

function PurchaseActions({
  busy,
  feedback,
  onAddToCart,
  onBuyNow,
  compact = false,
}: Pick<Props, "busy" | "feedback" | "onAddToCart" | "onBuyNow"> & { compact?: boolean }) {
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2.5"}>
      <Button type="button" variant="outline" intent="action" fullWidth className="h-11" disabled={busy} onClick={onAddToCart}>
        {!compact ? <IconCart className="size-4" /> : null}
        {compact ? "購物車" : "加入購物車"}
      </Button>
      <Button type="button" intent="flow" fullWidth className="h-11" disabled={busy} onClick={onBuyNow}>
        立即購買
      </Button>
      {!compact && feedback ? (
        <p className={`text-xs ${feedback.kind === "ok" ? "text-emerald-700" : "text-feedback-errorText"}`} role="status">
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

export function MaterialDetailPurchasePanel({
  price,
  originalPrice,
  discountPercent,
  quantity,
  busy,
  feedback,
  onDecrease,
  onIncrease,
  onAddToCart,
  onBuyNow,
  layout = "card",
}: Props) {
  if (layout === "sticky") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ds-border bg-ds-surface/95 px-4 py-3 shadow-[0_-8px_32px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-wide items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-xs text-ds-textMuted">合計</p>
            <p className="text-xl font-extrabold text-edu-cta">NT${price * quantity}</p>
          </div>
          <div className="min-w-0 flex-1">
            <PurchaseActions busy={busy} feedback={null} onAddToCart={onAddToCart} onBuyNow={onBuyNow} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card level="elevated" padding="md" className="lg:sticky lg:top-24 lg:self-start">
      <PriceBlock price={price} originalPrice={originalPrice} discountPercent={discountPercent} />
      <div className="mt-4">
        <QuantityStepper quantity={quantity} busy={busy} onDecrease={onDecrease} onIncrease={onIncrease} />
      </div>
      <div className="mt-4">
        <PurchaseActions busy={busy} feedback={feedback} onAddToCart={onAddToCart} onBuyNow={onBuyNow} />
      </div>
      <p className="mt-4 text-xs font-medium leading-relaxed text-ds-textMuted">
        安全交易 · 永久下載 · 完成付款審核後即可使用
      </p>
    </Card>
  );
}
