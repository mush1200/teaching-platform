"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, InputField, LoadingState } from "@teaching-platform/ui";
import { Card, H1, Paragraph, Separator, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import type { CartItem, CartResponse } from "../../lib/api-types";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../lib/api-client";

export default function CartPage() {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("cart");
      if (res.status === 401) {
        setError("請先登入後再查看購物車。");
        setItems([]);
        return;
      }
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as CartResponse;
      setItems(data.items ?? []);
    } catch {
      setError("無法連線至伺服器，請稍後再試。");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  if (!hydrated) {
    return (
      <YStack flex={1} padding="$4" gap="$4" maxWidth={800} alignSelf="center" width="100%">
        <H1>購物車</H1>
        <LoadingState title="載入中…" />
      </YStack>
    );
  }

  async function updateQty(materialId: string, quantity: number) {
    const res = await apiFetch("cart/items", {
      method: "POST",
      body: JSON.stringify({ materialId, quantity }),
    });
    if (!res.ok) {
      setError(await parseApiErrorMessage(res));
      return;
    }
    await load();
  }

  async function removeItem(cartItemId: string) {
    const res = await apiFetch(`cart/items/${encodeURIComponent(cartItemId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError(await parseApiErrorMessage(res));
      return;
    }
    await load();
  }

  if (!token) {
    return (
      <YStack flex={1} padding="$4" gap="$4" maxWidth={800} alignSelf="center" width="100%">
        <H1>購物車</H1>
        <EmptyState
          title="請先登入"
          description="購物車需要登入後家長身分方可使用。"
          actionLabel="前往登入"
          onAction={() => {
            window.location.href = `/login?redirect=${encodeURIComponent("/cart")}`;
          }}
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={800} alignSelf="center" width="100%">
      <H1>購物車</H1>

      {loading ? <LoadingState title="載入購物車…" /> : null}
      {!loading && error ? (
        <ErrorState title="無法載入購物車" description={error} onRetry={() => void load()} />
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="購物車是空的"
          description="先到教材列表加入想購買的項目。"
          actionLabel="瀏覽教材"
          onAction={() => {
            window.location.href = "/materials";
          }}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <YStack gap="$4">
          {items.map((row) => (
            <CartLine
              key={row.id}
              item={row}
              onChangeQty={(q) => void updateQty(row.material_id, q)}
              onRemove={() => void removeItem(row.id)}
            />
          ))}
          <Separator />
          <XStack justifyContent="flex-end">
            <Link href="/checkout">
              <Paragraph color="$blue10" fontWeight="700" textDecorationLine="underline">
                前往結帳 →
              </Paragraph>
            </Link>
          </XStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

function CartLine({
  item,
  onChangeQty,
  onRemove,
}: {
  item: CartItem;
  onChangeQty: (quantity: number) => void;
  onRemove: () => void;
}) {
  const [qty, setQty] = useState(String(item.quantity));
  const [lineHint, setLineHint] = useState<string | null>(null);

  useEffect(() => {
    setQty(String(item.quantity));
  }, [item.id, item.quantity]);

  const qtyInputId = useMemo(() => `qty-${item.id}`, [item.id]);

  return (
    <Card padding="$4" borderWidth={1} borderColor="$borderColor">
      <YStack gap="$3">
        <Paragraph fontWeight="700">{item.title ?? item.material_id}</Paragraph>
        <Paragraph>單價 NT$ {Math.floor(Number(item.price) || 0)}</Paragraph>
        <XStack gap="$3" alignItems="flex-end" flexWrap="wrap">
          <YStack flex={1} minWidth={200}>
            <InputField
              id={qtyInputId}
              label="數量"
              value={qty}
              onChangeText={(next) => {
                setQty(next);
                setLineHint(null);
              }}
              errorText={lineHint ?? undefined}
            />
          </YStack>
          <Button
            variant="secondary"
            onPress={() => {
              const q = Number.parseInt(qty, 10);
              if (Number.isNaN(q) || !Number.isInteger(q) || q < 1) {
                setLineHint("數量須為至少 1。若不要此品項請按「移除」。");
                return;
              }
              setLineHint(null);
              onChangeQty(q);
            }}
          >
            更新數量
          </Button>
          <Button variant="danger" onPress={onRemove}>
            移除
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
