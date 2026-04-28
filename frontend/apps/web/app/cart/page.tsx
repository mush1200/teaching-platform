"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@teaching-platform/ui";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { CartItem } from "../../components/cart/CartItem";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getCartItems } from "../../lib/edu-api-mock";
import type { MockCartItem } from "../../lib/mock-data";

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<MockCartItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCartItems();
    setItems(data);
    setSelected(Object.fromEntries(data.map((d) => [d.id, true])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function qty(id: string, q: number) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, quantity: q } : it)));
  }

  const selectedItems = items.filter((i) => selected[i.id]);
  const subtotal = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = 0;
  const total = subtotal - discount;
  const count = selectedItems.reduce((s, i) => s + i.quantity, 0);

  const summaryInner = useMemo(
    () => (
      <>
        <h2 className="text-base font-bold text-[#1F2937]">訂單摘要</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4 text-[#6B7280]">
            <dt>小計</dt>
            <dd className="font-medium text-[#1F2937]">NT${subtotal.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4 text-[#6B7280]">
            <dt>折扣</dt>
            <dd className="font-medium text-[#1F2937]">{discount > 0 ? `-NT$${discount.toLocaleString()}` : "—"}</dd>
          </div>
          <div className="border-t border-[#E5E7EB] pt-3">
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-[#1F2937]">總金額</dt>
              <dd className="text-xl font-bold text-[#1F2937]">NT${total.toLocaleString()}</dd>
            </div>
            <p className="mt-1 text-xs text-[#9CA3AF]">共 {count} 項商品</p>
          </div>
        </dl>
        <Link href="/checkout" className="mt-6 block">
          <Button type="button" intent="flow" fullWidth>
            前往結帳
          </Button>
        </Link>
      </>
    ),
    [subtotal, discount, total, count],
  );

  return (
    <AppShell>
      <MobileHeader title="購物車" backHref="/materials" right="edit" />
      <main className="mx-auto max-w-6xl px-4 pb-36 pt-2 sm:px-6 lg:pb-12 lg:pt-4">
        {loading ? <p className="py-10 text-center text-sm text-[#6B7280]">載入中…</p> : null}
        {!loading && items.length === 0 ? (
          <EmptyState
            title="購物車是空的"
            description="去教材列表挑選適合孩子的課程吧！"
            actionLabel="前往逛逛"
            onAction={() => router.push("/materials")}
          />
        ) : null}
        {!loading && items.length > 0 ? (
          <div className="lg:grid lg:grid-cols-[1fr_minmax(280px,380px)] lg:items-start lg:gap-10">
            <div className="space-y-3 lg:min-w-0">
              <h1 className="sr-only">購物車內容</h1>
              {items.map((it) => (
                <CartItem key={it.id} item={it} selected={Boolean(selected[it.id])} onToggle={toggle} onQtyChange={qty} />
              ))}
            </div>

            <aside className="mt-8 hidden lg:block">
              <Card level="elevated" padding="lg" className="sticky top-24">
                {summaryInner}
              </Card>
            </aside>
          </div>
        ) : null}
      </main>

      {!loading && items.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB]/90 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6B7280]">總計（{count} 項）</span>
              <span className="text-xl font-bold text-[#1F2937]">NT${total.toLocaleString()}</span>
            </div>
            <Link href="/checkout" className="w-full">
              <Button type="button" intent="flow" fullWidth>
                前往結帳
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
