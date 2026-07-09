import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "創作者銷售中心 | Teaching Platform",
  description: "創作者查看教材賣出份數、營收與成交明細的後台頁面。",
};

export default function CreatorSalesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
