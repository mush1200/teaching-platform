import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "註冊 | Teaching Platform",
  description: "建立家長或老師帳號以使用教材與購買流程。",
  openGraph: { title: "註冊 | Teaching Platform", description: "建立帳號" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
