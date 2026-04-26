import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "上傳付款憑證 | EduMarket",
  description: "提交轉帳憑證供管理員審核。",
};

export default function UploadProofLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
