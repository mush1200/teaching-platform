"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorState, InputField, LoadingState } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import type { CartItem, Material } from "../../../lib/api-types";
import { apiFetch, getStoredRole, getStoredToken, parseApiErrorMessage } from "../../../lib/api-client";

type Props = {
  materialId: string;
};

export default function MaterialDetailClient({ materialId }: Props) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartSubmitting, setCartSubmitting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<"parent" | "teacher" | "admin" | null>(null);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
    setRole(getStoredRole());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(materialId)}`);
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setMaterial(null);
        return;
      }
      const data = (await res.json()) as Material;
      setMaterial(data);
    } catch {
      setError("無法連線至伺服器，請稍後再試。");
      setMaterial(null);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hydrated) {
    return (
      <YStack flex={1} padding="$4" gap="$4" maxWidth={720} width="100%" alignSelf="center">
        <Paragraph color="$color11">載入中…</Paragraph>
      </YStack>
    );
  }

  async function addToCart() {
    setCartMessage(null);
    if (!token) {
      setCartMessage("請先登入（家長帳號）後再加入購物車。");
      return;
    }
    if (role && role !== "parent") {
      setCartMessage("購物車僅限家長帳號使用。");
      return;
    }
    const q = Number.parseInt(qty, 10);
    if (!Number.isInteger(q) || q < 1) {
      setCartMessage("數量須為至少 1 的整數。");
      return;
    }
    setCartSubmitting(true);
    try {
      const res = await apiFetch("cart/items", {
        method: "POST",
        body: JSON.stringify({ materialId, quantity: q }),
      });
      if (!res.ok) {
        setCartMessage(await parseApiErrorMessage(res));
        return;
      }
      const row = (await res.json()) as CartItem;
      setCartMessage(`已加入購物車（項目 ${row.id}）。`);
      router.push("/cart");
    } catch {
      setCartMessage("加入購物車失敗，請稍後再試。");
    } finally {
      setCartSubmitting(false);
    }
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={720} width="100%" alignSelf="center">
      <Link href="/materials">
        <Paragraph textDecorationLine="underline" color="$blue10">
          ← 返回列表
        </Paragraph>
      </Link>

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? (
        <ErrorState title="無法顯示教材" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && !material ? <EmptyState title="找不到教材" description="此教材不存在或無權瀏覽。" /> : null}

      {!loading && material ? (
        <Card padding="$5" borderWidth={1} borderColor="$borderColor" gap="$4">
          <YStack gap="$2">
            <H1 size="$8">{material.title}</H1>
            {material.description ? <Paragraph color="$color11">{material.description}</Paragraph> : null}
            <XStack gap="$6" flexWrap="wrap">
              <Paragraph fontWeight="700">NT$ {Math.floor(Number(material.price) || 0)}</Paragraph>
              {material.category ? <Paragraph color="$color10">分類：{material.category}</Paragraph> : null}
              {material.age_range ? <Paragraph color="$color10">適齡：{material.age_range}</Paragraph> : null}
            </XStack>
          </YStack>

          <YStack gap="$3" borderTopWidth={1} borderColor="$borderColor" paddingTop="$4">
            <Paragraph fontWeight="600">加入購物車</Paragraph>
            {!token ? (
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <Paragraph color="$orange10">請先登入：</Paragraph>
                <Link href={`/login?redirect=${encodeURIComponent(`/materials/${materialId}`)}`}>
                  <Paragraph color="$blue10" textDecorationLine="underline">
                    前往登入
                  </Paragraph>
                </Link>
              </XStack>
            ) : null}
            <InputField
              id="qty"
              label="數量"
              value={qty}
              onChangeText={setQty}
              placeholder="1"
              disabled={cartSubmitting}
            />
            <Button onPress={() => void addToCart()} disabled={cartSubmitting} loading={cartSubmitting}>
              {cartSubmitting ? "加入中…" : "加入購物車"}
            </Button>
            {cartMessage ? <Paragraph color="$orange10">{cartMessage}</Paragraph> : null}
          </YStack>
        </Card>
      ) : null}
    </YStack>
  );
}
