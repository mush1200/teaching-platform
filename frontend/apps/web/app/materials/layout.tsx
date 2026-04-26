import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "教材列表 | EduMarket",
  description: "瀏覽公開教材，探索優質內容。",
  openGraph: {
    title: "教材列表 | EduMarket",
    description: "瀏覽公開教材。",
  },
};

export default function MaterialsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
