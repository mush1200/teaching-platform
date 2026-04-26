"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { CartItem } from "../../components/cart/CartItem";
import { Button } from "../../components/ui/Button";
import { getCartItems } from "../../lib/edu-api-mock";
import type { MockCartItem } from "../../lib/mock-data";

export default function CartPage() {
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
  const total = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = selectedItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <AppShell>
      <MobileHeader title="購物車" backHref="/materials" right="edit" />
      <main className="mx-auto max-w-lg px-4 pb-40 pt-2 sm:px-6">
        {loading ? <p className="py-10 text-center text-sm text-[#6B7280]">載入中…</p> : null}
        {!loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#E5E7EB] bg-white/60 py-16 text-center">
            <p className="text-4xl">🛒</p>
            <p className="mt-4 font-semibold text-[#1F2937]">購物車是空的</p>
            <p className="mt-1 text-sm text-[#6B7280]">去教材列表挑選喜歡的課程吧！</p>
            <Link href="/materials" className="mt-6">
              <Button type="button">前往逛逛</Button>
            </Link>
          </div>
        ) : null}
        {!loading && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((it) => (
              <CartItem key={it.id} item={it} selected={Boolean(selected[it.id])} onToggle={toggle} onQtyChange={qty} />
            ))}
          </div>
        ) : null}
      </main>

      {!loading && items.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB]/90 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6B7280]">總計（{count} 項商品）</span>
              <span className="text-xl font-bold text-[#1F2937]">NT${total.toLocaleString()}</span>
            </div>
            <Link href="/checkout" className="w-full">
              <Button type="button" fullWidth>
                前往結帳
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
