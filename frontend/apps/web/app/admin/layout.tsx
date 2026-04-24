import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "管理後台 | Teaching Platform",
  description: "管理員後台：教材、訂單、付款憑證、檢舉與活動紀錄。",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
