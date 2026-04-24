import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "我的訂單 | Teaching Platform",
  description: "查看訂單狀態並前往上傳付款憑證。",
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
