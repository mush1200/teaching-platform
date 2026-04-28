"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { CheckoutStepper } from "../../components/checkout/CheckoutStepper";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getCartItems } from "../../lib/edu-api-mock";
import type { MockCartItem } from "../../lib/mock-data";
import { getStoredRole, getStoredToken } from "../../lib/api-client";

const MOCK_BANK_ACCOUNT = "1234-5678-9012-3456";

const STORAGE_PENDING = "tp_pending_downloads";

export default function CheckoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cartItems, setCartItems] = useState<MockCartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);

  const token = useMemo(() => getStoredToken(), []);
  const role = useMemo(() => getStoredRole(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCartLoading(true);
      try {
        const rows = await getCartItems();
        if (!cancelled) setCartItems(rows);
      } finally {
        if (!cancelled) setCartLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems],
  );
  const discount = 0;
  const payable = subtotal - discount;

  async function placeOrder() {
    if (!token) {
      setMsg("請先登入後再結帳。");
      return;
    }
    if (role && role !== "parent") {
      setMsg("目前帳號身分無法使用結帳。");
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      const items = await getCartItems();
      if (items.length === 0) {
        setMsg("購物車目前是空的。");
        return;
      }
      const simplified = items.map((r) => ({
        material_id: r.materialId,
        material_title: r.title,
      }));
      sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(simplified));
      const mockOrderId = `ord_mock_${Date.now().toString(36)}`;
      setMsg("訂單已建立，請上傳付款憑證。");
      router.push(`/orders/${encodeURIComponent(mockOrderId)}/upload-proof`);
    } catch {
      setMsg("建立訂單失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(MOCK_BANK_ACCOUNT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const stepActive: 1 | 2 | 3 | 4 = loading ? 2 : 1;

  return (
    <AppShell withBottomNav>
      <MobileHeader title="結帳" backHref="/cart" right="none" />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-28 pt-4 sm:px-6">
        <Card level="flat" padding="md">
          <CheckoutStepper activeStep={stepActive} />
        </Card>

        <Card level="elevated">
          <h1 className="text-xl font-bold text-[#1F2937]">確認訂單</h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            確認購物車商品後，按下「成立訂單」。建立後請完成轉帳並上傳憑證。
          </p>
        </Card>

        <Card level="default">
          <h2 className="text-sm font-semibold text-[#1F2937]">購物車明細</h2>
          {cartLoading ? <p className="mt-4 text-sm text-[#6B7280]">載入明細中…</p> : null}
          {!cartLoading && cartItems.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-card-flat)] border border-dashed border-[#E5E7EB] bg-[#FAFAFA] px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#1F2937]">購物車目前是空的</p>
              <p className="mt-1 text-xs text-[#6B7280]">請先加入教材後再結帳。</p>
              <Link href="/materials" className="mt-4 inline-block">
                <Button type="button" intent="action">
                  前往教材列表
                </Button>
              </Link>
            </div>
          ) : null}
          {!cartLoading && cartItems.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#F3F4F6]">
              {cartItems.map((item) => (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0">
                  <div className={`h-14 w-14 shrink-0 rounded-xl bg-gradient-to-br ${item.coverGradient}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1F2937]">{item.title}</p>
                    <p className="text-xs text-[#6B7280]">{item.ageLabel}</p>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      NT${item.price.toLocaleString()} × {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-[#1F2937]">
                    NT${(item.price * item.quantity).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {!cartLoading && cartItems.length > 0 ? (
            <dl className="mt-4 space-y-2 border-t border-[#E5E7EB] pt-4 text-sm">
              <div className="flex justify-between gap-4 text-[#6B7280]">
                <dt>小計</dt>
                <dd className="font-medium text-[#1F2937]">NT${subtotal.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-4 text-[#6B7280]">
                <dt>折扣</dt>
                <dd className="font-medium text-[#1F2937]">{discount > 0 ? `-NT$${discount.toLocaleString()}` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[#F3F4F6] pt-3 text-base font-bold text-[#1F2937]">
                <dt>應付金額</dt>
                <dd>NT${payable.toLocaleString()}</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card level="default">
          <p className="text-sm font-semibold text-[#1F2937]">付款方式</p>
          <p className="mt-1 text-sm text-[#6B7280]">ATM / 銀行轉帳（MVP）</p>
          <div className="mt-4 rounded-2xl border border-dashed border-[#D8D2FF] bg-[#FAF8FF] p-4 text-xs text-[#6B7280]">
            <p>收款帳戶：EduMarket Mock Account</p>
            <p className="mt-1">銀行代碼：812</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span>
                帳號：<span className="font-mono font-semibold text-[#1F2937]">{MOCK_BANK_ACCOUNT}</span>
              </span>
              <Button type="button" intent="action" className="!px-3 !py-1.5 !text-xs" onClick={() => void copyAccount()}>
                {copied ? "已複製" : "複製帳號"}
              </Button>
            </div>
          </div>
        </Card>

        {msg ? (
          <p className={`text-sm ${msg.includes("失敗") || msg.includes("空") ? "text-[#F59E0B]" : "text-[#22C55E]"}`}>{msg}</p>
        ) : null}

        <div className="flex gap-2">
          <Link href="/cart" className="flex-1">
            <Button intent="neutral" variant="outline" fullWidth>
              返回購物車
            </Button>
          </Link>
          <Button
            intent="flow"
            className="flex-1"
            fullWidth
            disabled={loading || cartLoading || cartItems.length === 0}
            onClick={() => void placeOrder()}
          >
            {loading ? "處理中…" : "成立訂單"}
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
