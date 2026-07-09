import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "創作者教材管理 | Teaching Platform",
  description: "創作者後台教材管理：查看、建立與編輯教材。",
};

export default function CreatorMaterialsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
