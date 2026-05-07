import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

type Props = {
  children: ReactNode;
  /** Reserve space for fixed bottom nav on mobile */
  withBottomNav?: boolean;
  className?: string;
};

export function AppShell({ children, withBottomNav, className = "" }: Props) {
  const hasCustomBg = className.includes("bg-");
  return (
    <div
      className={`min-h-dvh font-sans text-[#1F2937] antialiased ${
        hasCustomBg ? "" : "bg-gradient-to-b from-[#F4F1FF] via-[#FAF8FF] to-[#F4F1FF]"
      } ${className}`.trim()}
    >
      <div className={withBottomNav ? "pb-24 md:pb-0" : ""}>{children}</div>
      {withBottomNav ? <BottomNav /> : null}
    </div>
  );
}
