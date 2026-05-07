"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { MobileHeader } from "../../components/layout/MobileHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getCartItems, replaceCartItems } from "../../lib/edu-api-mock";
import type { MockCartItem } from "../../lib/mock-data";
import { apiFetch, getStoredRole, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";
import { trackEvent } from "../../lib/analytics";
import { pushNotification } from "../../lib/notifications";
import type { CartResponse, CreateOrderResponse, MaterialsListResponse } from "../../lib/api-types";

type Step = 1 | 2 | 3;
type InvoiceType = "none" | "carrier";
const BANK_INFO = {
  name: "Teaching Platform 收款帳戶",
  code: "812",
  account: "1234-5678-9012-3456",
  holder: "Teaching Platform Co.",
};

export default function CheckoutPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<MockCartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [billing, setBilling] = useState({ name: "", email: "", phone: "" });
  const [paymentMode, setPaymentMode] = useState<"manual_transfer">("manual_transfer");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountAmount: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("none");
  const [invoiceCarrier, setInvoiceCarrier] = useState("");
  const [promoTick, setPromoTick] = useState(false);
  const [amountAnimating, setAmountAnimating] = useState(false);

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
  const discount = promoApplied?.discountAmount ?? 0;
  const payable = Math.max(0, subtotal - discount);
  const submitDisabled = submitting || cartLoading || cartItems.length === 0;
  function classifyMessageTone(text: string): "warning" | "system" | "support" {
    if (text.includes("請") || text.includes("格式")) return "warning";
    if (text.includes("暫時") || text.includes("稍後")) return "system";
    return "support";
  }

  const submitDisabledReason = cartLoading
    ? "購物車載入中，請稍候。"
    : cartItems.length === 0
      ? "購物車目前沒有商品，請先加入教材。"
      : null;

  useEffect(() => {
    if (discount <= 0) return;
    setAmountAnimating(true);
    const t = window.setTimeout(() => setAmountAnimating(false), 350);
    return () => window.clearTimeout(t);
  }, [discount]);

  function inferMaterialType(title: string): string {
    if (title.includes("數學")) return "數學教材";
    if (title.includes("語")) return "語言教材";
    if (title.includes("科")) return "科學教材";
    if (title.includes("美術") || title.includes("繪")) return "藝術教材";
    return "綜合教材";
  }

  function inferTags(title: string): string[] {
    const tags: string[] = [];
    if (title.includes("數學")) tags.push("圖卡", "配對");
    if (title.includes("閱讀") || title.includes("語")) tags.push("朗讀", "剪貼");
    if (title.includes("科學")) tags.push("實驗", "觀察");
    if (tags.length === 0) tags.push("桌遊", "任務");
    return tags.slice(0, 4);
  }

  function normalizeOrderError(message: string): string {
    const text = String(message || "").trim();
    if (!text) return "建立訂單失敗，請稍後再試。";
    if (text === "Cart is empty" || text.includes("購物車")) {
      return "目前無法建立訂單：後端購物車為空。請先到購物車重新整理後再試一次。";
    }
    return text;
  }

  function validateStep1() {
    if (!billing.name.trim()) return "請輸入姓名。";
    if (!billing.email.trim()) return "請輸入 Email。";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email)) return "Email 格式不正確。";
    return null;
  }

  function validateInvoice(): string | null {
    if (invoiceType !== "carrier") return null;
    const normalized = String(invoiceCarrier || "").trim().toUpperCase();
    if (!/^\/[A-Z0-9.+-]{7}$/.test(normalized)) return "手機載具格式不正確";
    return null;
  }

  async function applyPromoCode() {
    const code = promoCodeInput.trim().toUpperCase();
    if (!code) {
      setPromoApplied(null);
      setMsg("請輸入優惠代碼。");
      return;
    }
    setPromoBusy(true);
    trackEvent("promo_apply_clicked", { step: 3 });
    try {
      const res = await apiFetch("orders/promo/validate", {
        method: "POST",
        body: JSON.stringify({ code, subtotal }),
      });
      if (!res.ok) {
        setPromoApplied(null);
        setMsg(await parseApiErrorMessage(res));
        return;
      }
      const payload = (await res.json()) as { code?: string; discount_amount?: number };
      setPromoApplied({
        code: String(payload.code || code),
        discountAmount: Math.max(0, Number(payload.discount_amount || 0)),
      });
      trackEvent("promo_applied", { code: String(payload.code || code) });
      setPromoTick(true);
      window.setTimeout(() => setPromoTick(false), 320);
      setMsg(null);
    } catch {
      setPromoApplied(null);
      setMsg("優惠代碼套用失敗，請稍後再試。");
    } finally {
      setPromoBusy(false);
    }
  }

  async function placeOrder() {
    trackEvent("order_submit_clicked", { step: 3, payable, hasPromo: Boolean(promoApplied) });
    if (!token) {
      setMsg("請先登入後再結帳。");
      return;
    }
    if (role && role !== "parent") {
      setMsg("目前帳號身分無法使用結帳。");
      return;
    }
    if (validateStep1()) {
      setMsg(validateStep1());
      setStep(1);
      return;
    }
    const invoiceError = validateInvoice();
    if (invoiceError) {
      setMsg(invoiceError);
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      if (cartItems.length === 0) {
        setMsg("購物車目前是空的。");
        return;
      }
      // Sync mock cart UI items into backend cart_items before creating order.
      let materialsCache: MaterialsListResponse | null = null;
      for (const item of cartItems) {
        let upsertRes = await apiFetch("cart/items", {
          method: "POST",
          body: JSON.stringify({ materialId: item.materialId, quantity: item.quantity }),
        });
        if (!upsertRes.ok) {
          const syncErr = await parseApiErrorMessage(upsertRes);
          // Fallback: some old mock items use stale materialId; recover by title match.
          if (syncErr.includes("material not found")) {
            if (!materialsCache) {
              const materialsRes = await apiFetch("materials");
              if (materialsRes.ok) {
                materialsCache = (await materialsRes.json()) as MaterialsListResponse;
              }
            }
            const candidate = (materialsCache?.items || []).find(
              (m) =>
                String(m.title || "").trim() === String(item.title || "").trim() &&
                String(m.status || "") === "published"
            );
            if (candidate?.id) {
              upsertRes = await apiFetch("cart/items", {
                method: "POST",
                body: JSON.stringify({ materialId: candidate.id, quantity: item.quantity }),
              });
              if (upsertRes.ok) {
                continue;
              }
            }
          }
          setMsg(`無法同步購物車商品「${item.title}」，請回到購物車移除後重新加入。`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }

      const cartRes = await apiFetch("cart");
      if (!cartRes.ok) {
        setMsg("無法讀取後端購物車，請稍後再試。");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const backendCart = (await cartRes.json()) as CartResponse;
      if (!Array.isArray(backendCart.items) || backendCart.items.length === 0) {
        setMsg("目前無法建立訂單：後端購物車為空。請先到購物車重新整理後再試一次。");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const res = await apiFetch("orders", {
        method: "POST",
        body: JSON.stringify({
          billing,
          paymentMode,
          promo_code: promoApplied?.code ?? null,
          invoice_type: invoiceType,
          invoice_carrier: invoiceType === "carrier" ? invoiceCarrier.trim().toUpperCase() : null,
        }),
      });
      if (!res.ok) {
        setMsg(normalizeOrderError(await parseApiErrorMessage(res)));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const data = (await res.json()) as CreateOrderResponse;
      const orderId = data?.data?.order?.id;
      if (!orderId) {
        setMsg("建立訂單失敗，請稍後再試。");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      await replaceCartItems([]);
      pushNotification({
        tone: "info",
        title: "訂單已建立",
        body: "請完成匯款後上傳付款憑證，我們會通知您審核結果。",
      });
      router.push(`/orders/${encodeURIComponent(orderId)}/payment-proof?flash=order_created_email_sent`);
    } catch {
      setMsg("建立訂單失敗，請稍後再試。");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell withBottomNav>
      <MobileHeader title="結帳" backHref="/cart" right="none" />
      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-28 pt-4 sm:px-6">
        <Card level="flat" padding="md" className="mx-auto w-full max-w-[720px]">
          <ol className="grid grid-cols-3 gap-2 text-center">
            {[
              { step: 1, label: "帳單資訊" },
              { step: 2, label: "付款方式" },
              { step: 3, label: "審核確認" },
            ].map((s) => {
              const active = step === s.step;
              const done = step > (s.step as Step);
              return (
                <li key={s.step} className="relative space-y-2">
                  {s.step < 3 ? (
                    <span
                      className={`absolute left-[calc(50%+16px)] top-4 h-[2px] w-[calc(100%-32px)] ${
                        step > (s.step as Step) ? "bg-[#6C63FF]" : "bg-[#E5E7EB]"
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                      done
                        ? "bg-[#6C63FF] text-white"
                        : active
                          ? "bg-[#6C63FF] text-white shadow-[0_0_0_3px_rgba(108,99,255,0.16)]"
                          : "border border-[#D1D5DB] bg-white text-[#9CA3AF]"
                    }`}
                  >
                    {done ? "✓" : s.step}
                  </span>
                  <p className={`text-xs font-semibold ${active || done ? "text-[#1F2937]" : "text-[#9CA3AF]"}`}>
                    {s.label}
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>

        {step === 1 ? (
          <Card level="default" className="mx-auto w-full max-w-[720px] space-y-4">
            <h2 className="text-lg font-bold text-[#1F2937]">Step 1 帳單資訊</h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-[#374151]">姓名</span>
                <input
                  value={billing.name}
                  onChange={(e) => setBilling((v) => ({ ...v, name: e.target.value }))}
                  className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-[#374151]">Email</span>
                <input
                  value={billing.email}
                  onChange={(e) => setBilling((v) => ({ ...v, email: e.target.value }))}
                  className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-[#374151]">電話（選填）</span>
                <input
                  value={billing.phone}
                  onChange={(e) => setBilling((v) => ({ ...v, phone: e.target.value }))}
                  className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2"
                />
              </label>
            </div>
            <Button
              intent="flow"
              fullWidth
              onClick={() => {
                const error = validateStep1();
                if (error) return setMsg(error);
                setMsg(null);
                setStep(2);
              }}
            >
              下一步
            </Button>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card level="default" className="mx-auto w-full max-w-[720px] space-y-4">
            <h2 className="text-lg font-bold text-[#1F2937]">Step 2 付款方式</h2>
            <button
              type="button"
              onClick={() => setPaymentMode("manual_transfer")}
              className={`w-full rounded-2xl border p-4 text-left ${
                paymentMode === "manual_transfer"
                  ? "border-[#6C63FF] bg-[#F7F4FF] shadow-[0_0_0_2px_rgba(108,99,255,0.18)]"
                  : "border-[#E5E7EB]"
              }`}
            >
              <p className="font-semibold text-[#1F2937]">銀行轉帳 {paymentMode === "manual_transfer" ? "✓" : ""}</p>
              <p className="text-sm text-[#6B7280]">MVP 付款方式</p>
            </button>
            <div className="rounded-2xl border border-dashed border-[#D8D2FF] bg-[#FAF8FF] p-4 text-sm text-[#4B5563]">
              <p>銀行名稱：{BANK_INFO.name}</p>
              <p>銀行代碼：{BANK_INFO.code}</p>
              <p>匯款帳號：{BANK_INFO.account}</p>
              <p>戶名：{BANK_INFO.holder}</p>
            </div>
            <div className="flex gap-2">
              <Button intent="neutral" variant="outline" fullWidth onClick={() => setStep(1)}>
                上一步
              </Button>
              <Button intent="flow" fullWidth onClick={() => setStep(3)}>
                下一步
              </Button>
            </div>
          </Card>
        ) : null}

        {step === 3 ? (
          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card level="default">
              <h2 className="text-lg font-bold text-[#1F2937]">Step 3 審核確認</h2>
              <p className="mt-1 text-sm text-[#6B7280]">請確認商品、帳單與付款方式後再送出訂單。</p>
              <h3 className="mt-4 text-sm font-semibold text-[#1F2937]">商品列表</h3>
              <ul className="mt-3 space-y-3">
                {cartItems.map((item) => (
                  <li key={item.id} className="rounded-2xl border border-[#ececf2] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                    <div className="flex gap-3">
                      <div className={`h-[72px] w-[72px] shrink-0 rounded-xl bg-gradient-to-br ${item.coverGradient}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1F2937]">{item.title}</p>
                        <p className="mt-0.5 text-xs text-[#6B7280]">{item.ageLabel}</p>
                        <p className="mt-0.5 text-xs text-[#6B7280]">{inferMaterialType(item.title)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {inferTags(item.title).map((tag) => (
                            <span key={`${item.id}-${tag}`} className="rounded-full bg-[#F4F1FF] px-2 py-0.5 text-[11px] font-medium text-[#6C63FF]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-[#1F2937]">NT${(item.price * item.quantity).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card level="elevated" className="h-fit lg:sticky lg:top-20">
              <h3 className="text-sm font-semibold text-[#1F2937]">訂單摘要</h3>
              <div className="mt-2 rounded-2xl border border-[#ececf2] bg-white p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <p className="text-sm text-[#4B5563]">商品小計：NT${subtotal.toLocaleString()}</p>
                <p
                  className={`mt-1 rounded-lg px-2 py-1 text-sm text-[#4B5563] transition ${
                    discount > 0 ? "bg-[#f2ecff] shadow-[0_0_0_1px_rgba(108,99,255,0.12)]" : ""
                  }`}
                >
                  優惠折扣：-{discount > 0 ? `NT$${discount.toLocaleString()}` : "NT$0"}
                </p>
                <p className={`mt-2 text-base font-bold text-[#1F2937] transition ${amountAnimating ? "scale-[1.02] opacity-90" : "scale-100 opacity-100"}`}>
                  總金額：NT${payable.toLocaleString()}
                </p>
              </div>
              <div className="mt-3 rounded-2xl border border-[#ececf2] bg-white p-3">
                <p className="text-sm font-semibold text-[#1F2937]">優惠代碼</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="輸入優惠代碼"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
                  />
                  <Button type="button" intent="neutral" variant="outline" disabled={promoBusy} onClick={() => void applyPromoCode()}>
                    {promoBusy ? "套用中" : "套用"}
                  </Button>
                </div>
                {promoApplied ? (
                  <p
                    className={`mt-2 text-xs text-emerald-700 transition ${
                      promoTick ? "scale-100 opacity-100" : "scale-95 opacity-80"
                    }`}
                  >
                    ✓ 已套用代碼 {promoApplied.code}，折扣 NT${promoApplied.discountAmount.toLocaleString()}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 rounded-2xl border border-[#ececf2] bg-white p-3">
                <p className="text-sm font-semibold text-[#1F2937]">電子發票（選填）</p>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="radio" name="invoiceType" checked={invoiceType === "none"} onChange={() => setInvoiceType("none")} />
                  不需要發票
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="radio" name="invoiceType" checked={invoiceType === "carrier"} onChange={() => setInvoiceType("carrier")} />
                  手機載具
                </label>
                {invoiceType === "carrier" ? (
                  <div className="mt-2">
                    <input
                      value={invoiceCarrier}
                      onChange={(e) => setInvoiceCarrier(e.target.value.toUpperCase())}
                      placeholder="/ABC1234"
                      className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-[#6B7280]">請輸入手機載具條碼，例如：/ABC1234</p>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 rounded-xl bg-[#F9FAFB] p-3 text-xs text-[#4B5563]">
                <p>姓名：{billing.name}</p>
                <p>Email：{billing.email}</p>
                <p>電話：{billing.phone || "—"}</p>
                <p>付款方式：銀行轉帳</p>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Button intent="neutral" variant="outline" fullWidth onClick={() => setStep(1)}>
                  返回修改
                </Button>
                <Button
                  intent="flow"
                  fullWidth
                  disabled={submitDisabled}
                  onClick={() => void placeOrder()}
                >
                  {submitting ? "處理中…" : `確認送出訂單 · NT$${payable.toLocaleString()}`}
                </Button>
                {submitDisabledReason ? <p className="text-xs text-amber-700">{submitDisabledReason}</p> : null}
                {msg ? (
                  <div
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      classifyMessageTone(msg) === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : classifyMessageTone(msg) === "system"
                          ? "border-violet-200 bg-violet-50 text-violet-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                    }`}
                  >
                    {msg}
                    {classifyMessageTone(msg) === "system" ? <p className="mt-1 text-xs">建議稍後重試，或回到購物車重新整理資料。</p> : null}
                    {classifyMessageTone(msg) === "support" ? <p className="mt-1 text-xs">若問題持續，請聯繫客服並提供訂單時間與帳號 Email。</p> : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 rounded-2xl border border-[#e9e8ef] bg-white p-4 text-xs leading-relaxed text-[#4B5563]">
                <p className="text-sm font-semibold text-[#1F2937]">安心購買保證</p>
                <ul className="mt-2 space-y-1.5">
                  <li className="text-emerald-700">✔ 購買後可永久下載</li>
                  <li className="text-emerald-700">✔ 人工審核付款保障交易安全</li>
                  <li className="text-emerald-700">✔ 教材皆經平台審核</li>
                  <li className="text-emerald-700">✔ 支援 Email 通知與訂單查詢</li>
                </ul>
              </div>
            </Card>
          </section>
        ) : null}

        {cartLoading ? <p className="mx-auto max-w-[720px] text-sm text-[#6B7280]">載入明細中…</p> : null}
        {!cartLoading && cartItems.length === 0 ? (
          <Card level="default" className="mx-auto w-full max-w-[720px]">
            <p className="text-sm font-medium text-[#1F2937]">購物車目前是空的</p>
            <Link href="/materials" className="mt-4 inline-block">
              <Button type="button" intent="action">
                前往教材列表
              </Button>
            </Link>
          </Card>
        ) : null}

        {step === 3 ? (
          <div className="fixed inset-x-0 bottom-[58px] z-20 border-t border-[#ececf2] bg-white/95 p-3 backdrop-blur md:hidden">
            <Button intent="flow" fullWidth disabled={submitDisabled} onClick={() => void placeOrder()}>
              {submitting ? "處理中…" : `確認送出訂單 · NT$${payable.toLocaleString()}`}
            </Button>
          </div>
        ) : null}

      </main>
    </AppShell>
  );
}
