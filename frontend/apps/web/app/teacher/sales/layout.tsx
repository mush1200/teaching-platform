import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的銷售 | Teaching Platform",
  description: "創作者查看教材賣出份數、銷售額（折扣前）與成交明細的後台頁面。",
};

export default function CreatorSalesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
