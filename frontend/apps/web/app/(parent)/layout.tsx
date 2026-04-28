import type { Metadata } from "next";
import { ParentAppShell } from "../../components/dashboard/ParentAppShell";

export const metadata: Metadata = {
  title: "使用者中心 | EduMarket",
  description: "探索優質教材，管理訂單與下載",
};

export default function ParentRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <ParentAppShell>{children}</ParentAppShell>;
}
