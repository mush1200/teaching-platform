import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "教材列表 | Teaching Platform",
  description: "瀏覽公開上架教材，查看價格與簡介並加入購物車。",
  openGraph: {
    title: "教材列表 | Teaching Platform",
    description: "瀏覽公開上架教材。",
  },
};

export default function MaterialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
