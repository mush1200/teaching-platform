import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#F4F1FF] via-white to-[#F4F1FF] font-sans text-[#1F2937] antialiased">
      <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
