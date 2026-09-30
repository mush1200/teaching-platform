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
import { CART_BADGE, MILD, STRONG_OPTIONS, contextCss } from "./strong";
import type { StrongOption } from "./strong";

/**
 * 折扣 ≥30% 候選的真實情境（dev-only）。全部是真的產品元件，
 * 鎖定規則（價格、購物車徽章）與候選折扣色只以限定在容器內的 CSS 套上（見 `strong.ts`）。
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

function Scoped({ id, promo, children }: { id: string; promo: { bg: string; text: string }; children: ReactNode }) {
  return (
    <div data-cc2s={id}>
      <style>{contextCss(`[data-cc2s="${id}"]`, promo)}</style>
      {children}
    </div>
  );
}

/** 一個候選在真實情境中的樣子：頂欄徽章＋購買區（40%）＋教材卡（無折扣／20%／40%）。 */
export function StrongContext({ option }: { option: StrongOption }) {
  const k = option.key;
  return (
    <div className="space-y-4">
      <Scoped id={`ctx-${k}-top`} promo={option}>
        <div className="overflow-hidden rounded-2xl border border-black/10">
          <Suspense fallback={null}>
            <Topbar onMenuClick={noop} cartBadge={3} drawerId={`cc2s-${k}`} />
          </Suspense>
        </div>
        <div className="mt-3 rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card">
          <p className="mb-3 text-lg font-bold text-ds-heading">全學年國語文教學資源總集</p>
          <MaterialDetailPurchasePanel
            price={90}
            originalPrice={150}
            discountPercent={40}
            quantity={1}
            busy={false}
            feedback={null}
            onDecrease={noop}
            onIncrease={noop}
            onAddToCart={noop}
            onBuyNow={noop}
          />
        </div>
      </Scoped>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        <Scoped id={`ctx-${k}-none`} promo={MILD}>
          <MaterialCard material={material(`cc2s_${k}_0`, "注音符號綜合練習", 90, 90)} />
        </Scoped>
        <Scoped id={`ctx-${k}-mild`} promo={MILD}>
          <MaterialCard material={material(`cc2s_${k}_20`, "每日一句英語短語卡", 160, 200)} />
        </Scoped>
        <Scoped id={`ctx-${k}-strong`} promo={option}>
          <MaterialCard material={material(`cc2s_${k}_40`, "課堂經營小卡組", 120, 200)} />
        </Scoped>
      </div>
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
    <div className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-xl border border-black/[0.06] bg-white p-3">
      <p className="text-meta font-semibold text-ds-body">{title}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** 同一畫面：<30%、A／B／C、錯誤 pill、錯誤訊息、警示 pill、立即購買、加入購物車、購物車徽章。 */
export function SemanticComparison() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cell title="1. 折扣 <30%（鎖定）">
          <Chip bg={MILD.bg} text={MILD.text}>
            20% OFF
          </Chip>
        </Cell>
        {STRONG_OPTIONS.map((o, i) => (
          <Cell key={o.key} title={`${i + 2}. ≥30% 方案 ${o.key}`}>
            <Chip bg={o.bg} text={o.text}>
              40% OFF
            </Chip>
            <span className="text-meta text-ds-body">
              {o.bg} ＋ {o.text}
            </span>
          </Cell>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Cell title="錯誤 pill">
          <StatusPill label="付款被退回" tone="danger" />
        </Cell>
        <Cell title="警示 pill">
          <StatusPill label="待審核" tone="warning" />
        </Cell>
        <Cell title="購物車徽章">
          <span
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
            style={{ background: CART_BADGE.bg, color: CART_BADGE.text }}
          >
            3
          </span>
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
        <Cell title="錯誤訊息">
          <span className="text-meta text-ds-body">見下一列</span>
        </Cell>
      </div>
      <ErrorState variant="inline" title="加入購物車失敗，請稍後再試。" />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/[0.06] bg-white p-3">
        <span className="text-meta font-semibold text-ds-body">同一列並排：</span>
        <Chip bg={MILD.bg} text={MILD.text}>
          20% OFF
        </Chip>
        {STRONG_OPTIONS.map((o) => (
          <Chip key={o.key} bg={o.bg} text={o.text}>
            {o.key} 40% OFF
          </Chip>
        ))}
        <StatusPill label="付款被退回" tone="danger" />
        <StatusPill label="待審核" tone="warning" />
        <Button intent="purchase" size="sm">
          立即購買
        </Button>
        <Button intent="action" size="sm">
          加入購物車
        </Button>
      </div>
    </div>
  );
}
