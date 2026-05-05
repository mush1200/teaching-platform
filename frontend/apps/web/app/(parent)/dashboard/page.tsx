import { Suspense } from "react";
import { DashboardClient } from "./DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardClient />
    </Suspense>
  );
}

function DashboardFallback() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-8 md:space-y-10">
      <div className="max-h-[200px] h-[140px] rounded-[20px] bg-[#EDE9FE]/50 shadow-[0_1px_3px_rgba(15,23,42,0.06)]" />
      <div className="h-10 rounded-xl bg-white/80 shadow-sm" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-80 rounded-3xl bg-white/95 shadow-sm" />
        ))}
      </div>
    </div>
  );
}
