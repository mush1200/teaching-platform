"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, H2, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import { z } from "zod";
import { Button, InputField, SelectField } from "@teaching-platform/ui";
import type { UserRole } from "../../lib/api-types";
import type { LoginResponse } from "../../lib/auth";
import { mapStatusMessage } from "../../lib/auth";

const registerSchema = z.object({
  email: z.string().email("Email 格式不正確"),
  password: z.string().min(6, "密碼至少 6 個字元"),
  role: z.enum(["parent", "teacher"]),
});

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("parent");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const roleOptions = [
    { label: "家長（購買教材）", value: "parent" },
    { label: "老師（上架教材）", value: "teacher" },
  ];

  async function submit() {
    const parsed = registerSchema.safeParse({ email, password, role });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "資料有誤");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        setMessage(await parseRegisterError(response));
        return;
      }

      const payload = (await response.json()) as LoginResponse;
      localStorage.setItem("tp_token", payload.token);
      localStorage.setItem("tp_role", payload.user.role);
      localStorage.setItem("tp_user_email", payload.user.email);
      document.cookie = `tp_token=${encodeURIComponent(payload.token)}; path=/; max-age=86400; samesite=lax`;
      document.cookie = `tp_role=${payload.user.role}; path=/; max-age=86400; samesite=lax`;

      setMessage("註冊成功，正在導向首頁…");
      router.push("/");
    } catch {
      setMessage(mapStatusMessage(500));
    } finally {
      setLoading(false);
    }
  }

  return (
    <YStack minHeight="calc(100vh - 56px)" justifyContent="center" alignItems="center" padding="$4">
      <Card width="100%" maxWidth={420} padding="$5" borderWidth={1} borderColor="$borderColor">
        <YStack gap="$4">
          <YStack gap="$2">
            <H2>註冊</H2>
            <Paragraph>建立家長或老師帳號。（若需管理員請由後台建立）</Paragraph>
          </YStack>

          <SelectField id="role" label="身分" options={roleOptions} value={role} onValueChange={(v) => setRole(v as UserRole)} />

          <InputField
            id="reg-email"
            label="Email"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            disabled={loading}
          />

          <InputField
            id="reg-password"
            label="密碼（至少 6 字元）"
            autoComplete="new-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="請設定密碼"
            disabled={loading}
          />

          <Button onPress={() => void submit()} disabled={loading} loading={loading}>
            {loading ? "送出中…" : "建立帳號"}
          </Button>

          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Paragraph color="$color11">已有帳號？</Paragraph>
            <Link href="/login">
              <Paragraph color="$blue10" textDecorationLine="underline">
                前往登入
              </Paragraph>
            </Link>
          </XStack>

          {message ? <Paragraph color="$orange10">{message}</Paragraph> : null}
        </YStack>
      </Card>
    </YStack>
  );
}

async function parseRegisterError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (data.message) return data.message;
  } catch {
    /* ignore */
  }
  return mapStatusMessage(response.status);
}
