import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "註冊 | EduMarket",
  description: "建立帳號，探索優質教材。",
  openGraph: { title: "註冊 | EduMarket", description: "建立帳號" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
