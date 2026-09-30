"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { MaterialDetailPurchasePanel } from "../../../../components/materials/detail/MaterialDetailPurchasePanel";
import { MaterialCard } from "../../../../components/materials/MaterialCard";
import { Topbar } from "../../../../components/dashboard/Topbar";
import { Button } from "../../../../components/ui/Button";
import type { MockMaterial } from "../../../../lib/view-models";
import { scopedCss } from "./options";
import type { BadgeOption, PriceOption, PromoOption } from "./options";

/**
 * `UI-QA-COMMERCE-COLOR-2` 的比較元件（dev-only，由同資料夾的 guarded `page.tsx` 使用）。
 *
 * 畫面上的都是**真的**產品元件（`MaterialDetailPurchasePanel`、`MaterialCard`、`Topbar`、`Button`）。
 * 候選色只以**限定在本頁容器內**的 CSS 覆寫套上，選擇器對應日後要改的**確切 class**
 * （價格 `text-edu-cta`、徽章 `bg-[#FF6B73]`／`bg-[#FF6B7A]`、折扣 `…/10` 淡底）——
 * 所以這裡看到的就是改那幾個 class 之後的樣子；**不改任何 canonical token**。
 */

const MATERIAL: MockMaterial = {
  id: "cc2_demo",
  title: "小一數學加減法練習單（20 以內）",
  ageLabel: "6-8歲",
  category: "math",
  price: 120,
  originalPrice: 150,
  rating: 5,
  reviewCount: 1,
  isPurchasable: true,
  coverGradient: "from-rose-100 to-orange-50",
  durationHours: 0,
  units: 0,
  learners: 0,
  description: "",
  outline: [],
  learnPoints: [],
};

const noop = () => {};

function Scope({ id, css, children }: { id: string; css: string; children: ReactNode }) {
  return (
    <div data-cc2={id}>
      <style>{css}</style>
      {children}
    </div>
  );
}

function PurchasePanel() {
  return (
    <div className="rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card">
      <MaterialDetailPurchasePanel
        price={120}
        originalPrice={150}
        discountPercent={20}
        quantity={1}
        busy={false}
        feedback={null}
        onDecrease={noop}
        onIncrease={noop}
        onAddToCart={noop}
        onBuyNow={noop}
      />
    </div>
  );
}

function Header({ badge }: { badge: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10">
      <Suspense fallback={null}>
        <Topbar onMenuClick={noop} cartBadge={badge} drawerId="cc2-drawer" />
      </Suspense>
    </div>
  );
}

/** 買家側欄的數量徽章（與 `components/dashboard/Sidebar.tsx` `InlineNavBadge` 同一組 class）。 */
function SidebarBadgeRow() {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-medium text-ds-body shadow-sm">
      <span>購物車</span>
      <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#FF6B7A] px-1 text-[10px] font-semibold leading-none text-white">
        2
      </span>
    </div>
  );
}

function Column({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-bold text-ds-heading">
        {title} <span className="font-mono font-medium text-ds-body">{sub}</span>
      </p>
      {children}
    </div>
  );
}

export function PriceComparison({ options }: { options: PriceOption[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {options.map((o) => (
        <Scope key={o.key} id={`price-${o.key}`} css={scopedCss(`[data-cc2="price-${o.key}"]`, { price: o })}>
          <Column title={`價格 ${o.key}`} sub={o.hex}>
            <PurchasePanel />
            <div className="max-w-[300px]">
              <MaterialCard material={MATERIAL} />
            </div>
          </Column>
        </Scope>
      ))}
    </div>
  );
}

export function BadgeComparison({ options }: { options: BadgeOption[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {options.map((o) => (
        <Scope key={o.key} id={`badge-${o.key}`} css={scopedCss(`[data-cc2="badge-${o.key}"]`, { badge: o })}>
          <Column title={`徽章 ${o.key}`} sub={`${o.bg} ＋ ${o.text}`}>
            <Header badge={2} />
            <Header badge={12} />
            <SidebarBadgeRow />
            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <p className="text-sm text-ds-body">總計（2 項）</p>
              <Button intent="purchase" fullWidth size="lg" className="mt-2">
                前往結帳 · NT$120 →
              </Button>
            </div>
          </Column>
        </Scope>
      ))}
    </div>
  );
}

export function PromoComparison({ options }: { options: PromoOption[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {options.map((o) => (
        <Scope key={o.key} id={`promo-${o.key}`} css={scopedCss(`[data-cc2="promo-${o.key}"]`, { promo: o })}>
          <Column title={`折扣 ${o.key}`} sub={`${o.bg} ＋ ${o.text}`}>
            <div className="max-w-[300px]">
              <MaterialCard material={MATERIAL} />
            </div>
            <PurchasePanel />
          </Column>
        </Scope>
      ))}
    </div>
  );
}

/** 價格 × 徽章的組合：同一個畫面同時有 價格、紫色加入購物車、橘色立即購買、數量徽章。 */
export function CombinedMatrix({ prices, badges }: { prices: PriceOption[]; badges: BadgeOption[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[1100px] grid-cols-3 gap-5">
        {badges.flatMap((b) =>
          prices.map((p) => {
            const id = `combo-${p.key}${b.key}`;
            return (
              <Scope key={id} id={id} css={scopedCss(`[data-cc2="${id}"]`, { price: p, badge: b })}>
                <Column title={`價格 ${p.key} × 徽章 ${b.key}`} sub="">
                  <Header badge={2} />
                  <PurchasePanel />
                </Column>
              </Scope>
            );
          })
        )}
      </div>
    </div>
  );
}
