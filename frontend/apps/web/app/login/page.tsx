"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, H2, Input, Label, Paragraph, Text, YStack } from "tamagui";
import { z } from "zod";
import { LoginResponse, mapStatusMessage } from "../../lib/auth";

const loginSchema = z.object({
  email: z.string().email("Email 格式不正確"),
  password: z.string().min(1, "請輸入密碼"),
});

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "登入資料有誤");
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        setMessage(mapStatusMessage(response.status));
        return;
      }

      const payload = (await response.json()) as LoginResponse;
      localStorage.setItem("tp_token", payload.token);
      localStorage.setItem("tp_role", payload.user.role);
      localStorage.setItem("tp_user_email", payload.user.email);

      document.cookie = `tp_token=${encodeURIComponent(payload.token)}; path=/; max-age=86400; samesite=lax`;
      document.cookie = `tp_role=${payload.user.role}; path=/; max-age=86400; samesite=lax`;

      setMessage("登入成功，正在導向...");
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      if (redirect) {
        router.push(redirect);
        return;
      }
      router.push("/");
    } catch {
      setMessage(mapStatusMessage(500));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <YStack minHeight="100vh" justifyContent="center" alignItems="center" padding="$4">
      <Card width="100%" maxWidth={420} padding="$5" borderWidth={1} borderColor="$borderColor">
        <YStack gap="$4">
          <YStack gap="$2">
            <H2>登入</H2>
            <Paragraph>請使用你的帳號登入教具平台。</Paragraph>
          </YStack>

          <YStack gap="$2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              placeholder="parent@example.com"
            />
          </YStack>

          <YStack gap="$2">
            <Label htmlFor="password">密碼</Label>
            <Input
              id="password"
              autoComplete="current-password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="請輸入密碼"
            />
          </YStack>

          <Button onPress={handleLogin} theme="active" disabled={isLoading}>
            <Text>{isLoading ? "登入中..." : "登入"}</Text>
          </Button>

          {message ? <Paragraph color="$orange10">{message}</Paragraph> : <Paragraph>請輸入帳密登入。</Paragraph>}
        </YStack>
      </Card>
    </YStack>
  );
}
