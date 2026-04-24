import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "結帳 | Teaching Platform",
  description: "由購物車建立訂單並取得待付款資訊。",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
