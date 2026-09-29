import type { Metadata } from "next";
import { Suspense } from "react";
/*
 * 字型自架（`UI-QA-FONT`）：不再用 `next/font/google` 在建置／dev 時向 Google 抓檔。
 * 堆疊與理由見 `lib/font-stack.ts`。
 */
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-tc";
import "./globals.css";
import { AppProviders } from "./providers";
import { RoleShell } from "../components/layout/RoleShell";
import { GlobalToastHost } from "../components/ui/GlobalToastHost";
import { CANONICAL_FONT_STACK } from "../lib/font-stack";

export const metadata: Metadata = {
  title: "EduMarket | 教具平台",
  description: "柔和教育風格之教材商城 MVP。",
  openGraph: {
    title: "EduMarket | 教具平台",
    description: "教材瀏覽、購買與管理。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="t_light" suppressHydrationWarning>
      <body className="antialiased" style={{ fontFamily: CANONICAL_FONT_STACK }}>
        <AppProviders>
          <Suspense fallback={children}>
            <RoleShell>{children}</RoleShell>
            <GlobalToastHost />
          </Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
