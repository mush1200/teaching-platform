"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getCartItems } from "../../lib/edu-api-mock";
import { getStoredRole, getStoredToken } from "../../lib/api-client";

const STORAGE_PENDING = "tp_pending_downloads";

export default function CheckoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const token = useMemo(() => getStoredToken(), []);
  const role = useMemo(() => getStoredRole(), []);

  async function placeOrder() {
    if (!token) {
      setMsg("請先登入後再結帳。");
      return;
    }
    if (role && role !== "parent") {
      setMsg("僅家長身分可使用結帳。");
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

  return (
    <AppShell withBottomNav>
      <MobileHeader title="結帳" backHref="/cart" right="none" />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-28 pt-4 sm:px-6">
        <Card>
          <h1 className="text-xl font-bold text-[#1F2937]">確認訂單</h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            確認購物車商品後，按下「成立訂單」。建立後請完成轉帳並上傳憑證。
          </p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-[#1F2937]">付款方式</p>
          <p className="mt-1 text-sm text-[#6B7280]">ATM / 銀行轉帳（MVP）</p>
          <div className="mt-4 rounded-2xl border border-dashed border-[#E5E7EB] bg-[#FAFAFF] p-3 text-xs text-[#6B7280]">
            收款帳戶：EduMarket Mock Account
            <br />
            銀行代碼：812
            <br />
            帳號：1234-5678-9012-3456
          </div>
        </Card>

        {msg ? (
          <p className={`text-sm ${msg.includes("失敗") || msg.includes("空") ? "text-[#F59E0B]" : "text-[#22C55E]"}`}>{msg}</p>
        ) : null}

        <div className="flex gap-2">
          <Link href="/cart" className="flex-1">
            <Button variant="outline" fullWidth>
              返回購物車
            </Button>
          </Link>
          <Button className="flex-1" fullWidth disabled={loading} onClick={() => void placeOrder()}>
            {loading ? "處理中…" : "成立訂單"}
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
