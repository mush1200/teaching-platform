import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "結帳 | EduMarket",
  description: "確認購物車並建立訂單。",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
