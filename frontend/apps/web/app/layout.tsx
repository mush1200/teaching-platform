import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers";
import { RoleShell } from "../components/layout/RoleShell";
import { GlobalToastHost } from "../components/ui/GlobalToastHost";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

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
    <html lang="zh-Hant" className={`${inter.variable} ${notoSansTc.variable} t_light`} suppressHydrationWarning>
      <body
        className={`${notoSansTc.className} antialiased`}
        style={{ fontFamily: "var(--font-noto), var(--font-inter), ui-sans-serif, system-ui, sans-serif" }}
      >
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
