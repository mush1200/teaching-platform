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
  /**
   * 這份教材目前是否買得到。`false` 代表它沒有可交付的教材檔案
   * （後端 `is_purchasable`，見 `Backend/utils/materialDeliverability.js`）。
   * 後端三道防線本來就會擋住購買，但擋在點擊之後才說明等於讓買家先期待再落空 ——
   * 所以在按鈕上就先關掉並說明原因。
   */
  purchasable?: boolean;
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
  purchasable = true,
  compact = false,
}: Pick<Props, "busy" | "feedback" | "onAddToCart" | "onBuyNow" | "purchasable"> & { compact?: boolean }) {
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2.5"}>
      {/*
        停用的 CTA 一定要伴隨原因 —— 在**每一個看得見的購買面板**上，
        包含 mobile 的 sticky 版（`compact`）。先前只在非 compact 渲染，
        於是行動版買家只看到兩顆按鈕變灰、沒有任何說明。
        compact 版用更緊湊的樣式，但文案相同。
      */}
      {!purchasable ? (
        <p
          role="status"
          data-testid="material-unavailable"
          className={
            compact
              ? "col-span-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900"
              : "rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
          }
        >
          此教材目前沒有可供下載的教材檔案，已暫停販售。
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        intent="action"
        fullWidth
        className="h-11"
        disabled={busy || !purchasable}
        onClick={onAddToCart}
      >
        {!compact ? <IconCart className="size-4" /> : null}
        {compact ? "購物車" : "加入購物車"}
      </Button>
      <Button type="button" intent="flow" fullWidth className="h-11" disabled={busy || !purchasable} onClick={onBuyNow}>
        {purchasable ? "立即購買" : "暫停販售"}
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
  purchasable = true,
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
            <PurchaseActions busy={busy} feedback={null} onAddToCart={onAddToCart} onBuyNow={onBuyNow} purchasable={purchasable} compact />
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
        <PurchaseActions busy={busy} feedback={feedback} onAddToCart={onAddToCart} onBuyNow={onBuyNow} purchasable={purchasable} />
      </div>
      <p className="mt-4 text-xs font-medium leading-relaxed text-ds-textMuted">
        安全交易 · 完成付款審核後即可下載教材
      </p>
    </Card>
  );
}
