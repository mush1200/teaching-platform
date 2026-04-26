import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的評價 | Teaching Platform",
  description: "查看你對教材留下的星等與評論。",
};

export default function MyReviewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
