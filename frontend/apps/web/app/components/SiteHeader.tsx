"use client";

import { useEffect, useState } from "react";
import { Paragraph, XStack } from "tamagui";
import { Link } from "solito/link";
import { getStoredRole } from "../../lib/api-client";

const linkStyle = {
  fontSize: 14,
  textDecorationLine: "underline" as const,
};

export function SiteHeader() {
  const [role, setRole] = useState<"parent" | "teacher" | "admin" | null>(null);

  useEffect(() => {
    setRole(getStoredRole());
  }, []);

  return (
    <header aria-label="主導覽">
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap="$3"
        backgroundColor="$background"
      >
        <Link href="/" aria-label="前往首頁">
          <Paragraph fontWeight="700">Teaching Platform</Paragraph>
        </Link>
        <nav aria-label="網站功能導覽">
          <XStack gap="$4" alignItems="center" flexWrap="wrap">
            <Link href="/materials" aria-label="前往教材列表">
              <Paragraph {...linkStyle}>教材</Paragraph>
            </Link>
            <Link href="/cart" aria-label="前往購物車">
              <Paragraph {...linkStyle}>購物車</Paragraph>
            </Link>
            <Link href="/checkout" aria-label="前往結帳">
              <Paragraph {...linkStyle}>結帳</Paragraph>
            </Link>
            <Link href="/orders" aria-label="前往訂單">
              <Paragraph {...linkStyle}>訂單</Paragraph>
            </Link>
            <Link href="/downloads" aria-label="前往下載">
              <Paragraph {...linkStyle}>下載</Paragraph>
            </Link>
            {role === "teacher" || role === "admin" ? (
              <Link href="/teacher/materials" aria-label="前往教師後台">
                <Paragraph {...linkStyle}>教師後台</Paragraph>
              </Link>
            ) : null}
            {role === "admin" ? (
              <Link href="/admin/payment-proofs" aria-label="前往審核">
                <Paragraph {...linkStyle}>審核</Paragraph>
              </Link>
            ) : null}
            <Link href="/login" aria-label="前往登入">
              <Paragraph {...linkStyle}>登入</Paragraph>
            </Link>
            <Link href="/register" aria-label="前往註冊">
              <Paragraph {...linkStyle}>註冊</Paragraph>
            </Link>
          </XStack>
        </nav>
      </XStack>
    </header>
  );
}
