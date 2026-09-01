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
import { IconArrowRight } from "../../components/ui/icons";
import { getCartItems } from "../../lib/api-repository";
import { apiFetch } from "../../lib/api-client";
import type { MockCartItem } from "../../lib/view-models";

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

  async function qty(id: string, q: number) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, quantity: q } : it)));
    await apiFetch(`cart/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: q }),
    });
  }

  async function removeItem(id: string) {
    setItems((prev) => {
      return prev.filter((it) => it.id !== id);
    });
    await apiFetch(`cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const selectedItems = items.filter((i) => selected[i.id]);
  const subtotal = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = subtotal;
  const count = selectedItems.reduce((s, i) => s + i.quantity, 0);
  const desktopTitle = `購物車（${count} 項商品）`;

  const summaryInner = useMemo(
    () => (
      <>
        <h2 className="text-base font-semibold text-[#1F2937]">訂單摘要</h2>
        <dl className="mt-4 space-y-2.5">
          <div className="flex justify-between gap-4 text-sm text-[#6B7280]">
            <dt>小計</dt>
            <dd className="font-semibold text-[#374151]">NT${subtotal.toLocaleString()}</dd>
          </div>
          <div className="border-t border-[#E5E7EB] pt-4">
            <div className="flex justify-between gap-4">
              <dt className="text-base font-semibold text-[#1F2937]">總金額</dt>
              <dd className="text-[28px] font-bold leading-none text-[#111827]">NT${total.toLocaleString()}</dd>
            </div>
            <p className="mt-1 text-xs text-[#9CA3AF]">共 {count} 項商品</p>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-2 text-xs text-[#9CA3AF]">
          <span>🔒 安全付款保障</span>
        </div>
        <Link href="/checkout" className="group mt-6 block">
          <Button
            type="button"
            intent="flow"
            fullWidth
            className="h-12 text-base font-semibold tracking-tight shadow-[0_12px_26px_rgba(108,99,255,0.28)] hover:shadow-[0_16px_30px_rgba(108,99,255,0.32)]"
          >
            前往結帳 · NT${total.toLocaleString()}
            <IconArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Button>
        </Link>
      </>
    ),
    [subtotal, total, count],
  );

  return (
    <AppShell>
      <div className="lg:hidden [&>header]:bg-transparent [&>header]:backdrop-blur-0 [&>header]:border-[#E5E7EB]/40">
        <MobileHeader title="購物車" leading="none" right="none" />
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-0 sm:px-6 lg:pt-0">
        <h1 className="mb-1 hidden text-[22px] font-semibold tracking-tight text-[#111827] lg:block">{desktopTitle}</h1>
        {loading ? <p className="py-10 text-center text-sm text-[#6B7280]">載入中…</p> : null}
        {!loading && items.length === 0 ? (
          <EmptyState
            title="購物車是空的"
            description="去教材列表挑選適合孩子的課程吧！"
            actionLabel="前往探索教材"
            onAction={() => router.push("/materials")}
          />
        ) : null}
        {!loading && items.length > 0 ? (
          <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
            <div className="space-y-4 lg:min-w-0">
              <h1 className="sr-only">購物車內容</h1>
              {items.map((it) => (
                <CartItem
                  key={it.id}
                  item={it}
                  selected={Boolean(selected[it.id])}
                  onToggle={toggle}
                  onQtyChange={(id, q) => {
                    void qty(id, q);
                  }}
                  onRemove={(id) => {
                    void removeItem(id);
                  }}
                />
              ))}
            </div>

            <aside className="hidden lg:block lg:pt-[10px]">
              <Card level="elevated" padding="md" className="sticky top-24">
                {summaryInner}
              </Card>
            </aside>
          </div>
        ) : null}
      </div>

      {!loading && items.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB]/90 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6B7280]">總計（{count} 項）</span>
              <span className="text-xl font-bold text-[#1F2937]">NT${total.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
              <span>🔒 安全付款保障</span>
            </div>
            <Link href="/checkout" className="group w-full">
              <Button
                type="button"
                intent="flow"
                fullWidth
                className="h-12 text-base font-semibold tracking-tight shadow-[0_12px_26px_rgba(108,99,255,0.28)] hover:shadow-[0_16px_30px_rgba(108,99,255,0.32)]"
              >
                前往結帳 · NT${total.toLocaleString()}
                <IconArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
