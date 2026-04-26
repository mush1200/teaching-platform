import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "購物車 | EduMarket",
  description: "檢視購物車並前往結帳。",
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
