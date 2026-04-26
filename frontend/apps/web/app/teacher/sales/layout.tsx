import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "教師銷售中心 | Teaching Platform",
  description: "教師查看教材賣出份數、營收與成交明細的後台頁面。",
};

export default function TeacherSalesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
