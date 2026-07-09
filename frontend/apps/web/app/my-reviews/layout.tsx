import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的教學回饋 | Teaching Platform",
  description: "查看你對教材留下的星等與教學回饋。",
};

export default function MyReviewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
