import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的訂單 | EduMarket",
  description: "查看訂單狀態與付款憑證進度。",
};

/** 登入後的個人化訂單流程：關閉靜態預渲染（頁面在頂層使用 useSearchParams）。 */
export const dynamic = "force-dynamic";

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
