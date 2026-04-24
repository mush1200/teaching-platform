import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "教師教材管理 | Teaching Platform",
  description: "教師後台教材管理：查看、建立與編輯教材。",
};

export default function TeacherMaterialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
