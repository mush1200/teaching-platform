"use client";

import { H1, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";

export default function Home() {
  return (
    <YStack
      minHeight="100vh"
      padding="$6"
      justifyContent="center"
      alignItems="center"
      gap="$4"
    >
      <H1>Teaching Platform Web</H1>
      <Paragraph size="$6" textAlign="center">
        Next.js + TypeScript + App Router with Tamagui and Solito is ready.
      </Paragraph>
      <XStack gap="$3" flexWrap="wrap" justifyContent="center">
        <Link href="/materials">教材列表</Link>
        <Link href="/cart">購物車</Link>
        <Link href="/login">前往登入頁</Link>
        <Link href="/register">註冊</Link>
      </XStack>
    </YStack>
  );
}
