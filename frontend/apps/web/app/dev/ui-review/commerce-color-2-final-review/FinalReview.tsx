"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { MaterialDetailPurchasePanel } from "../../../../components/materials/detail/MaterialDetailPurchasePanel";
import { MaterialCard } from "../../../../components/materials/MaterialCard";
import { Topbar } from "../../../../components/dashboard/Topbar";
import { Button } from "../../../../components/ui/Button";
import { ErrorState } from "../../../../components/ds/StateViews";
import { StatusPill } from "../../../../components/ds/PageHeader";
import type { MockMaterial } from "../../../../lib/view-models";
import { RULES, STRONG_ALT, priceAndBadgeCss, promoCss, promoFor } from "./rules";

/**
 * `UI-QA-COMMERCE-COLOR-2` 提案規則的真實情境預覽（dev-only）。
 *
 * 全部是**真的**產品元件；提案色只以**限定在本頁容器內**的 CSS 套上（見 `rules.ts`）。
 * 唯一的例外是「一般通知徽章」—— 產品目前沒有這個用途，因此用與買家側欄徽章**相同的 class**
 * 畫出，並在畫面上明確標示。
 */

const noop = () => {};

function material(id: string, title: string, price: number, originalPrice: number): MockMaterial {
  return {
    id,
    title,
    ageLabel: "6-8歲",
    category: "math",
    price,
    originalPrice,
    rating: 4.8,
    reviewCount: 12,
    isPurchasable: true,
    coverGradient: "from-violet-200 to-indigo-100",
    durationHours: 0,
    units: 0,
    learners: 0,
    description: "",
    outline: [],
    learnPoints: [],
  };
}

const percentOf = (price: number, original: number) => (original > price ? Math.round((1 - price / original) * 100) : 0);

/** 以提案規則套色的容器（價格＋購物車徽章；折扣依百分比選溫和／強）。 */
function Proposed({ id, percent, children }: { id: string; percent?: number; children: ReactNode }) {
  const scope = `[data-cc2f="${id}"]`;
  const css = [priceAndBadgeCss(scope), percent ? promoCss(scope, promoFor(percent)) : ""].join("\n");
  return (
    <div data-cc2f={id}>
      <style>{css}</style>
      {children}
    </div>
  );
}

/** 一般通知徽章（產品目前沒有此用途；class 與 `Sidebar.tsx` `InlineNavBadge` 相同，只換提案色）。 */
function NotificationBadge({ count }: { count: number }) {
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none"
      style={{ background: RULES.notificationBadge.bg, color: RULES.notificationBadge.text }}
    >
      {label}
    </span>
  );
}

/** 購物車／待處理訂單徽章（class 與 `Sidebar.tsx` `InlineNavBadge` 相同，套提案色）。 */
function CartSidebarBadge({ count }: { count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#FF6B7A] px-1 text-[10px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-meta font-semibold text-ds-body">{children}</p>;
}

export function DetailPanels() {
  const versions = [
    { id: "detail-20", title: "版本 1：20% OFF（溫和）", price: 120, original: 150 },
    { id: "detail-40", title: "版本 2：40% OFF（強）", price: 90, original: 150 },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {versions.map((v) => {
        const percent = percentOf(v.price, v.original);
        return (
          <Proposed key={v.id} id={v.id} percent={percent}>
            <p className="mb-2 text-sm font-bold text-ds-heading">{v.title}</p>
            <div className="overflow-hidden rounded-2xl border border-black/10">
              <Suspense fallback={null}>
                <Topbar onMenuClick={noop} cartBadge={3} drawerId="cc2f-drawer" />
              </Suspense>
            </div>
            <div className="mt-3 rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card">
              <p className="mb-3 text-lg font-bold text-ds-heading">小一數學加減法練習單（20 以內）</p>
              <MaterialDetailPurchasePanel
                price={v.price}
                originalPrice={v.original}
                discountPercent={percent}
                quantity={1}
                busy={false}
                feedback={null}
                onDecrease={noop}
                onIncrease={noop}
                onAddToCart={noop}
                onBuyNow={noop}
              />
            </div>
          </Proposed>
        );
      })}
    </div>
  );
}

export function Cards() {
  const cards = [
    { key: "A", note: "無折扣", m: material("cc2f_a", "注音符號綜合練習", 90, 90) },
    { key: "B", note: "15% OFF（溫和）", m: material("cc2f_b", "每日一句英語短語卡", 170, 200) },
    { key: "C", note: "30% OFF（門檻，強）", m: material("cc2f_c", "課堂經營小卡組", 140, 200) },
    { key: "D", note: "45% OFF（強）", m: material("cc2f_d", "全學年國語文教學資源總集", 2640, 4800) },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <Proposed key={c.key} id={`card-${c.key}`} percent={percentOf(c.m.price, c.m.originalPrice)}>
          <Label>
            {c.key}. {c.note}
          </Label>
          <MaterialCard material={c.m} />
        </Proposed>
      ))}
    </div>
  );
}

