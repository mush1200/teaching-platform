import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "上傳付款憑證 | Teaching Platform",
  description: "提交手動轉帳憑證網址供管理員審核。",
};

export default function UploadProofLayout({ children }: { children: React.ReactNode }) {
  return children;
}
