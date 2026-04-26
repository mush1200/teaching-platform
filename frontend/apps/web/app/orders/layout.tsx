import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的訂單 | EduMarket",
  description: "查看訂單狀態與付款憑證進度。",
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