export function Headers() {
  const counts = [1, 3, 9, 120];
  return (
    <div className="space-y-3">
      <Proposed id="headers">
        {counts.map((n) => (
          <div key={n} className="grid items-center gap-3 md:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-2xl border border-black/10">
              <Suspense fallback={null}>
                <Topbar onMenuClick={noop} cartBadge={n} drawerId="cc2f-drawer" />
              </Suspense>
            </div>
            <div className="space-y-1.5 rounded-xl bg-white p-3 text-sm font-medium text-ds-body shadow-sm">
              <div className="flex items-center justify-between">
                <span>購物車（購物車徽章）</span>
                <CartSidebarBadge count={n} />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-edu-primary/[0.12] px-2 py-1 text-ds-textAccent">
                <span>我的訂單（active 列；待處理訂單）</span>
                <CartSidebarBadge count={n} />
              </div>
              <div className="flex items-center justify-between">
                <span>
                  通知 <span className="text-meta text-ds-textMuted">（示意：產品目前沒有此用途）</span>
                </span>
                <NotificationBadge count={n} />
              </div>
            </div>
          </div>
        ))}
      </Proposed>
      <p className="text-meta text-ds-body">
        頂欄購物車徽章上限「99+」（第 4 列為 120）；側欄徽章上限「9+」—— 兩者上限不一致，與配色無關。
      </p>
    </div>
  );
}

function Chip({ bg, text, children }: { bg: string; text: string; children: ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: bg, color: text }}>
      {children}
    </span>
  );
}

function Cell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-xl border border-black/[0.06] bg-white p-3">
      <p className="text-meta font-semibold text-ds-body">{title}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function SemanticRow() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cell title="購物車徽章">
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold" style={{ background: RULES.cartBadge.bg, color: RULES.cartBadge.text }}>
            3
          </span>
        </Cell>
        <Cell title="通知徽章（保留規則）">
          <NotificationBadge count={3} />
        </Cell>
        <Cell title="折扣 <30%">
          <Chip bg={RULES.promoMild.bg} text={RULES.promoMild.text}>
            20% OFF
          </Chip>
        </Cell>
        <Cell title="折扣 ≥30%（提案）">
          <Chip bg={RULES.promoStrong.bg} text={RULES.promoStrong.text}>
            40% OFF
          </Chip>
        </Cell>
        <Cell title="警示（StatusPill warning）">
          <StatusPill label="待審核" tone="warning" />
        </Cell>
        <Cell title="錯誤（StatusPill danger）">
          <StatusPill label="付款被退回" tone="danger" />
        </Cell>
        <Cell title="立即購買">
          <Button intent="purchase" size="sm">
            立即購買
          </Button>
        </Cell>
        <Cell title="加入購物車">
          <Button intent="action" size="sm">
            加入購物車
          </Button>
        </Cell>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-status-rejectedText/40 bg-white p-4">
        <p className="text-sm font-bold text-ds-heading">疑慮示範：強折扣 vs 錯誤訊息（同一畫面）</p>
        <p className="mt-1 text-meta text-ds-body">
          提案的強折扣文字 #B91C1C 就是錯誤文字色；底色與錯誤底 ΔE 0.5。右欄為建議替代（#FFE4D4 ＋ #9A3412，6.02:1）。
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-meta font-semibold text-ds-body">提案</p>
            <Chip bg={RULES.promoStrong.bg} text={RULES.promoStrong.text}>
              40% OFF
            </Chip>
            <ErrorState variant="inline" title="加入購物車失敗，請稍後再試。" />
            <StatusPill label="付款被退回" tone="danger" />
          </div>
          <div className="space-y-2">
            <p className="text-meta font-semibold text-ds-body">建議替代（僅供比較）</p>
            <Chip bg={STRONG_ALT.bg} text={STRONG_ALT.text}>
              40% OFF
            </Chip>
            <ErrorState variant="inline" title="加入購物車失敗，請稍後再試。" />
            <StatusPill label="付款被退回" tone="danger" />
          </div>
        </div>
      </div>
    </div>
  );
}
