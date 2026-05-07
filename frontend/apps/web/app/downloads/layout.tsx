import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的教材 | Teaching Platform",
  description: "已購買並取得授權的教材庫。",
};

export default function DownloadsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
