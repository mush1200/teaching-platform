"use client";

import { use, useEffect, useState } from "react";
import { Button, InputField } from "@teaching-platform/ui";
import { Card, H1, Paragraph, YStack } from "tamagui";
import { Link } from "solito/link";
import { z } from "zod";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../../../lib/api-client";

const proofSchema = z.object({
  proofUrl: z.string().url({ message: "請輸入有效的憑證網址（http/https）" }),
});

export default function UploadProofPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orderId } = use(params);
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setToken(getStoredToken());
  }, []);

  async function submit() {
    setMsg(null);
    const parsed = proofSchema.safeParse({ proofUrl });
    if (!parsed.success) {
      setMsg(parsed.error.issues[0]?.message ?? "輸入有誤");
      return;
    }
    if (!token) {
      setMsg("請先登入。");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`orders/${encodeURIComponent(orderId)}/upload-proof`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setMsg(await parseApiErrorMessage(res));
        return;
      }
      setMsg("已送出憑證，請等待審核。");
    } catch {
      setMsg("上傳失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <YStack padding="$4" maxWidth={560} alignSelf="center">
        <Paragraph>載入中…</Paragraph>
      </YStack>
    );
  }

  if (!token) {
    return (
      <YStack padding="$4" maxWidth={560} alignSelf="center">
        <Paragraph>請先登入。</Paragraph>
        <Link href={`/login?redirect=${encodeURIComponent(`/orders/${orderId}/upload-proof`)}`}>
          <Paragraph color="$blue10">前往登入</Paragraph>
        </Link>
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={560} alignSelf="center" width="100%">
      <Link href="/orders">
        <Paragraph textDecorationLine="underline" color="$blue10">
          ← 返回訂單列表
        </Paragraph>
      </Link>
      <H1>上傳付款憑證</H1>
      <YStack gap="$1">
        <Paragraph color="$color11">訂單編號</Paragraph>
        <Paragraph fontWeight="700">{orderId}</Paragraph>
      </YStack>
      <Paragraph size="$3" color="$color10">
        請將轉帳截圖或憑證先上傳至你可分享的雲端或圖床，再貼上公開連結（須為 http/https）。
      </Paragraph>

      <Card padding="$4" borderWidth={1} borderColor="$borderColor" gap="$3">
        <InputField
          id="proof-url"
          label="憑證網址"
          value={proofUrl}
          onChangeText={setProofUrl}
          placeholder="https://..."
          autoComplete="off"
          disabled={loading}
        />
        <Button onPress={() => void submit()} loading={loading} disabled={loading}>
          {loading ? "送出中…" : "送出憑證"}
        </Button>
        {msg ? <Paragraph color="$orange10">{msg}</Paragraph> : null}
      </Card>
    </YStack>
  );
}
