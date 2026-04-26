import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登入 | EduMarket",
  description: "登入 EduMarket 繼續學習。",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
