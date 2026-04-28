import type { Metadata } from "next";
import { AdminShell } from "../../components/admin/AdminShell";

export const metadata: Metadata = {
  title: "管理後台 | EduMarket",
  description: "EduMarket 管理儀表板與營運工具。",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
