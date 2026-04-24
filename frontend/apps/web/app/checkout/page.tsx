"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState } from "@teaching-platform/ui";
import { Card, H1, Paragraph, YStack } from "tamagui";
import { Link } from "solito/link";
import type { CreateOrderResponse, OrderItemRow } from "../../lib/api-types";
import { apiFetch, getStoredRole, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";

const STORAGE_PENDING = "tp_pending_downloads";

export default function CheckoutPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<"parent" | "teacher" | "admin" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
    setRole(getStoredRole());
  }, []);

  async function placeOrder() {
    if (!token) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch("orders", { method: "POST" });
      if (res.status === 403) {
        setMsg("僅家長身分可由購物車建立訂單。");
        return;
      }
      if (!res.ok) {
        setMsg(await parseApiErrorMessage(res));
        return;
      }
      const payload = (await res.json()) as CreateOrderResponse;
      const items = payload.data?.items ?? [];
      const simplified = items.map((r: OrderItemRow) => ({
        material_id: r.material_id,
        material_title: r.material_title ?? r.material_id,
      }));
      try {
        sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(simplified));
      } catch {
        /* ignore quota */
      }
      const orderId = payload.data?.order?.id;
      setMsg("訂單已建立。");
      if (orderId) {
        router.push(`/orders/${encodeURIComponent(orderId)}/upload-proof`);
      } else {
        router.push("/orders");
      }
    } catch {
      setMsg("建立訂單失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <YStack padding="$4" maxWidth={560} alignSelf="center" width="100%">
        <H1>結帳</H1>
        <Paragraph color="$color11">載入中…</Paragraph>
      </YStack>
    );
  }

  if (!token) {
    return (
      <YStack padding="$4" maxWidth={560} alignSelf="center" width="100%">
        <H1>結帳</H1>
        <EmptyState
          title="請先登入"
          description="結帳需要登入。"
          actionLabel="前往登入"
          onAction={() => {
            window.location.href = `/login?redirect=${encodeURIComponent("/checkout")}`;
          }}
        />
      </YStack>
    );
  }

  if (role && role !== "parent") {
    return (
      <YStack padding="$4" maxWidth={560} alignSelf="center" width="100%" gap="$3">
        <H1>結帳</H1>
        <Paragraph color="$orange10">僅家長身分可使用購物車結帳。</Paragraph>
        <Link href="/materials">
          <Paragraph color="$blue10" textDecorationLine="underline">
            返回教材列表
          </Paragraph>
        </Link>
      </YStack>
    );
  }

  return (
    <YStack padding="$4" maxWidth={560} alignSelf="center" width="100%" gap="$4">
      <H1>結帳</H1>
      <Paragraph color="$color11">
        確認購物車內容後按下「成立訂單」。建立後請依指示完成手動轉帳並上傳付款憑證。
      </Paragraph>
      <Card padding="$4" borderWidth={1} borderColor="$borderColor">
        <YStack gap="$3">
          <Paragraph fontWeight="600">訂單將以購物車內所有項目計價並清空購物車。</Paragraph>
          <Button onPress={() => void placeOrder()} loading={loading} disabled={loading}>
            {loading ? "處理中…" : "成立訂單"}
          </Button>
          {msg ? <Paragraph color="$green10">{msg}</Paragraph> : null}
          <Link href="/cart">
            <Paragraph color="$blue10" textDecorationLine="underline">
              返回購物車
            </Paragraph>
          </Link>
        </YStack>
      </Card>
    </YStack>
  );
}
